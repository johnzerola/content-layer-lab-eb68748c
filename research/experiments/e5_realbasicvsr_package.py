"""Package/import completed frozen E5 outputs without new inference."""
from pathlib import Path
import sys,json,shutil,subprocess
import numpy as np, cv2
REPO=Path(__file__).resolve().parents[2]
R=Path('G:/dowloand/teste/cleaner-e5-realbasicvsr-20260913')
B=R.parent/'cleaner-e5-synthetic-decompression-gt-20260913'
sys.path.insert(0,str(B));import run_experiment as b
sys.path.insert(0,str(REPO/'research'))
from lab.benchmark import import_result,compare_results

def main():
    data=json.loads((R/'result.json').read_text());contract=json.loads((R/'contract.json').read_text())
    case_root=REPO/'research/benchmarks/data/e5-realbasicvsr-20260913'
    assert not case_root.exists(),'frozen harness cases already exist'
    records={}; comparisons={};pts={}
    for name,(start,end) in b.CLIPS.items():
        case=case_root/name
        for d in ('input','mask','gt','candidate'):(case/d).mkdir(parents=True,exist_ok=True)
        gt=b.decode(B/name/'gt.mkv');degraded=b.decode(B/name/'degraded.mkv')
        for i,(g,d) in enumerate(zip(gt,degraded)):
            fname=f'{start+i:06d}.png'
            cv2.imwrite(str(case/'input'/fname),d);cv2.imwrite(str(case/'gt'/fname),g)
            cv2.imwrite(str(case/'mask'/fname),np.full((420,600),255,np.uint8))
            shutil.copy2(R/name/'frames'/fname,case/'candidate'/fname)
        b.dump(case/'case.json',{'id':f'e5-realbasicvsr-{name}','kind':'synthetic_additional_degradation_relative_source_gt',
            'categories':[name,'global_restoration'],'fps':30,'frames':24,'input':'input','mask':'mask','ground_truth':'gt',
            'scene_cuts':[],'rights':'user-provided lab media, research only','evaluation_mask':'full crop, not subtitle mask'})
        rel=case.relative_to(REPO/'research/benchmarks').as_posix();reports=[]
        for arm,engine in [('input','degraded identity evaluation baseline'),('candidate','RealBasicVSR_x4_area_native_FP32_test5')]:
            reports.append(import_result(f'{rel}/case.json',f'{rel}/{arm}',engine,[str(R/'contract.json'),str(R/'result.json'),'Explicit x4 float area to native evaluation; no input resize; auxiliary harness metrics do not replace frozen E5 gates.']))
        records[name]=reports
        # compare_results accepts paths relative to benchmark root.
        report_paths=[Path(x['report_path']).relative_to('research/benchmarks').as_posix() for x in reports]
        comparisons[name]=compare_results(report_paths)
        streams=[]
        for path in (B/name/'gt.mkv',B/name/'degraded.mkv',R/name/'restored.mkv'):
            probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,pix_fmt:frame=best_effort_timestamp_time','-of','json',str(path)]))
            streams.append(probe)
        assert streams[0]==streams[1]==streams[2],name
        pts[name]={'all_pts_geometry_fps_equal':True,'frames':len(streams[0]['frames']),'stream':streams[0]['streams']}
    b.dump(R/'harness-import.json',records);b.dump(R/'harness-comparisons.json',comparisons);b.dump(R/'geometry-pts.json',pts)
    html='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Cleaner E5 RealBasicVSR</title><style>body{font:17px system-ui;background:#111a20;color:#eee;margin:24px}a{color:#8edcff}video,img{display:block;max-width:100%}button,select{font:inherit;padding:8px;margin:4px}.native video,.native img{max-width:none}td,th{padding:10px;border:1px solid #788}table{border-collapse:collapse}</style><h1>E5 — RealBasicVSR x4 → média de área nativa</h1><p>GT relativo já comprimido. Entrada 600×420 intacta; raw neural 2400×1680 arquivado e integrado por área para avaliação 600×420. Nenhuma afirmação de detalhe 4× verdadeiro. Ordem dos painéis: GT / degradado acima, candidato / DIS abaixo.</p><p><a href="REPORT.md">Relatório</a> · <a href="result.json">Métricas</a> · <a href="contract.json">Contrato</a></p><button onclick="document.body.classList.toggle('native')">Pixels nativos</button>'''
    for name,(start,end) in b.CLIPS.items():
        c=data['clips'][name];d=c['means']['degraded'];r=c['means']['restored']
        html+=f'<h2>{name}: {c["decision"]}</h2><p>PSNR {r["psnr_db"]-d["psnr_db"]:+.3f} dB; detalhe/degradado {r["highpass_std"]/d["highpass_std"]:.3f}.</p><video id="{name}" src="{name}/comparison.mp4" controls muted loop></video><select aria-label="Velocidade {name}" onchange="document.getElementById(\'{name}\').playbackRate=Number(this.value)"><option value="1">1×</option><option value="0.5">0,5×</option><option value="0.25">0,25×</option></select><details><summary>PNGs sem perdas</summary>'
        for i in (start,start+12,end-1):html+=f'<img src="{name}/critical-{i}.png" alt="Comparação SOURCE {i}">'
        html+='</details>'
    html+='<p>Revisão perceptual contínua pendente. A prévia H.264 contém perdas; métricas usam PNGs/FFV1. Não há melhoria comercial aprovada.</p></html>'
    (R/'comparison.html').write_text(html,encoding='utf-8')
    print(json.dumps({'imports':{k:[x['report_path'] for x in v] for k,v in records.items()},'PTS':'PASS'}),flush=True)

if __name__=='__main__':main()
