"""Verify serialized content, chunks, boundary residuals and PTS for the ROI gate."""
from pathlib import Path
from fractions import Fraction
import hashlib
import json
import subprocess
import cv2
import numpy as np
import extra_fidelity_gate as gate
from fidelity_roi_contract import compose_yuv,DECODE_709

ROOT=gate.ROOT

def main():
    gate.COMMANDS=json.loads((ROOT/'commands.json').read_text())
    result=json.loads((ROOT/'result.json').read_text())
    # Exact decoded plane hash, also verifies the source container has no implicit conversion.
    raw=gate.ff('-i',ROOT/'source-lossless.mp4','-pix_fmt','yuv420p','-f','rawvideo','pipe:1')
    assert hashlib.sha256(raw).hexdigest()==gate.sha(ROOT/'source.yuv')
    del raw
    # Nonuniform temporal batches must produce identical content to the monolithic pass.
    hash_chunks=hashlib.sha256(); processed=[]
    x,y,w,h=gate.CONVERT; roisize=w*h*3//2
    with (ROOT/'source.yuv').open('rb') as src,(ROOT/'conversion-roi.yuv').open('rb') as roi:
        for lo,hi in [(0,13),(13,29),(29,43)]:
            src.seek(lo*gate.BYTES);roi.seek(lo*roisize)
            for local in range(lo,hi):
                frame=104+local;mask=cv2.imread(str(ROOT/'masks'/f'{frame:06d}.png'),0)>0
                buf,_=compose_yuv(src.read(gate.BYTES),roi.read(roisize),1080,1920,gate.CONVERT,mask,result['chroma_guard_px'])
                hash_chunks.update(buf);processed.append(frame)
    assert processed==list(range(104,147))
    assert hash_chunks.hexdigest()==gate.sha(ROOT/'plane-master.yuv')
    # Original PTS versus normalized output PTS, use rational timebase (not rounded strings).
    srcprobe=json.loads(gate.run(['ffprobe','-v','error','-read_intervals','0%+5',
        '-select_streams','v:0','-show_streams','-show_frames','-show_entries',
        'stream=time_base,width,height,r_frame_rate:frame=pts,pts_time','-of','json',str(gate.SOURCE)]))
    tb=Fraction(srcprobe['streams'][0]['time_base'])
    pts=[int(f['pts'])*tb for f in srcprobe['frames']][104:147]
    assert len(pts)==43
    assert pts==[Fraction(i,30) for i in range(104,147)]
    probes=json.loads((ROOT/'ffprobe-by-stage.json').read_text())
    output=probes['delivery-crf16.mp4']; otb=Fraction(output['streams'][0]['time_base'])
    actual=[int(f['pts'])*otb for f in output['frames']]
    assert actual==[t-pts[0] for t in pts]
    (ROOT/'source-pts.json').write_text(json.dumps(srcprobe,indent=2),encoding='utf-8')
    # Inspect annulus inside mask separately from provably unchanged exterior.
    snapshots=[]; stats=[]
    for frame in [104,120,146]:
        local=frame-104; mask=cv2.imread(str(ROOT/'masks'/f'{frame:06d}.png'),0)>0
        source=cv2.imread(str(ROOT/'source-rgb'/f'{frame:06d}.png'))
        work=cv2.imread(str(ROOT/'rgb-composite'/f'{frame:06d}.png'))
        with (ROOT/'plane-master.yuv').open('rb') as f: f.seek(local*gate.BYTES);buf=f.read(gate.BYTES)
        decoded=gate.decode(buf)[0]
        inward=cv2.erode(mask.astype(np.uint8),np.ones((13,13),np.uint8))>0
        annulus=mask&~inward
        delta=np.abs(decoded.astype(np.int16)-work.astype(np.int16))
        def green(image):
            b,g,r=[image[...,i].astype(np.int16) for i in range(3)]
            return (g-r>18)&(g-b>14)&(g>45)&mask
        stats.append({'source_frame':frame,'inside_6px_annulus_rgb_mae':float(delta[annulus].mean()),
                      'inside_6px_annulus_max':int(delta[annulus].max()),
                      'green_pixels_working':int(green(work).sum()),'green_pixels_plane_master':int(green(decoded).sum()),
                      'new_green_pixels':int((green(decoded)&~green(work)).sum()),
                      'note':'Green detector only, not a full residual-text/halo classifier'})
        tiles=[]
        for label,im in [('SOURCE',source),('RGB WORKING MASTER',work),('YUV MASTER DECODED',decoded)]:
            crop=im[1320:1600,260:900].copy()
            tile=np.zeros((306,640,3),np.uint8);tile[26:]=crop
            cv2.putText(tile,label,(8,18),cv2.FONT_HERSHEY_SIMPLEX,.48,(255,255,255),1)
            tiles.append(tile)
        montage=np.hstack(tiles)
        cv2.imwrite(str(ROOT/'comparators'/f'frame{frame}-native.png'),montage)
        snapshots.append(str(ROOT/'comparators'/f'frame{frame}-native.png'))
    # Diagnostic log proves why the first nominally lossless serialization was rejected.
    cmd=['ffmpeg','-v','verbose','-threads','2','-filter_threads','1','-f','rawvideo','-pixel_format','yuv420p',
         '-video_size','1080x1920','-framerate','30','-i',str(ROOT/'plane-master.yuv'),'-vf','setsar=1',
         '-c:v','libx264','-preset','ultrafast','-crf','0','-threads','2','-colorspace','bt709',
         '-color_range','tv','-frames:v','1','-f','null','-']
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=30)
    (ROOT/'rejected-missing-input-color-contract/verbose-diagnostic.log').write_text(p.stderr,encoding='utf-8')
    # Normal and slow viewing copies of the comparison (not quality masters).
    gate.ff('-i',ROOT/'comparators/source-master-delivery-1x.mp4','-vf','setpts=2*PTS','-an','-c:v','libx264',
            '-preset','slow','-crf','16','-threads','2',ROOT/'comparators/source-master-delivery-0.5x.mp4')
    gate.ff('-i',ROOT/'comparators/source-master-delivery-1x.mp4','-f','null','-')
    review={'source_serialized_yuv_exact':True,'chunk_partitions':[[0,13],[13,29],[29,43]],
            'chunk_content_sha256':hash_chunks.hexdigest(),'chunk_vs_monolithic_exact':True,
            'source_absolute_first_pts':str(pts[0]),'relative_pts_max_error_seconds':0,
            'boundary_samples':stats,'viewed_images':snapshots,
            'visual_review_status':'AWAITING_INSPECTION','human_motion_review':False,
            'delivery_crf_sweep':'DEFERRED_UNTIL_RECONSTRUCTION_WINNER',
            'perceptual_finish':'DEFERRED_UNTIL_RECONSTRUCTION_AND_DELIVERY_ACCEPTED'}
    (ROOT/'review.json').write_text(json.dumps(review,indent=2),encoding='utf-8')
    print(json.dumps(review,indent=2))

if __name__=='__main__':main()
