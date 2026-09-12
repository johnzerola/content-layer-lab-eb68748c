"""Native-grid local ProPainter ablations. No retries at reduced resolution."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import cv2
import numpy as np


def main():
    p=argparse.ArgumentParser();p.add_argument('--variant',required=True);p.add_argument('--mask',required=True,type=Path)
    p.add_argument('--stride',type=int,default=2);p.add_argument('--window',type=int,default=32);p.add_argument('--neighbor',type=int,default=6)
    p.add_argument('--root',type=Path,default=Path('G:/dowloand/teste/phase-2-3-20260910'))
    args=p.parse_args();dest=args.root/'model'/args.variant;dest.mkdir(parents=True,exist_ok=False)
    inp=dest/'input';masks=dest/'mask';inp.mkdir();masks.mkdir()
    source=args.root/'phase2/input.mp4';cap=cv2.VideoCapture(str(source)); start=time.perf_counter()
    for i in range(147):
        ok,f=cap.read()
        if not ok: raise ValueError('source incomplete')
        if i<104:continue
        local=i-104
        f=f[1300:1594,130:950]
        mask=cv2.imread(str(args.mask/f'{local:06d}.png'),0)
        if mask is None or mask.shape!=(294,820):raise ValueError('mask geometry')
        f=cv2.copyMakeBorder(f,0,2,0,4,cv2.BORDER_REPLICATE)
        mask=cv2.copyMakeBorder(mask,0,2,0,4,cv2.BORDER_REPLICATE)
        cv2.imwrite(str(inp/f'{local:06d}.png'),f);cv2.imwrite(str(masks/f'{local:06d}.png'),mask)
    cap.release()
    runtime=Path('G:/cleaneria-runtime/ProPainter'); python=Path('G:/cleaneria-runtime/propainter-env/Scripts/python.exe')
    command=[str(python),str(Path(__file__).with_name('phase23_model_entry.py').resolve()),'--video',str(inp),'--mask',str(masks),'--output',str(dest/'run'),
             '--width','824','--height','296','--save_fps','30','--subvideo_length',str(args.window),'--neighbor_length',str(args.neighbor),'--ref_stride',str(args.stride),
             '--mask_dilation','2','--fp16','--save_frames']
    env=os.environ.copy();env['PHASE23_PROPAINTER_ROOT']=str(runtime);env['PYTHONPATH']=str(runtime)
    report={'variant':args.variant,'status':'RUNNING','source':str(source),'mask_dir':str(args.mask),'roi':[130,1300,820,294],
            'model_grid':[824,296],'resampled':False,'seed':1234,'fp16':True,'mask_dilation':2,'stride':args.stride,'window':args.window,'neighbor':args.neighbor,
            'command':command,'runner_sha256':hashlib.sha256((runtime/'inference_propainter.py').read_bytes()).hexdigest(),'local_gpu_only':True}
    report_file=dest/'report.json';report_file.write_text(json.dumps(report,indent=2),encoding='utf-8')
    try:
        with (dest/'model.log').open('w',encoding='utf-8') as log:
            proc=subprocess.run(command,cwd=runtime,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900)
        if proc.returncode:raise RuntimeError(f'local model exit {proc.returncode}; see log')
        output=dest/'raw-output';output.mkdir()
        for i in range(43):
            f=cv2.imread(str(dest/f'run/input/frames/{i:04d}.png'))
            if f is None or f.shape!=(296,824,3):raise ValueError('raw output incomplete/geometry')
            cv2.imwrite(str(output/f'{i:06d}.png'),f[:294,:820])
        report.update(status='COMPLETED',frames=43)
    except Exception as e:
        report.update(status='FAILED',error=str(e));raise
    finally:
        report['seconds']=time.perf_counter()-start;report_file.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))


if __name__=='__main__':main()
