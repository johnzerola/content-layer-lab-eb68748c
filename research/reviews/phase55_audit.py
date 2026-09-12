"""Read-only pipeline review plus isolated CPU export controls. No engine changes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time
import cv2
import numpy as np

REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'research/experiments'))
from phase23_color import Reader,digest,SOURCE

OUT=Path('G:/dowloand/teste/phase-5-5-independent-review-20260911')
P3=Path('G:/dowloand/teste/phase-2-3-20260910')
P5=Path('G:/dowloand/teste/phase-5-20260911')
SAMPLE=[0,15,30,45,60,75,90,104,110,116,120,126,133,140,146]
PATHS={'SOURCE':SOURCE,'PREPARED':P3/'phase2/input.mp4',
       'B2_MASTER':P5/'baseline/B2-finish-OFF-rgb-lossless.mp4',
       'B2_DELIVERY':P3/'candidates/B2-real-donors-clipped-C2/delivery-crf14.mp4',
       'P5_A20_MASTER':P5/'candidates/A20/master.mp4',
       'P5_A20_DELIVERY':P5/'candidates/A20/delivery-crf14.mp4',
       'V3':Path('G:/dowloand/teste/resultado-automatico-v3-20260909/output.mp4'),
       'CONTROL_LAB':P3/'phase2/source-control-crf14.mp4',
       'VMAKE_REFERENCE':Path('G:/dowloand/teste/VMAKE.IA.mp4')}


def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);sys.modules[name]=mod;spec.loader.exec_module(mod)
    return mod


def controls():
    v=load_module('audit_video',REPO/'backend/app/utils/video.py')
    c=load_module('audit_chunks',REPO/'backend/app/services/chunking.py')
    mask=OUT/'zero-mask';mask.mkdir(exist_ok=True)
    zero=np.zeros((1920,1080),np.uint8)
    for i in range(147):
        assert cv2.imwrite(str(mask/f'{i:06d}.png'),zero)
    jobs={}
    # Match SOURCE and masks exactly. Retain native YUV samples in an intra
    # lossless prefix; no RGB roundtrip, AI, resize, or lossy preprocessing.
    prefix=OUT/'control-source147-yuvlossless.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(SOURCE),'-frames:v','147','-an',
                    '-c:v','libx264','-crf','0','-preset','ultrafast','-threads','2','-pix_fmt','yuv420p',str(prefix)],check=True)
    PATHS['CONTROL_YUV_PREP']=prefix
    path=OUT/'control-backend-empty-composite.mp4'
    t=time.perf_counter()
    v.composite_masked(str(prefix),str(prefix),str(mask),30,str(path))
    jobs['empty_composite_seconds']=time.perf_counter()-t
    PATHS['CONTROL_BACKEND_EMPTY']=path
    t=time.perf_counter()
    sliced=OUT/'control-chunk-slice.mp4'
    c.slice_video(str(SOURCE),str(sliced),0,4.9)
    output=OUT/'control-chunk-trim.mp4'
    c.trim_edges(str(sliced),str(output),0,4.9)
    PATHS['CONTROL_CHUNK_1']=sliced;PATHS['CONTROL_CHUNK_2']=output
    jobs['slice_trim_seconds']=time.perf_counter()-t
    jobs['scope']='Exact backend helpers, AI bypassed; not entire application/deployed-route test. All-empty scene fast path is a copy; forced empty composite separately exposes color/codec cost.'
    (OUT/'control-jobs.json').write_text(json.dumps(jobs,indent=2))


def forensic(path):
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
    v=next(s for s in info['streams'] if s['codec_type']=='video')
    frames=json.loads(subprocess.check_output(['ffprobe','-v','error','-read_intervals','%+#147','-select_streams','v:0',
                    '-show_frames','-show_entries','frame=key_frame,pict_type,best_effort_timestamp_time,pkt_duration_time','-of','json',str(path)]))['frames']
    keys=[i for i,f in enumerate(frames) if f.get('key_frame')==1]
    return dict(path=str(path),sha256=digest(path),video=v,container=info['format'],
                sample_frames=frames,keyframe_indices=keys,gop_gaps=np.diff(keys).tolist(),
                gop_scope='first147 decoded frames; no inference of configured keyint from short clip')


def ssim_map(a,b):
    a,b=a.astype(np.float32),b.astype(np.float32)
    blur=lambda x:cv2.GaussianBlur(x,(11,11),1.5)
    ma,mb=blur(a),blur(b)
    va,vb=blur(a*a)-ma*ma,blur(b*b)-mb*mb
    cov=blur(a*b)-ma*mb
    return ((2*ma*mb+6.5025)*(2*cov+58.5225))/((ma*ma+mb*mb+6.5025)*(va+vb+58.5225))


def feature(f,valid):
    f=f.astype(np.float32)
    b,g,r=cv2.split(f);y=.0722*b+.7152*g+.2126*r
    cb=(b-y)/1.8556;cr=(r-y)/1.5748
    hp=y-cv2.GaussianBlur(y,(0,0),1)
    gx=cv2.Sobel(y,cv2.CV_32F,1,0)/8;gy=cv2.Sobel(y,cv2.CV_32F,0,1)/8
    contrast=np.sqrt(np.maximum(0,cv2.GaussianBlur(y*y,(11,11),1.5)-cv2.GaussianBlur(y,(11,11),1.5)**2))
    hsv=cv2.cvtColor(f/255,cv2.COLOR_BGR2HSV)
    return dict(luma_mean=float(y[valid].mean()),cb_mean=float(cb[valid].mean()),cr_mean=float(cr[valid].mean()),
                luma_p01=float(np.percentile(y[valid],1)),luma_p99=float(np.percentile(y[valid],99)),
                hf_rms=float(np.sqrt(np.mean(hp[valid]**2))),gradient_rms=float(np.sqrt(np.mean((gx*gx+gy*gy)[valid]))),
                local_contrast_mean=float(contrast[valid].mean()),saturation_mean=float(hsv[...,1][valid].mean()),
                luma_histogram=np.histogram(y[valid],bins=32,range=(0,256))[0].tolist(),
                bgr_mean=f[valid].mean(0).tolist()),y,hsv


def metrics(src,other,valid):
    a,ya,ha=feature(src,valid);b,yb,hb=feature(other,valid)
    diff=other.astype(np.float32)-src.astype(np.float32)
    mse=float(np.mean(diff[valid]**2))
    lab1=cv2.cvtColor(src.astype(np.float32)/255,cv2.COLOR_BGR2LAB)
    lab2=cv2.cvtColor(other.astype(np.float32)/255,cv2.COLOR_BGR2LAB)
    hue_valid=valid&(ha[...,1]>.1)&(hb[...,1]>.1)&(ha[...,2]>.08)&(hb[...,2]>.08)
    hue=np.abs((hb[...,0]-ha[...,0]+180)%360-180)
    ea=cv2.Canny(np.uint8(ya),30,80)>0;eb=cv2.Canny(np.uint8(yb),30,80)>0
    edge_support=valid&ea
    return dict(pixels=int(valid.sum()),mae=float(np.abs(diff[valid]).mean()),max_abs=int(np.abs(diff[valid]).max()),
                psnr_db=10*np.log10(255**2/mse) if mse else None,perfect_match=mse==0,
                ssim_luma=float(ssim_map(ya,yb)[valid].mean()),luma_bias=float((yb-ya)[valid].mean()),
                gradient_ratio=b['gradient_rms']/a['gradient_rms'],hf_ratio=b['hf_rms']/a['hf_rms'],
                local_contrast_ratio=b['local_contrast_mean']/a['local_contrast_mean'],
                source_edge_recall=float((eb&edge_support).sum()/edge_support.sum()) if edge_support.any() else None,
                delta_e76_srgb_assumption=float(np.linalg.norm(lab2-lab1,axis=2)[valid].mean()),
                hue_abs_degrees=float(hue[hue_valid].mean()) if hue_valid.any() else None,
                source=a,result=b,lpips=None,lpips_reason='Not installed; no weights downloaded in this audit',
                color_caveat='DeltaE76 uses OpenCV sRGB transfer assumption, not colorimetric BT709 EOTF/CIEDE2000; descriptive only.')


def measure():
    samples={};source_reader=Reader(SOURCE,yuv709=True)
    for i in range(147):
        f=source_reader.frame()
        if i in SAMPLE:samples[i]=f.copy()
    source_reader.close()
    report={}
    for name,path in PATHS.items():
        if name in ['SOURCE','VMAKE_REFERENCE']:continue
        reader=Reader(path,yuv709=name not in ['PREPARED','B2_MASTER','P5_A20_MASTER'])
        rows=[]
        for i in range(147):
            frame=reader.frame()
            if i not in samples:continue
            mask=cv2.imread(str(P3/'phase2/masks'/f'{i:06d}.png'),0)
            valid=np.zeros(mask.shape,np.uint8);valid[546:1654,31:1049]=1
            valid[cv2.dilate(mask,np.ones((13,13),np.uint8))>0]=0
            use=valid[540:1660,25:1055]>0
            row=metrics(samples[i][540:1660,25:1055],frame[540:1660,25:1055],use)
            row['frame']=i
            rows.append(row)
        reader.close()
        summary={k:float(np.mean([r[k] for r in rows])) for k in ['mae','ssim_luma','luma_bias','gradient_ratio','hf_ratio','local_contrast_ratio','delta_e76_srgb_assumption']}
        summary['max_abs']=max(r['max_abs'] for r in rows)
        summary['psnr_db_mean']=float(np.mean([r['psnr_db'] for r in rows])) if all(r['psnr_db'] is not None for r in rows) else None
        report[name]=dict(rows=rows,summary=summary)
        print(name,json.dumps(summary),flush=True)
    (OUT/'outside-fidelity.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    # Same-frame, unmasked diagnostic crops; SOURCE is the only fidelity reference.
    ref=Reader(PATHS['VMAKE_REFERENCE'],yuv709=True)
    for i in range(147):
        frame=ref.frame()
        if i==117:
            cv2.imwrite(str(OUT/'vmake-frame117.png'),frame)
    ref.close()
    cv2.imwrite(str(OUT/'source-frame120.png'),samples[120])


def stages():
    rows=[];model=P3/'model/C2-window43'
    for i in [106,116,120,126,133,140]:
        local=i-104
        inp=cv2.imread(str(model/'input'/f'{local:06d}.png'))
        raw=cv2.imread(str(model/'raw-output'/f'{local:06d}.png'))
        upstream=cv2.imread(str(model/'run/input/frames'/f'{local:04d}.png'))
        cap=cv2.VideoCapture(str(P3/'phase2/input.mp4'));cap.set(cv2.CAP_PROP_POS_FRAMES,i);ok,source=cap.read();cap.release();assert ok
        row=dict(frame=i,model_input_vs_prepared_max=int(np.abs(inp[:294,:820].astype(int)-source[1300:1594,130:950].astype(int)).max()),
                 raw_saved_vs_upstream_max=int(np.abs(raw.astype(int)-upstream[:294,:820].astype(int)).max()))
        rows.append(row)
    predictions=[]
    for p in sorted((model/'run/raw_predictions').glob('*.npz')):
        with np.load(p) as d:
            a=d['pred_img'];predictions.append(dict(file=p.name,dtype=str(a.dtype),shape=list(a.shape),minimum=float(a.min()),maximum=float(a.max()),
                    outside_uint8_range=int(((a<0)|(a>255)).sum()),refs=d['ref_ids'].tolist(),neighbors=d['neighbor_ids'].tolist()))
    (OUT/'stage-evidence.json').write_text(json.dumps({'rows':rows,'predictions':predictions},indent=2),encoding='utf-8')


if __name__=='__main__':
    OUT.mkdir(exist_ok=True);cv2.setNumThreads(2)
    controls()
    (OUT/'ffprobe-forensics.json').write_text(json.dumps({k:forensic(v) for k,v in PATHS.items()},indent=2),encoding='utf-8')
    measure();stages()
    files=['backend/app/utils/video.py','backend/app/services/inference_region.py','backend/app/services/chunking.py',
           'backend/app/engines/propainter_official.py','backend/app/workers/tasks.py','backend/runpod_handler.py',
           'research/experiments/phase23_donors.py','research/experiments/phase23_model.py','research/experiments/phase5_runtime.py']
    (OUT/'code-hashes.json').write_text(json.dumps({f:digest(REPO/f) for f in files},indent=2))
    print('AUDIT COMPLETE',flush=True)
