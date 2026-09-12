"""Validate sentinel sensitivity and produce review artifacts, without inference."""
import json,subprocess,time
from pathlib import Path
import cv2
import numpy as np
from multi_region_sentinels import ROOT,SCENES,spatial,gate_region,temporal,sha

def main():
 rows=json.loads((ROOT/'measurements.json').read_text())
 # A real source texture patch with controlled degradations validates the rejection mechanism.
 p=ROOT/'crops/C/FABRIC/000120-SOURCE.png';src=cv2.imread(str(p));safe=np.ones(src.shape[:2],bool)
 safe[:6]=False;safe[-6:]=False;safe[:,:6]=False;safe[:,-6:]=False
 variations={'identity':src.copy(),'blur':cv2.GaussianBlur(src,(7,7),1.8),
 'luma_shift':np.clip(src.astype(np.int16)+3,0,255).astype(np.uint8),'chroma_shift':src.copy()}
 variations['chroma_shift'][:,:,0]=np.clip(src[:,:,0].astype(np.int16)+6,0,255).astype(np.uint8)
 checks={k:{'gate':gate_region(spatial(v,src,safe)),'metrics':spatial(v,src,safe)} for k,v in variations.items()}
 assert checks['identity']['gate']=='PASS_EXACT'
 assert all(checks[k]['gate']=='REJECT_EXTERNAL_CHANGE' for k in ['blur','luma_shift','chroma_shift'])
 assert gate_region(None)=='NOT_RUN'
 flicker=temporal(src,variations['luma_shift'],src,src,safe)
 assert flicker['temporal_error_delta_vs_source']>0
 checks['flicker_control']=flicker;checks['missing_candidate']='NOT_RUN'
 (ROOT/'instrument-controls.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
 summary={}
 for s,case in SCENES.items():
  summary[s]={}
  for region in case['regions']:
   group=[r for r in rows if r['scene']==s and r['region']==region]
   info={}
   for role in ['SOURCE','BASELINE','CANDIDATE','BASELINE_ARCHIVED']:
    vals=[r['metrics'][role] for r in group if r['metrics'][role] and r['metrics'][role]['status']=='MEASURED']
    ts=[r['temporal'][role]['temporal_error_delta_vs_source'] for r in group if r['temporal'][role]]
    info[role]={'frames_measured':len(vals),'luma_mean':float(np.mean([v['luma_mean'] for v in vals])) if vals else None,
     'luma_bias_vs_source':float(np.mean([v['luma_bias_vs_source'] for v in vals])) if vals else None,
     'rgb_mae_vs_source':float(np.mean([v['rgb_mae_vs_source'] for v in vals])) if vals else None,
     'max_rgb_error':max([v['rgb_max_vs_source'] for v in vals],default=None),
     'temporal_error_delta_vs_source':float(np.mean(ts)) if ts else None}
   summary[s][region]=info
 (ROOT/'region-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
 # Video copies for human assessment; no video is an input to any metric.
 (ROOT/'comparators').mkdir(exist_ok=True); jobs=[]
 for scene,case in SCENES.items():
  for region in ['INPAINTING_BAND','FACE','FABRIC','OBJECT_EDGE']:
   out=ROOT/'crops'/scene/region
   sample=cv2.imread(str(out/f"{case['start']:06d}-SOURCE.png"));h,w=sample.shape[:2]
   canvas_h=h+32+(h%2);canvas_w=w*3+(w*3%2)
   dst=ROOT/'comparators'/f'{scene}-{region}.mp4'
   cmd=['ffmpeg','-v','error','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{canvas_w}x{canvas_h}',
        '-framerate','30','-i','pipe:0','-an','-vf','scale=out_color_matrix=bt709:in_range=pc:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
        '-c:v','libx264','-preset','slow','-crf','16','-threads','2','-color_primaries','bt709','-color_trc','bt709',
        '-colorspace','bt709','-color_range','tv',str(dst)]
   t=time.perf_counter();proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
   for idx in range(case['start'],case['end']+1):
    frame=np.zeros((canvas_h,canvas_w,3),np.uint8)
    for j,role in enumerate(['SOURCE','BASELINE','CANDIDATE']):
     ip=out/f'{idx:06d}-{role}.png';im=cv2.imread(str(ip)) if ip.exists() else None
     if im is not None:frame[32:32+h,j*w:(j+1)*w]=im
     label=role if role!='CANDIDATE' else ('C2 CONTROL' if im is not None else 'NOT RUN')
     cv2.putText(frame,label,(j*w+3,20),cv2.FONT_HERSHEY_SIMPLEX,.38,(255,255,255),1)
    proc.stdin.write(frame.tobytes())
    if idx==case['anchor']:cv2.imwrite(str(ROOT/'comparators'/f'{scene}-{region}.png'),frame)
   proc.stdin.close();err=proc.stderr.read();assert proc.wait()==0,err
   validation=subprocess.run(['ffmpeg','-v','error','-i',str(dst),'-f','null','-'],capture_output=True)
   assert validation.returncode==0,validation.stderr
   jobs.append({'argv':cmd,'seconds':time.perf_counter()-t,'full_decode_pass':True,'sha256':sha(dst)})
 (ROOT/'comparator-jobs.json').write_text(json.dumps(jobs,indent=2),encoding='utf-8')
 print(json.dumps({'instrument_controls':'PASS','comparators':len(jobs)},indent=2))

if __name__=='__main__':main()
