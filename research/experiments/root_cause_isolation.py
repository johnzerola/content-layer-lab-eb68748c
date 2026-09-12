"""Archive-only stage audit. No inference, pipeline change, or replacement of missing stages."""
import json,subprocess,shutil,time
from pathlib import Path
import cv2,numpy as np
from multi_region_sentinels import sha,SOURCE,B2,MASKS
from fidelity_roi_contract import DECODE_709

ROOT=Path('G:/dowloand/teste/root-cause-isolation-20260911');BASE=Path('G:/dowloand/teste')
PHASE=BASE/'phase-2-3-20260910';MODEL=PHASE/'model/C2-window43'
CASES={'A':(34,0,BASE/'resultado-automatico-v2-contexto-20260909'),
       'B':(88,74,BASE/'resultado-automatico-v2-parcial-20260909'),'C':(120,104,MODEL)}
JOBS=[];CACHE={}

def probe(p):
 return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))

def extract(path,index,rgb=False):
 info=probe(path);s=info['streams'][0];w,h=s['width'],s['height']
 filt=f'select=eq(n\\,{index})'+('' if rgb else ','+DECODE_709)
 cmd=['ffmpeg','-v','error','-threads','2','-filter_threads','1','-i',str(path),'-vf',filt,'-frames:v','1','-f','rawvideo','-pix_fmt','bgr24','pipe:1']
 t=time.perf_counter();a=subprocess.check_output(cmd);JOBS.append({'argv':cmd,'seconds':time.perf_counter()-t})
 if len(a)!=w*h*3:raise ValueError('Frame unavailable')
 return np.frombuffer(a,np.uint8).reshape(h,w,3),info

