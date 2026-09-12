"""Prepare source-only evidence and fixed-version license documents for Experiment 3.

No inference, no modification of existing inputs, no commercial frames consumed.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import time
import urllib.request

OUT = Path('G:/dowloand/teste/experiment-3-alternative-inpainting-20260911')
SRC = Path('G:/dowloand/teste/padro-01-001 (15).mp4')

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024), b''): h.update(b)
    return h.hexdigest()

def main():
    OUT.mkdir(exist_ok=True,parents=True)
    docs=OUT/'license-evidence'; docs.mkdir(exist_ok=True)
    revision='8e6f279ac7531e27ad1849c6f8dab5372a8597e7'
    urls={
      'DiffuEraser-LICENSE':f'https://raw.githubusercontent.com/lixiaowen-xw/DiffuEraser/{revision}/LICENSE',
      'DiffuEraser-README':f'https://raw.githubusercontent.com/lixiaowen-xw/DiffuEraser/{revision}/README.md',
      'DiffuEraser-card':'https://huggingface.co/lixiaowen/diffuEraser/raw/ad510dca07fa8e155d4bd8d002085bb8ec8f60e5/README.md',
      'PCM-card':'https://huggingface.co/wangfuyun/PCM_Weights/raw/39560fead4ce00f94db3cb8e93dd8fba90ec0be6/README.md',
      'VAE-card':'https://huggingface.co/stabilityai/sd-vae-ft-mse/raw/31f26fdeee1355a5c34592e401dd41e45d25a493/README.md',
      'SD15-card':'https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/raw/451f4fe16113bff5a5d2269ed5ad43b0592e9a14/README.md',
      'SD15-LICENSE':'https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/raw/451f4fe16113bff5a5d2269ed5ad43b0592e9a14/LICENSE',
      'ProPainter-LICENSE':'https://raw.githubusercontent.com/sczhou/ProPainter/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/LICENSE',
    }
    evidence=[]
    for name,url in urls.items():
        row={'name':name,'url':url,'retrieved_unix':time.time()}
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'CleanerIA-Local-Research'})
            with urllib.request.urlopen(req,timeout=30) as r: data=r.read()
            p=docs/(name+'.txt'); p.write_bytes(data)
            row.update(sha256=sha(p),bytes=len(data))
        except Exception as e: row['error']=str(e)
        evidence.append(row)
    # Pin code-only licenses independently; do not transfer these to unknown weights.
    for repo in ['G-U-N/Phased-Consistency-Model','TencentARC/BrushNet']:
        row={'repository':repo,'purpose':'code license only','retrieved_unix':time.time()}
        try:
            def get(url):
                req=urllib.request.Request(url,headers={'User-Agent':'CleanerIA-Local-Research'})
                with urllib.request.urlopen(req,timeout=30) as r: return r.read()
            info=json.loads(get('https://api.github.com/repos/'+repo+'/commits?per_page=1'))
            rev=info[0]['sha']; url=f'https://raw.githubusercontent.com/{repo}/{rev}/LICENSE'
            data=get(url); p=docs/(repo.split('/')[-1]+'-LICENSE.txt'); p.write_bytes(data)
            row.update(revision=rev,url=url,sha256=sha(p))
        except Exception as e: row['error']=str(e)
        evidence.append(row)
    (docs/'sources.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
    print('License evidence archived',flush=True)
    # Source contact sheet is a navigation aid only, not a quality comparison.
    import cv2
    import numpy as np
    cap=cv2.VideoCapture(str(SRC))
    indices=[0,30,60,73,74,85,103,104,120,146,180,198,199,240,300,360,450,540,660,780,900,1050,1200,1350,1500,1650,1800,1950,2100,2250,2400]
    tw,th=240,282; columns=5
    sheet=np.zeros((((len(indices)+columns-1)//columns)*th,tw*columns,3),np.uint8)
    for j,index in enumerate(indices):
        cap.set(cv2.CAP_PROP_POS_FRAMES,index); ok,frame=cap.read()
        if not ok: continue
        tile=cv2.resize(frame[540:1660,25:1055],(tw,260),interpolation=cv2.INTER_AREA)
        y=(j//columns)*th; x=(j%columns)*tw
        sheet[y:y+260,x:x+tw]=tile
        cv2.putText(sheet,f'SOURCE {index} / {index/30:.2f}s',(x+5,y+276),cv2.FONT_HERSHEY_SIMPLEX,.45,(255,255,255),1)
    cap.release(); cv2.imwrite(str(OUT/'source-scene-index.jpg'),sheet)
    # Known GT crop native grid: same synthetic stripe, twelve scored targets.
    # Add actual context to reach upstream minimum 22 frames; do not duplicate targets.
    gt=OUT/'gt-prepared'; gt.mkdir(exist_ok=True)
    pngs=gt/'source'; masks=gt/'mask'; pngs.mkdir(exist_ok=True); masks.mkdir(exist_ok=True)
    filt="select='between(n,112,133)',scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=bgr24,crop=820:410:130:1240"
    cmd=['ffmpeg','-v','error','-threads','2','-i',str(SRC),'-vf',filt,'-fps_mode','passthrough','-frames:v','22','-start_number','112',str(pngs/'%06d.png')]
    t=time.perf_counter(); subprocess.run(cmd,check=True,timeout=120)
    hashes=[]
    oldmaskroot=Path('G:/dowloand/teste/phase-2-3-20260910/donors/primary/source-masks')
    for index in range(112,134):
        p=pngs/f'{index:06d}.png'; im=cv2.imread(str(p)); assert im.shape==(410,820,3)
        old=oldmaskroot/f'{index:06d}.png'; mask=cv2.imread(str(old),0)
        assert mask.shape==(410,820)
        # Union with same artificial stripe, including context frames to avoid GT leakage.
        mask[295:345,270:590]=255
        m=masks/p.name; cv2.imwrite(str(m),mask)
        hashes.append({'source_frame':index,'rgb_sha256':sha(p),'mask_sha256':sha(m),'original_mask_sha256':sha(old)})
    manifest={'source':str(SRC),'source_sha256':sha(SRC),'source_frames':[112,133],
              'scored_targets':list(range(118,130)),'gt_rect_xyxy':[270,295,590,345],
              'crop_xywh':[130,1240,820,410],'required_padding_grid':[824,416],
              'decode_command':cmd,'prepare_seconds':time.perf_counter()-t,'hashes':hashes,
              'inference_run':False,'important':'Preparation only. Existing Exp2 Telea+donors is not ProPainter GT baseline. New matched ProPainter control required.'}
    (gt/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print('GT prepared, 22 actual source frames; no inference',flush=True)

if __name__=='__main__': main()
