"""Non-identity C2 ROI + real mask gate. CPU only, B2 immutable, no CRF sweep."""
from __future__ import annotations
import hashlib
import argparse
import json
from pathlib import Path
import subprocess
import time
import cv2
import numpy as np
from fidelity_roi_contract import (DECODE_709,ENCODE_709,COLOR_ARGS,planes,pack,
                                  insert_rgb,compose_yuv,validate_frame_ids)

ROOT=Path('G:/dowloand/teste/extra-global-fidelity-gate-20260911')
SOURCE=Path('G:/dowloand/teste/padro-01-001 (15).mp4')
PHASE=Path('G:/dowloand/teste/phase-2-3-20260910')
RAW=PHASE/'model/C2-window43/raw-output'
MASKS=PHASE/'phase2/masks'
B2=Path('G:/dowloand/teste/phase-5-20260911/baseline/B2-finish-OFF-rgb-lossless.mp4')
W,H=1080,1920
START,COUNT=104,43
ROI=(130,1300,820,294)
CONVERT=(128,1298,824,298)
BYTES=W*H*3//2
COMMANDS=[]

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''): h.update(b)
    return h.hexdigest()

def write_json(name,data):
    (ROOT/name).write_text(json.dumps(data,indent=2),encoding='utf-8')

def run(cmd, data=None):
    start=time.perf_counter()
    proc=subprocess.run(cmd,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=300)
    COMMANDS.append({'argv':cmd,'seconds':time.perf_counter()-start,'returncode':proc.returncode,
                     'stderr':proc.stderr.decode(errors='replace')[-3000:]})
    write_json('commands.json',COMMANDS)
    if proc.returncode: raise RuntimeError(COMMANDS[-1])
    return proc.stdout

def ff(*args,data=None):
    return run(['ffmpeg','-v','error','-threads','2','-filter_threads','1',*map(str,args)],data)

def decode(data,width=W,height=H):
    raw=ff('-f','rawvideo','-pixel_format','yuv420p','-video_size',f'{width}x{height}',
           '-framerate','30','-i','pipe:0','-vf',DECODE_709,'-f','rawvideo','-pix_fmt','bgr24','pipe:1',data=data)
    return np.frombuffer(raw,np.uint8).reshape(-1,height,width,3)

def convert_rgb(rgb):
    hh,ww=rgb.shape[:2]
    return ff('-f','rawvideo','-pixel_format','bgr24','-video_size',f'{ww}x{hh}',
              '-framerate','30','-i','pipe:0','-vf',ENCODE_709,'-f','rawvideo','-pix_fmt','yuv420p','pipe:1',data=rgb.tobytes())

def probe(path):
    return json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-show_streams','-show_frames',
                          '-show_entries','frame=pts,pts_time,best_effort_timestamp_time,pkt_duration_time:stream',
                          '-of','json',str(path)]))

def encode_master(raw,output,pix='yuv420p'):
    rgb=pix=='bgr24'
    params=('setsar=1,setparams=range='+('pc' if rgb else 'tv')+
            ':color_primaries=bt709:color_trc=bt709:colorspace='+('gbr' if rgb else 'bt709'))
    ff('-f','rawvideo','-pixel_format',pix,'-video_size',f'{W}x{H}','-framerate','30','-i',raw,
       '-vf',params,'-an','-c:v','libx264rgb' if rgb else 'libx264','-preset','ultrafast','-crf','0',
       '-threads','2','-color_primaries','bt709','-color_trc','bt709','-colorspace','rgb' if rgb else 'bt709',
       '-color_range','pc' if rgb else 'tv','-video_track_timescale','90000',output)

