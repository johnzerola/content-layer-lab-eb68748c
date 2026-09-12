"""One isolated RunPod capability probe, with owned resources removed on exit."""
import json
from pathlib import Path
import sys
import time
import requests

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend/scripts'))
from audit_runpod_costs import read_env

def main():
    values=read_env(Path('.env.local'))
    session=requests.Session()
    session.headers['Authorization']='Bearer '+values['RUNPOD_API_KEY']
    rest='https://rest.runpod.io/v1'
    target=Path('research/benchmarks/runs')/('phase3-cloud-probe-'+str(time.time_ns()))
    target.mkdir(parents=True,exist_ok=False)
    report={'status':'preparing','template_id':None,'endpoint_id':None,'job_id':None,
            'cleanup_errors':[], 'quality_verdict':None,'cost_usd':None}
    def save(): (target/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    def call(method,url,**kwargs):
        r=session.request(method,url,timeout=(10,30),**kwargs)
        if not r.ok: raise RuntimeError(f'{method} {url.split("/")[-1]} HTTP {r.status_code}')
        return r.json() if r.content else {}
    try:
        original=call('GET',rest+'/endpoints/'+values['RUNPOD_ENDPOINT_ID'])
        template=call('GET',rest+'/templates/'+original['templateId'])
        config={k:template[k] for k in ('env','containerRegistryAuthId') if k in template}
        config.update(name='cleaneria-phase3-isolated-probe',isServerless=True,isPublic=False,
                      imageName='nivaldo12/leaneria-runpod@sha256:6211f0368323f3647df796aa18f40d7807d1d148f1236a36f96723ef079dc7c8',
                      containerDiskInGb=80,volumeInGb=0,volumeMountPath='/workspace')
        report['template_id']=call('POST',rest+'/templates',json=config)['id'];save()
        report['endpoint_id']=call('POST',rest+'/endpoints',json={
            'name':'cleaneria-phase3-isolated-probe','templateId':report['template_id'],
            'computeType':'GPU','gpuCount':1,'gpuTypeIds':['NVIDIA GeForce RTX 4090','NVIDIA GeForce RTX 3090','NVIDIA RTX A5000'],
            'workersMin':0,'workersMax':1,'idleTimeout':5,'executionTimeoutMs':60000})['id'];save()
        api='https://api.runpod.ai/v2/'+report['endpoint_id']
        # Control-plane creation precedes availability on the queue API.
        # Probe only GET while waiting; never blindly retry an accepted POST.
        report['queue_readiness']=[]
        for attempt in range(12):
            ready=session.get(api+'/health',timeout=(10,30))
            report['queue_readiness'].append(ready.status_code);save()
            if ready.ok:
                break
            if ready.status_code not in (403,404,503):
                raise RuntimeError(f'Queue health HTTP {ready.status_code}')
            print('Waiting for queue endpoint propagation:',ready.status_code,flush=True)
            time.sleep(5)
        else:
            raise RuntimeError('Queue endpoint not accessible within 60 seconds')
        reply=call('POST',api+'/run',json={'input':{'action':'health'},'policy':{'executionTimeout':60000,'ttl':180000}})
        report.update(job_id=reply['id'],status='waiting');save()
        deadline=time.monotonic()+180
        while time.monotonic()<deadline:
            d=call('GET',api+'/status/'+report['job_id'])
            print('Probe:',d.get('status'),flush=True)
            if d.get('status')=='COMPLETED':
                output=d.get('output') or {}
                report.update(status='completed',capabilities={k:output.get(k) for k in ('ok','gpu_name','gpu_vram_gb','pipeline_revision','ai_ready','max_ready')},
                              provider_execution_ms=d.get('executionTime'),provider_delay_ms=d.get('delayTime'))
                break
            if d.get('status') in ('FAILED','CANCELLED','TIMED_OUT'):
                report['status']=d['status'];break
            time.sleep(10)
        else:report['status']='deadline_reached'
    except Exception as e:
        report.update(status='failed',error=str(e) if isinstance(e,RuntimeError) else type(e).__name__)
    finally:
        endpoint=report['endpoint_id']
        if endpoint:
            if report['job_id']:
                try:call('POST','https://api.runpod.ai/v2/'+endpoint+'/cancel/'+report['job_id'],json={})
                except Exception:report['cleanup_errors'].append('cancel_not_confirmed')
            try:
                call('PATCH',rest+'/endpoints/'+endpoint,json={'workersMin':0,'workersMax':0})
                report['zero_capacity']=True
            except Exception:report['cleanup_errors'].append('zero_capacity_not_confirmed')
            try:call('DELETE',rest+'/endpoints/'+endpoint);report['endpoint_deleted']=True
            except Exception:report['cleanup_errors'].append('endpoint_delete_not_confirmed')
        if report['template_id']:
            try:call('DELETE',rest+'/templates/'+report['template_id']);report['template_deleted']=True
            except Exception:report['cleanup_errors'].append('template_delete_not_confirmed')
        save()
    print(json.dumps(report),flush=True)

if __name__=='__main__':main()