def main():
 ROOT.mkdir(exist_ok=False);before=sha(B2);evidence={}
 for name,(anchor,start,folder) in CASES.items():
  out=ROOT/name;out.mkdir();entries=[];missing={}
  def keep(stage,img,origin,index,notes='',info=None):
   p=out/f'{index:06d}-{stage}.png';cv2.imwrite(str(p),img)
   if str(origin) not in CACHE and Path(origin).is_file():CACHE[str(origin)]=sha(Path(origin))
   entries.append({'stage':stage,'global_frame':index,'image':str(p.relative_to(ROOT)),
    'origin':str(origin),'origin_sha256':CACHE.get(str(origin)),'png_sha256':sha(p),'shape':list(img.shape),'notes':notes,'probe':info})
  for idx in range(anchor-1,anchor+2):
   src,pr=extract(SOURCE,idx);keep('SOURCE',src,SOURCE,idx,info=pr)
   mp=MASKS/f'{idx:06d}.png';m=cv2.imread(str(mp),0);keep('MASK_COMPOSITE',m,mp,idx)
   b2,pr=extract(B2,idx,True);keep('RGB_COMPOSITE_B2_ARCHIVED',b2,B2,idx,info=pr)
   delivery=PHASE/'candidates/B2-real-donors-clipped-C2/delivery-crf14.mp4'
   im,pr=extract(delivery,idx);keep('DELIVERY_B2_ARCHIVED',im,delivery,idx,'Historical CRF14, audit only; not a new CRF sweep.',pr)
   if name in ['A','B']:
    local=idx-start
    inp=next(folder.glob('inference_region_*/input.mp4'));im,pr=extract(inp,local)
    keep('MODEL_INPUT_FILE',im,inp,idx,'Before upstream spatial rounding; actual tensor not archived.',pr)
    for stage,rel in [('UPSTREAM_MASKED_PREVIEW','propainter-run/input/masked_in.mp4'),('UPSTREAM_OUTPUT_ENCODED','propainter-run/input/inpaint_out.mp4'),('RESTORED_ROI','propainter-native.mp4'),('SCENE_COMPOSITE_DELIVERY','output.mp4')]:
     p=folder/rel;im,pr=extract(p,local);keep(stage,im,p,idx,'Archived decoded MP4, not raw prediction.',pr)
    p=folder/'subtitle-policy/inference-masks'/f'{local:06d}.png';keep('MASK_INFERENCE',cv2.imread(str(p),0),p,idx)
    missing.update(RAW_PROPAINTER_PREDICTION='NOT_ARCHIVED: no tensor/per-window PNG in producing A/B run',
                   MODEL_INPUT_TENSOR='NOT_ARCHIVED: MP4 input and masked preview only',
                   YUV_MASTER_DECODED='NOT_ARCHIVED as a distinct pre-delivery B2 master')
   else:
    local=idx-start
    for stage,p in [('MODEL_INPUT',MODEL/'input'/f'{local:06d}.png'),('MASK_MODEL_INPUT',MODEL/'mask'/f'{local:06d}.png'),('RAW_OUTPUT_UPSTREAM_AGGREGATED',MODEL/'raw-output'/f'{local:06d}.png')]:
     if not p.exists():
      candidates=sorted(p.parent.glob('*.png'));p=candidates[local]
     keep(stage,cv2.imread(str(p),cv2.IMREAD_UNCHANGED),p,idx,'PNG raw-output is aggregated/quantized; not the per-window tensor.')
    for p in sorted((MODEL/'run/raw_predictions').glob('*.npz')):
     with np.load(p) as d:
      ids=d['neighbor_ids'].tolist()
      if local not in ids:continue
      slot=ids.index(local);raw=d['pred_img'][slot]
      dest=out/p.name
      if not dest.exists():shutil.copy2(p,dest)
      # pred_img is RGB, retain numeric tensor and display BGR only for PNG.
      keep(f'RAW_PREDICTION_{p.stem}',np.clip(raw,0,255).astype(np.uint8)[:,:,::-1],p,idx,
           'Per-window RGB float16 before aggregation; NPZ preserved; display quantized to uint8.')
    c2=PHASE/'candidates/C2-window43/master.mp4';im,pr=extract(c2,idx,True);keep('RGB_COMPOSITE_C2_BEFORE_DONORS',im,c2,idx,info=pr)
    yuv=BASE/'extra-global-fidelity-gate-20260911/master-yuv-lossless.mp4';im,pr=extract(yuv,local)
    keep('YUV_MASTER_DECODED_C2_TRANSPORT_CONTROL',im,yuv,idx,'Separate later gate branch, NOT a historical stage of B2.',pr)
    missing['YUV_MASTER_DECODED_B2']='NOT_ARCHIVED as separate pre-delivery YUV master'
  for n in ['manifest.json','inference-region.json','report.json']:
   if (folder/n).is_file():shutil.copy2(folder/n,out/n)
  evidence[name]={'anchor':anchor,'source_global_frames':[anchor-1,anchor,anchor+1],
                  'local_indices':[anchor-1-start,anchor-start,anchor+1-start],'stages':entries,'missing':missing}
  print(name,'archived',len(entries),flush=True)
 # Structural gate only certifies observed portions; masked buckle remains unresolved.
 box=[595,1370,770,1490];x0,y0,x1,y1=box;struct=[]
 for idx in [87,88,89]:
  m=cv2.imread(str(MASKS/f'{idx:06d}.png'),0)>0
  b=cv2.imread(str(ROOT/'B'/f'{idx:06d}-RGB_COMPOSITE_B2_ARCHIVED.png'))
  crop=b[y0:y1,x0:x1];cv2.imwrite(str(ROOT/'B'/f'{idx:06d}-BUCKLE.png'),crop)
  struct.append({'frame':idx,'xyxy':box,'mask_coverage_fraction':float(m[y0:y1,x0:x1].mean()),
                 'geometry_ground_truth_under_text':None,'structural_verdict':'RETEST_MASKED_STRUCTURE',
                 'requirements':['continuous buckle contour','consistent width/height under motion','belt continuity','no duplicate edge or holes','no temporal deformation'],
                 'cannot_pass_from_external_identity':True})
 (ROOT/'buckle-structural-gate.json').write_text(json.dumps(struct,indent=2),encoding='utf-8')
 (ROOT/'stage-evidence.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
 (ROOT/'commands.json').write_text(json.dumps(JOBS,indent=2),encoding='utf-8')
 assert sha(B2)==before
 (ROOT/'baseline-check.json').write_text(json.dumps({'before':before,'after':sha(B2),'pipeline_modified':False},indent=2))

if __name__=='__main__':main()