def main():
    began=time.perf_counter(); ROOT.mkdir(parents=True,exist_ok=False)
    for folder in ['source-rgb','masks','rgb-composite','boundary-controls','comparators']:
        (ROOT/folder).mkdir()
    before=sha(B2)
    assert before=='08e73ade1fa0048f33a5701502f6825428ee392c4e8748ddab6cffb1093779b5'
    source_raw=ROOT/'source.yuv'
    ff('-i',SOURCE,'-vf',f'select=between(n\\,{START}\\,{START+COUNT-1})','-fps_mode','passthrough',
       '-frames:v',COUNT,'-an','-pix_fmt','yuv420p','-f','rawvideo',source_raw)
    assert source_raw.stat().st_size==BYTES*COUNT
    input_hashes=[]; rows=[]; pad_ok=True
    roi_stream=ROOT/'conversion-roi.bgr'; rgb_stream=ROOT/'rgb-composite.bgr'
    with source_raw.open('rb') as stream,roi_stream.open('wb') as roi_out,rgb_stream.open('wb') as rgb_out:
        for local in range(COUNT):
            index=START+local; buf=stream.read(BYTES); src=decode(buf)[0]
            pred_path=RAW/f'{local:06d}.png'; pred=cv2.imread(str(pred_path))
            raw_padded=cv2.imread(str(PHASE/'model/C2-window43/run/input/frames'/f'{local:04d}.png'))
            pad_ok &= bool(np.array_equal(raw_padded[:294,:820],pred))
            mask_path=MASKS/f'{index:06d}.png'; m=cv2.imread(str(mask_path),0)
            assert set(np.unique(m)).issubset({0,255})
            mask=m>0; composed=insert_rgb(src,pred,mask,ROI)
            assert np.array_equal(composed[~mask],src[~mask])
            cv2.imwrite(str(ROOT/'source-rgb'/f'{index:06d}.png'),src)
            cv2.imwrite(str(ROOT/'masks'/f'{index:06d}.png'),m)
            cv2.imwrite(str(ROOT/'rgb-composite'/f'{index:06d}.png'),composed)
            rgb_out.write(composed.tobytes()); x,y,w,h=CONVERT
            roi_out.write(np.ascontiguousarray(composed[y:y+h,x:x+w]).tobytes())
            rows.append({'source_frame':index,'output_frame':local,'mask_pixels':int(mask.sum()),
                         'changed_rgb_inside':int(np.any(composed!=src,axis=2)[mask].sum()),
                         'rgb_working_master_external_changed':0})
            input_hashes.append({'source_frame':index,'mask_sha256':sha(mask_path),'raw_roi_sha256':sha(pred_path)})
    assert pad_ok
    validate_frame_ids([r['source_frame'] for r in rows],range(START,START+COUNT))
    try: validate_frame_ids(range(START+1,START+COUNT+1),range(START,START+COUNT))
    except ValueError: shift_rejected=True
    else: raise AssertionError('Shifted indices accepted')
    roi_yuv=ROOT/'conversion-roi.yuv'; x,y,w,h=CONVERT
    ff('-f','rawvideo','-pixel_format','bgr24','-video_size',f'{w}x{h}','-framerate','30','-i',roi_stream,
       '-vf',ENCODE_709,'-an','-pix_fmt','yuv420p','-f','rawvideo',roi_yuv)
    roi_size=w*h*3//2
    # Fixed boundary controls, one guard variable. Only a single frame needed here.
    local=120-START
    with source_raw.open('rb') as f: f.seek(local*BYTES); source120=f.read(BYTES)
    with roi_yuv.open('rb') as f: f.seek(local*roi_size); roi120=f.read(roi_size)
    src120=decode(source120)[0]; mask120=cv2.imread(str(ROOT/'masks/000120.png'),0)>0
    synthetic=src120.copy(); synthetic[mask120]=(255,0,255)
    synthetic_roi=convert_rgb(np.ascontiguousarray(synthetic[y:y+h,x:x+w]))
    controls=[]
    for guard in [0,2,4,6]:
        for name,ri in [('real',roi120),('saturated',synthetic_roi)]:
            buf,_=compose_yuv(source120,ri,W,H,CONVERT,mask120,guard)
            out=decode(buf)[0]; delta=np.abs(out.astype(np.int16)-src120.astype(np.int16))
            external=np.any(delta>0,axis=2)&~mask120
            controls.append({'guard':guard,'case':name,'outside_changed':int(external.sum()),
                             'outside_max':int(delta[~mask120].max())})
            cv2.imwrite(str(ROOT/'boundary-controls'/f'{name}-guard{guard}-delta.png'),np.minimum(delta*12,255).astype(np.uint8))
    passed=[g for g in [0,2,4,6] if all(r['outside_changed']==0 for r in controls if r['guard']==g)]
    write_json('boundary-controls.json',controls)
    if not passed: raise RuntimeError('All chroma guards leaked; keep diagnostic artifacts')
    guard=min(passed); print(f'Boundary calibration selected chroma guard {guard}',flush=True)
    composed_raw=ROOT/'plane-master.yuv'; encoded_rgb_delta=[]
    with source_raw.open('rb') as s,roi_yuv.open('rb') as r,composed_raw.open('wb') as o:
        for local in range(COUNT):
            index=START+local; sb=s.read(BYTES); rb=r.read(roi_size)
            m=cv2.imread(str(ROOT/'masks'/f'{index:06d}.png'),0)>0
            buf,support=compose_yuv(sb,rb,W,H,CONVERT,m,guard)
            # Reusing the same bytes via the single engine-neutral contract must agree.
            duplicate,_=compose_yuv(sb,rb,W,H,CONVERT,m,guard)
            assert duplicate==buf
            out=decode(buf)[0]; src=cv2.imread(str(ROOT/'source-rgb'/f'{index:06d}.png'))
            delta=np.abs(out.astype(np.int16)-src.astype(np.int16))
            rows[local].update(yuv_decoded_rgb_external_changed=int(np.any(delta>0,axis=2)[~m].sum()),
                               yuv_decoded_rgb_external_max=int(delta[~m].max()),
                               yuv_external_planes_changed=0,chroma_writable_cells=int(support[1].sum()))
            working=cv2.imread(str(ROOT/'rgb-composite'/f'{index:06d}.png'))
            diff=np.abs(out.astype(np.float32)-working.astype(np.float32))
            rows[local]['rgb_to_420_inside_mae']=float(diff[m].mean())
            o.write(buf)
    write_json('frame-gates.json',rows)
    finish(rows,pad_ok,shift_rejected,before,began,input_hashes,guard)

