"""Read-only lab sentinels. Candidate slot is never filled with a missing engine."""
from __future__ import annotations
import hashlib,json,subprocess,time
from pathlib import Path
import cv2
import numpy as np
from fidelity_roi_contract import DECODE_709

ROOT=Path('G:/dowloand/teste/multi-region-sentinels-20260911')
SOURCE=Path('G:/dowloand/teste/padro-01-001 (15).mp4')
B2=Path('G:/dowloand/teste/phase-5-20260911/baseline/B2-finish-OFF-rgb-lossless.mp4')
MASKS=Path('G:/dowloand/teste/phase-2-3-20260910/phase2/masks')
C2=Path('G:/dowloand/teste/extra-global-fidelity-gate-20260911/rgb-composite')
W,H=1080,1920
COMMANDS=[]
# Fixed spatial patches, manually located on SOURCE. No claim of semantic tracking.
SCENES={
 'A':{'start':28,'end':45,'anchor':34,'regions':{
 'FACE':[160,1040,270,1160],'HAIR':[60,995,175,1050],
 'SKIN':[730,900,790,950],'FABRIC':[700,1010,840,1140],
 'SMOOTH_BACKGROUND':[100,650,300,820],'TEXTURED_BACKGROUND':[470,905,615,1080],
 'DARK_AREA':[620,585,770,675],'BRIGHT_AREA':[345,1505,465,1570],
 'OBJECT_EDGE':[385,1120,455,1290],'INPAINTING_BAND':[350,1370,940,1540]}},
 'B':{'start':80,'end':97,'anchor':88,'regions':{
 'FACE':[500,690,650,830],'HAIR':[505,570,640,640],
 'SKIN':[420,1130,455,1170],'FABRIC':[400,980,520,1090],
 'TEXTURED_BACKGROUND':[70,675,280,850],'DARK_AREA':[360,970,420,1060],
 'BRIGHT_AREA':[875,635,990,790],'OBJECT_EDGE':[810,890,900,980],
 'INPAINTING_BAND':[350,1370,820,1510]}},
 'C':{'start':112,'end':129,'anchor':120,'regions':{
 'FACE':[355,760,650,1090],'HAIR':[755,735,830,1030],
 'SKIN':[380,670,505,735],'FABRIC':[730,1530,900,1610],
 'SMOOTH_BACKGROUND':[60,570,205,665],'DARK_AREA':[715,635,790,715],
 'BRIGHT_AREA':[365,710,430,755],'OBJECT_EDGE':[170,1090,225,1240],
 'INPAINTING_BAND':[330,1370,765,1510]}}
}

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()

def write(name,data):
 (ROOT/name).write_text(json.dumps(data,indent=2,allow_nan=False),encoding='utf-8')

def stream(path,start,end,rgb=False):
 filters=f'select=between(n\\,{start}\\,{end})'
 if not rgb:filters+=','+DECODE_709
 cmd=['ffmpeg','-v','error','-threads','2','-filter_threads','1','-i',str(path),'-vf',filters,
      '-fps_mode','passthrough','-frames:v',str(end-start+1),'-pix_fmt','bgr24','-f','rawvideo','pipe:1']
 COMMANDS.append(cmd)
 return subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)

def read_frame(proc):
 size=W*H*3;parts=[];n=0
 while n<size:
  b=proc.stdout.read(size-n)
  if not b:raise RuntimeError('Truncated video')
  parts.append(b);n+=len(b)
 return np.frombuffer(b''.join(parts),np.uint8).reshape(H,W,3)

def luma(a):
 a=a.astype(np.float32);return a[:,:,0]*.0722+a[:,:,1]*.7152+a[:,:,2]*.2126

def features(a):
 y=luma(a);b=a[:,:,0].astype(np.float32);r=a[:,:,2].astype(np.float32)
 cb=(b-y)/1.8556;cr=(r-y)/1.5748
 gx=cv2.Sobel(y,cv2.CV_32F,1,0,ksize=3)/8;gy=cv2.Sobel(y,cv2.CV_32F,0,1,ksize=3)/8
 grad=np.hypot(gx,gy);hf=y-cv2.GaussianBlur(y,(5,5),1)
 edges=cv2.Canny(np.clip(y,0,255).astype(np.uint8),40,80)>0
 return y,cb,cr,grad,hf,edges

