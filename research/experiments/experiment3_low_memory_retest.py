"""Isolated FP16 loading-policy retest, unchanged upstream/weights, RAM guarded."""
import argparse,json,os,subprocess,sys,time,traceback
from pathlib import Path
from experiment3_preflight import sample,sha,UPSTREAM,MODEL,RUNTIME,BASELINE,EXPECTED_B2
OUT=Path('G:/dowloand/teste/root-cause-isolation-20260911/diffueraser-retest')

def save(name,data):
 (OUT/name).write_text(json.dumps(data,indent=2),encoding='utf-8')

def worker():
 state={'status':'IMPORTING','video_inference_completed':False,'policy':'FP16 low_cpu_mem_usage direct component GPU placement, no quantization','events':[]}
 def checkpoint(status):
  state['status']=status;save('stage.json',state);print(status,flush=True)
 try:
  import torch
  torch.set_num_threads(2)
  a=torch.eye(16,device='cuda');assert torch.equal(a@a,a);del a;torch.cuda.synchronize()
  state.update(torch=torch.__version__,cuda=torch.version.cuda,gpu=torch.cuda.get_device_name(0))
  checkpoint('CUDA_MINIMAL_OPERATION_PASS')
  sys.path.insert(0,str(UPSTREAM))
  from diffueraser import diffueraser as module
  from transformers import CLIPTextModel
  from diffusers.pipelines.stable_diffusion.safety_checker import StableDiffusionSafetyChecker
  # Bound original constructors are retained. Overrides live only in this child process.
  def wrap(cls,gpu=True):
   original=cls.from_pretrained
   def load(inner_cls,*args,**kwargs):
    kwargs.update(torch_dtype=torch.float16,low_cpu_mem_usage=True)
    if gpu:kwargs['device_map']={'':'cuda'}
    state['events'].append({'component':cls.__name__,'dtype':'float16','device_map':kwargs.get('device_map')})
    checkpoint('LOADING_'+cls.__name__)
    result=original(*args,**kwargs)
    return result
   cls.from_pretrained=classmethod(load)
  for cls in [module.AutoencoderKL,module.BrushNetModel,module.UNetMotionModel,CLIPTextModel,StableDiffusionSafetyChecker]:wrap(cls)
  wrap(module.StableDiffusionDiffuEraserPipeline,False)
  checkpoint('MODEL_INITIALIZATION_STARTED')
  model=module.DiffuEraser(torch.device('cuda'),str(MODEL/'stable-diffusion-v1-5'),str(MODEL/'sd-vae-ft-mse'),str(MODEL/'diffuEraser'),ckpt='2-Step')
  torch.cuda.synchronize()
  state.update(allocated=torch.cuda.memory_allocated(),peak_allocated=torch.cuda.max_memory_allocated())
  checkpoint('INITIALIZATION_COMPLETE_VIDEO_INFERENCE_NOT_RUN')
  del model
 except BaseException as e:
  state['error']=f'{type(e).__name__}: {e}';checkpoint('FAILED');traceback.print_exc();raise

def monitor():
 OUT.mkdir(exist_ok=False);assert sha(BASELINE)==EXPECTED_B2
 code=sha(UPSTREAM/'diffueraser/diffueraser.py');env=os.environ.copy()
 env.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',PYTHONUNBUFFERED='1',OMP_NUM_THREADS='2')
 cmd=[str(RUNTIME/'diffueraser-env/Scripts/python.exe'),str(Path(__file__).resolve()),'--worker']
 report={'argv':cmd,'ram_floor_bytes':1024**3,'timeout_seconds':300,'cloud_cost_usd':0,'samples':[],'video_inference_completed':False}
 begun=time.perf_counter();reason=None
 with (OUT/'runtime.log').open('w',encoding='utf-8') as log:
  proc=subprocess.Popen(cmd,cwd=UPSTREAM,env=env,stdout=log,stderr=subprocess.STDOUT)
  try:
   while proc.poll() is None:
    s=sample();report['samples'].append(s);save('monitor.json',report)
    if s['available_ram_bytes']<1024**3:reason='RAM_GUARD_ABORT';break
    if time.perf_counter()-begun>300:reason='TIMEOUT';break
    time.sleep(1)
  finally:
   if proc.poll() is None:
    proc.terminate()
    try:proc.wait(timeout=10)
    except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=10)
 report.update(stop_reason=reason or 'PROCESS_EXIT',returncode=proc.returncode,elapsed_seconds=time.perf_counter()-begun,
  upstream_code_unchanged=sha(UPSTREAM/'diffueraser/diffueraser.py')==code,baseline_unchanged=sha(BASELINE)==EXPECTED_B2)
 save('monitor.json',report);print(json.dumps({k:v for k,v in report.items() if k!='samples'},indent=2))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--worker',action='store_true');a=p.parse_args()
 worker() if a.worker else monitor()