def finish(rows,pad_ok,shift_rejected,before,began,input_hashes,guard):
    composed_raw=ROOT/'plane-master.yuv'; rgb_stream=ROOT/'rgb-composite.bgr'; source_raw=ROOT/'source.yuv'
    x,y,w,h=CONVERT
    encode_master(composed_raw,ROOT/'master-yuv-lossless.mp4')
    encode_master(rgb_stream,ROOT/'master-rgb-lossless.mp4','bgr24')
    encode_master(source_raw,ROOT/'source-lossless.mp4')
    decoded=ff('-i',ROOT/'master-yuv-lossless.mp4','-pix_fmt','yuv420p','-f','rawvideo','pipe:1')
    assert hashlib.sha256(decoded).hexdigest()==sha(composed_raw)
    del decoded
    rgb_decoded=ff('-i',ROOT/'master-rgb-lossless.mp4','-pix_fmt','bgr24','-f','rawvideo','pipe:1')
    assert hashlib.sha256(rgb_decoded).hexdigest()==sha(rgb_stream)
    del rgb_decoded
    # Single fixed CRF16 validates the shared delivery path, not the deferred CRF sweep.
    ff('-i',ROOT/'master-yuv-lossless.mp4','-an','-c:v','libx264','-preset','slow','-crf','16',
       '-threads','2','-pix_fmt','yuv420p',*COLOR_ARGS,'-vf','setsar=1','-video_track_timescale','90000',
       '-movflags','+faststart',ROOT/'delivery-crf16.mp4')
    probes={k:probe(ROOT/k) for k in ['source-lossless.mp4','master-yuv-lossless.mp4','master-rgb-lossless.mp4','delivery-crf16.mp4']}
    for name,p in probes.items():
        pts=[float(f['pts_time']) for f in p['frames']]
        assert len(pts)==COUNT
        assert max(abs(t-i/30) for i,t in enumerate(pts))<0.000001
        stream=p['streams'][0]
        assert (stream['width'],stream['height'])==(W,H)
        assert stream['sample_aspect_ratio']=='1:1'
        assert stream['color_primaries']==stream['color_transfer']=='bt709'
    write_json('ffprobe-by-stage.json',probes)
    # Native spatial crops side by side at normal speed, no resizing for assessment.
    ff('-i',ROOT/'source-lossless.mp4','-i',ROOT/'master-yuv-lossless.mp4','-i',ROOT/'delivery-crf16.mp4',
       '-filter_complex_threads','1','-filter_complex',
       '[0:v]crop=480:300:300:1280[a];[1:v]crop=480:300:300:1280[b];[2:v]crop=480:300:300:1280[c];[a][b][c]hstack=inputs=3[v]',
       '-map','[v]','-an','-c:v','libx264','-preset','slow','-crf','16','-threads','2',*COLOR_ARGS,
       ROOT/'comparators/source-master-delivery-1x.mp4')
    after=sha(B2); assert after==before
    result={'verdict':'PASS_TECHNICAL' if all(r['yuv_decoded_rgb_external_changed']==0 for r in rows) else 'RETEST',
            'scope':'Existing C2 ROI transport only; no new inference, no engine winner',
            'source':str(SOURCE),'source_sha256':sha(SOURCE),'baseline_sha256_before':before,'baseline_sha256_after':after,
            'frames':[START,START+COUNT-1],'fps':'30/1','output_pts_origin':'source frame104 => output0; exact rational offset104/30s',
            'roi_xywh':ROI,'conversion_xywh':CONVERT,'converted_fraction_of_fullframe':w*h/(W*H),
            'chroma_guard_px':guard,'chroma_policy':'Only wholly allowed 2x2 cells after inward guard; luma mask unchanged',
            'padding_crop_exact':pad_ok,'shifted_frame_ids_rejected':shift_rejected,
            'shared_contract_repeated_call_bytes_equal':True,'diffueraser_output_tested':False,
            'intermediate_lossy_encodes':0,'delivery_lossy_encodes':1,'crf':16,'preset':'slow',
            'master_yuv_raw_sha256':sha(composed_raw),'master_rgb_raw_sha256':sha(rgb_stream),
            'external_master_yuv_and_rgb_exact':all(r['yuv_decoded_rgb_external_changed']==0 for r in rows),
            'visual_halo_assessment':'PENDING_VISUAL_REVIEW','cloud_cost_usd':0,
            'elapsed_seconds':time.perf_counter()-began,'inputs':input_hashes,
            'contract_sha256':sha(Path(__file__).with_name('fidelity_roi_contract.py')),
            'harness_sha256':sha(Path(__file__))}
    write_json('result.json',result)
    print(json.dumps({k:v for k,v in result.items() if k!='inputs'},indent=2),flush=True)