def spatial(a,ref,safe):
 if int(safe.sum())<32:return {'status':'INSUFFICIENT_UNMASKED_SUPPORT','pixels':int(safe.sum())}
 f=features(a);s=features(ref)
 e=s[5]&safe;h=f[5]&safe
 def avg(x):return float(x[safe].mean())
 edge_recall=float((h&e).sum()/e.sum()) if e.any() else None
 mae=float(np.abs(a.astype(np.float32)-ref)[safe].mean())
 return {'status':'MEASURED','pixels':int(safe.sum()),'luma_mean':avg(f[0]),'luma_std':float(f[0][safe].std()),
 'chroma_cb_mean':avg(f[1]),'chroma_cr_mean':avg(f[2]),'chroma_magnitude_mean':avg(np.hypot(f[1],f[2])),
 'gradient_mean':avg(f[3]),'high_frequency_energy':avg(f[4]**2),'edge_density':avg(f[5].astype(np.float32)),
 'edge_preservation_recall':edge_recall,'edge_preservation_precision':float((h&e).sum()/h.sum()) if h.any() else None,
 'luma_bias_vs_source':avg(f[0]-s[0]),'chroma_cb_mae_vs_source':avg(abs(f[1]-s[1])),
 'chroma_cr_mae_vs_source':avg(abs(f[2]-s[2])),
 'rgb_mae_vs_source':mae,'rgb_max_vs_source':int(np.abs(a.astype(np.int16)-ref)[safe].max()),
 'gradient_ratio_vs_source':avg(f[3])/avg(s[3]) if avg(s[3])>1e-8 else None,
 'hf_ratio_vs_source':avg(f[4]**2)/avg(s[4]**2) if avg(s[4]**2)>1e-8 else None}

def temporal(prev,cur,ps,cs,safe):
 # Error-difference cancels the real scene's change; fixed-coordinate proxy, not flow/flicker certification.
 if prev is None or safe.sum()<32:return None
 yp,yc=luma(prev),luma(cur); sp,sc=luma(ps),luma(cs)
 return {'raw_luma_frame_change':float(abs(yc-yp)[safe].mean()),
 'temporal_error_delta_vs_source':float(abs((yc-sc)-(yp-sp))[safe].mean()),
 'method':'consecutive_fixed_coordinates_source_relative_no_flow', 'flicker_perceptual_verdict':None}

def gate_region(metrics):
 # Master-only gate: an improvement elsewhere cannot compensate for any changed protected pixel.
 if metrics is None:return 'NOT_RUN'
 if metrics.get('status')!='MEASURED':return 'RETEST_COVERAGE'
 return 'PASS_EXACT' if metrics['rgb_max_vs_source']==0 else 'REJECT_EXTERNAL_CHANGE'

