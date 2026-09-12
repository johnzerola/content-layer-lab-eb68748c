"""Measurements and labeled stage sheets; never synthesize a missing raw stage."""
import json
from pathlib import Path
import cv2,numpy as np
from root_cause_isolation import ROOT
from multi_region_sentinels import luma,sha

def seam(img,src,m):
 e=luma(img)-luma(src)
 bx=m[:,1:]!=m[:,:-1];by=m[1:]!=m[:-1]
 vals=np.concatenate([abs(e[:,1:]-e[:,:-1])[bx],abs(e[1:]-e[:-1])[by]])
 return {'mean_source_relative_boundary_step':float(vals.mean()),'p95':float(np.percentile(vals,95)),'edges':len(vals)}

def main():
 data=json.loads((ROOT/'stage-evidence.json').read_text());stats=[]
 for s,case in data.items():
  idx=case['anchor'];directory=ROOT/s
  for i in case['source_global_frames']:
   src=cv2.imread(str(directory/f'{i:06d}-SOURCE.png'));m=cv2.imread(str(directory/f'{i:06d}-MASK_COMPOSITE.png'),0)>0
   row={'case':s,'frame':i,'mask_bbox':None,'mask_pixels':int(m.sum())}
   yy,xx=np.where(m);row['mask_bbox']=[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]
   for stage in ['RESTORED_ROI','RGB_COMPOSITE_B2_ARCHIVED','DELIVERY_B2_ARCHIVED']:
    p=directory/f'{i:06d}-{stage}.png'
    if p.exists():row[stage]=seam(cv2.imread(str(p)),src,m)
   if s!='C':
    inf=cv2.imread(str(directory/f'{i:06d}-MASK_INFERENCE.png'),0)>0
    row['inference_mask_pixels']=int(inf.sum());row['inference_vs_composite_xor_pixels']=int((inf!=m).sum())
   stats.append(row)
  # Native stage crops. Model-space images retain native size; no resizing to imply identity.
  box={'A':[270,1370,840,1530],'B':[350,1370,820,1530],'C':[330,1370,800,1530]}[s]
  x0,y0,x1,y1=box
  stages=[r for r in case['stages'] if r['global_frame']==idx]
  tiles=[]
  for rec in stages:
   im=cv2.imread(str(ROOT/rec['image']))
   if im.shape[:2]==(1920,1080):im=im[y0:y1,x0:x1]
   tile=np.zeros((max(330,im.shape[0]+40),max(850,im.shape[1]),3),np.uint8)
   tile[40:40+im.shape[0],:im.shape[1]]=im
   cv2.putText(tile,rec['stage'],(8,24),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1)
   tiles.append(tile)
  canvas=np.zeros((sum(t.shape[0] for t in tiles),max(t.shape[1] for t in tiles),3),np.uint8);y=0
  for t in tiles:canvas[y:y+t.shape[0],:t.shape[1]]=t;y+=t.shape[0]
  cv2.imwrite(str(ROOT/f'{s}-stage-sheet.png'),canvas)
 (ROOT/'boundary-measurements.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
 print(json.dumps(stats,indent=2))

if __name__=='__main__':main()