def resume_finalization():
    # Preserve the failed encodes; recomposition/input preparation need not be repeated.
    global COMMANDS
    COMMANDS=json.loads((ROOT/'commands.json').read_text())
    reject=ROOT/'rejected-missing-input-color-contract'; reject.mkdir(exist_ok=False)
    for name in ['master-yuv-lossless.mp4','master-rgb-lossless.mp4','source-lossless.mp4']:
        p=ROOT/name
        assert p.resolve().parent==ROOT.resolve()
        p.rename(reject/name)
    rows=json.loads((ROOT/'frame-gates.json').read_text())
    controls=json.loads((ROOT/'boundary-controls.json').read_text())
    guards=[g for g in [0,2,4,6] if all(r['outside_changed']==0 for r in controls if r['guard']==g)]
    pad_ok=all(np.array_equal(cv2.imread(str(PHASE/'model/C2-window43/run/input/frames'/f'{i:04d}.png'))[:294,:820],
                             cv2.imread(str(RAW/f'{i:06d}.png'))) for i in range(COUNT))
    inputs=[{'source_frame':START+i,'mask_sha256':sha(MASKS/f'{START+i:06d}.png'),
             'raw_roi_sha256':sha(RAW/f'{i:06d}.png')} for i in range(COUNT)]
    validate_frame_ids([r['source_frame'] for r in rows],range(START,START+COUNT))
    try: validate_frame_ids(range(START+1,START+COUNT+1),range(START,START+COUNT))
    except ValueError: shift_rejected=True
    else: raise AssertionError('Shifted indices accepted')
    finish(rows,pad_ok,shift_rejected,sha(B2),time.perf_counter(),inputs,min(guards))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--resume-finalization',action='store_true')
    args=parser.parse_args()
    resume_finalization() if args.resume_finalization else main()