def main():
 begun=time.perf_counter();ROOT.mkdir(exist_ok=True); before=sha(B2)
 manifest={'version':1,'width':W,'height':H,'fps':'30/1','scenes':SCENES,
 'regions_are':'fixed_spatial_patches_no_semantic_tracking','guard_pixels':6,
 'baseline_role':'B2_RECOMPOSED_ON_APPROVED_SOURCE_RGB_MASTER_NO_FINISH',
 'baseline_archived_role':'B2_RGB_UNCHANGED_DIAGNOSTIC_ONLY_DIFFERENT_HISTORICAL_DECODE',
 'candidate_role':'C2_TRANSPORT_CONTROL_ONLY_SCENE_C_NOT_DIFFUERASER',
 'diffueraser':{'status':'NOT_RUN_RUNTIME_BLOCKED','metrics':None},
 'master_gate':'Any external RGB change rejects; all regions required; missing candidate never PASS',
 'delivery_gate':'NOT_RUN_REQUIRES_IDENTICAL_DELIVERY_CONTRACT_FOR_BOTH_ENGINES',
 'temporal_method':'source-relative consecutive fixed-coordinate residual; not motion compensated',
 'source_sha256':sha(SOURCE),'baseline_sha256':before,'decode':DECODE_709}
 write('manifest.json',manifest)
 records=[];hashes=[]
 for scene,case in SCENES.items():
  a=stream(SOURCE,case['start'],case['end']);b=stream(B2,case['start'],case['end'],True)
  previous={}
  try:
   for idx in range(case['start'],case['end']+1):
    src=read_frame(a);arch=read_frame(b);mp=MASKS/f'{idx:06d}.png';mask=cv2.imread(str(mp),0)
    if mask is None or mask.shape!=(H,W):raise ValueError('Missing/wrong real mask')
    mask=mask>0;base=src.copy();base[mask]=arch[mask]
    cand=cv2.imread(str(C2/f'{idx:06d}.png')) if scene=='C' else None
    if cand is not None and cand.shape!=src.shape:raise ValueError('Candidate geometry mismatch')
    excluded=cv2.dilate(mask.astype(np.uint8),np.ones((13,13),np.uint8))>0
    overlay=src.copy()
    for region,box in case['regions'].items():
     x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1];safe=~excluded[sl];safe=safe.copy()
     safe[:6]=False;safe[-6:]=False;safe[:,:6]=False;safe[:,-6:]=False
     values={'SOURCE':src[sl],'BASELINE':base[sl],'CANDIDATE':cand[sl] if cand is not None else None,
             'BASELINE_ARCHIVED':arch[sl]}
     out=ROOT/'crops'/scene/region;out.mkdir(parents=True,exist_ok=True)
     metrics={};times={};prev=previous.get(region)
     for role,img in values.items():
      if img is None:metrics[role]=None;times[role]=None;continue
      p=out/f'{idx:06d}-{role}.png';cv2.imwrite(str(p),img)
      hashes.append({'path':str(p.relative_to(ROOT)),'sha256':sha(p)})
      metrics[role]=spatial(img,src[sl],safe)
      both=safe & prev['safe'] if prev else safe
      times[role]=temporal(prev['values'][role],img,prev['values']['SOURCE'],src[sl],both) if prev and prev['values'][role] is not None else None
     rec={'scene':scene,'frame':idx,'region':region,'xyxy':box,'role':'RECONSTRUCTION_DIAGNOSTIC' if region=='INPAINTING_BAND' else 'FIDELITY_SENTINEL',
          'mask_overlap_pixels':int(mask[sl].sum()),'external_safe_pixels':int(safe.sum()),'metrics':metrics,'temporal':times,
          'candidate_master_gate':gate_region(metrics['CANDIDATE'])}
     if region=='INPAINTING_BAND':
      # SOURCE contains text: masked-region statistics are descriptive only, never fidelity scores.
      rec['masked_luma_and_hf_descriptors']={role:{'luma_mean':float(luma(im)[mask[sl]].mean()),
          'high_frequency_energy':float((features(im)[4][mask[sl]]**2).mean())} if im is not None and mask[sl].any() else None for role,im in values.items()}
      rec['masked_reconstruction_quality_vs_source']=None
     records.append(rec);previous[region]={'safe':safe,'values':{k:v.copy() if v is not None else None for k,v in values.items()}}
     if idx==case['anchor']:
      color=(40,180,255) if region=='INPAINTING_BAND' else (70,255,90)
      cv2.rectangle(overlay,(x0,y0),(x1,y1),color,2);cv2.putText(overlay,region,(x0,y0-6),cv2.FONT_HERSHEY_SIMPLEX,.48,color,1)
    if idx==case['anchor']:cv2.imwrite(str(ROOT/f'{scene}-sentinel-map.png'),overlay)
    if idx%6==0:print(scene,idx,flush=True)
  finally:
   for p in (a,b):
    p.stdout.close();err=p.stderr.read();code=p.wait(timeout=30)
    if code:raise RuntimeError(err.decode(errors='replace'))
  write('measurements.json',records)
 write('commands.json',COMMANDS);write('crop-hashes.json',hashes)
 assert sha(B2)==before
 measured=[r for r in records if r['role']=='FIDELITY_SENTINEL' and r['metrics']['CANDIDATE'] is not None]
 summary={'scenes':3,'consecutive_frames_per_scene':18,'frames':54,'region_frames':len(records),
 'candidate_region_frames_measured':len(measured),'candidate_external_gate_counts':{k:sum(r['candidate_master_gate']==k for r in measured) for k in ['PASS_EXACT','REJECT_EXTERNAL_CHANGE','RETEST_COVERAGE']},
 'baseline_immutable':True,'elapsed_seconds':time.perf_counter()-begun,'cloud_cost_usd':0,
 'neural_comparison_verdict':'NOT_RUN_DIFFUERASER_MISSING','finish':'OFF','production_changes':False}
 write('summary.json',summary);print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
