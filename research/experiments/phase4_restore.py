"""Bounded RealBasicVSR x4 -> native-size restoration experiment.

Input must be a single continuous scene, with the filmed ROI explicitly given.
No pre-downscale, no face model, no production endpoint and no random texture.
Use an official trusted RealBasicVSR checkpoint with an expected SHA-256.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
from fractions import Fraction


def probe_video(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-show_streams',
        '-show_format', '-of', 'json', str(path)], text=True, timeout=120))


def validate_delivery(source, output):
    before = next(s for s in source['streams'] if s['codec_type'] == 'video')
    after = next(s for s in output['streams'] if s['codec_type'] == 'video')
    for field in ('width', 'height', 'nb_read_frames'):
        if before[field] != after[field]:
            raise ValueError('delivery changed ' + field)
    if Fraction(before['avg_frame_rate']) != Fraction(after['avg_frame_rate']):
        raise ValueError('delivery changed frame rate')
    if abs(float(before['duration']) - float(after['duration'])) > .001:
        raise ValueError('delivery changed video duration')
    source_audio = [s for s in source['streams'] if s['codec_type'] == 'audio']
    output_audio = [s for s in output['streams'] if s['codec_type'] == 'audio']
    if bool(source_audio) != bool(output_audio):
        raise ValueError('delivery changed audio presence')
    if source_audio:
        for field in ('codec_name', 'sample_rate', 'channels'):
            if source_audio[0][field] != output_audio[0][field]:
                raise ValueError('delivery changed audio ' + field)


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''):
            h.update(b)
    return h.hexdigest()


def mix_roi(original, restored, roi, strength=.25, max_delta=12):
    import numpy as np
    x, y, w, h = roi
    if restored.shape != (h, w, 3) or not 0 <= strength <= 1:
        raise ValueError('invalid restoration geometry/strength')
    if x < 0 or y < 0 or w < 1 or h < 1 or x+w > original.shape[1] or y+h > original.shape[0]:
        raise ValueError('ROI outside source')
    output = original.copy()
    source = original[y:y+h, x:x+w].astype(np.float32)
    delta = np.clip((restored.astype(np.float32)-source)*strength, -max_delta, max_delta)
    # Transition remains inside the filmed area; layout/title/logo stay exact.
    yy, xx = np.mgrid[:h, :w]
    weight = np.minimum(np.minimum(xx+1,w-xx),np.minimum(yy+1,h-yy))
    weight = np.clip((weight-1)/8.,0,1)[...,None]
    output[y:y+h,x:x+w] = np.clip(np.rint(source+delta*weight),0,255).astype(np.uint8)
    return output


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--checkpoint', type=Path, required=True)
    p.add_argument('--checkpoint-sha256', required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--roi', type=int, nargs=4, required=True, metavar=('X','Y','W','H'))
    p.add_argument('--strength', type=float, default=.25)
    p.add_argument('--window', type=int, default=3)
    p.add_argument('--context', type=int, default=2)
    p.add_argument('--scene-confirmed', action='store_true')
    args = p.parse_args()
    if not args.scene_confirmed:
        raise ValueError('confirm a single scene; never propagate across cuts')
    if not 0 < args.strength <= .5:
        raise ValueError('strength must be in (0,.5]')
    if not 1 <= args.window <= 6 or not 0 <= args.context <= 4:
        raise ValueError('window must be 1..6 and context 0..4')
    if sha256(args.checkpoint) != args.checkpoint_sha256:
        raise ValueError('checkpoint checksum mismatch')
    source_probe = probe_video(args.input)
    source_video = next(s for s in source_probe['streams'] if s['codec_type'] == 'video')
    if Fraction(source_video['avg_frame_rate']) != Fraction(source_video['r_frame_rate']):
        raise ValueError('variable frame rate requires timestamp-aware preparation')
    import cv2
    import numpy as np
    import torch
    from mmedit.models import build_backbone
    cap = cv2.VideoCapture(str(args.input))
    fps, total = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if not cap.isOpened() or not 2 <= total <= 80 or fps <= 0 or total/fps > 3:
        cap.release()
        raise ValueError('requires a complete single scene of 2..80 frames, at most 3 seconds')
    x,y,w,h = args.roi
    if min(w,h)<64 or w*h>700000:
        cap.release()
        raise ValueError('ROI must be native >=64 px and <=700000 pixels')
    target=args.output.resolve();target.mkdir(parents=True,exist_ok=False)
    report={'status':'running','input_sha256':sha256(args.input),'checkpoint_sha256':args.checkpoint_sha256,
            'fps':fps,'frames':total,'roi':args.roi,'strength':args.strength,
            'window':args.window,'context':args.context,'model_scale':4,
            'input_pre_downscale':False,'delivery_resize':'area x4 to native, explicitly intended restoration',
            'precision':'float32','quality_verdict':'not_evaluated','cost_usd':None,
            'cost_reason':'No provider billing supplied','model':'RealBasicVSRNet mmedit==0.16.0'}
    started=time.monotonic()
    def save(): (target/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    save()
    try:
        frames=[]
        while True:
            ok,frame=cap.read()
            if not ok:break
            if len(frames)>=total:raise ValueError('extra decoded frames')
            if x<0 or y<0 or x+w>frame.shape[1] or y+h>frame.shape[0]:raise ValueError('ROI outside source')
            frames.append(frame)
        if len(frames)!=total:raise ValueError('truncated input')
        device='cuda' if torch.cuda.is_available() else 'cpu'
        if device!='cuda':raise RuntimeError('real restoration requires GPU; no silent CPU run')
        report.update(gpu=torch.cuda.get_device_name(0),torch=torch.__version__,cuda=torch.version.cuda)
        net=build_backbone(dict(type='RealBasicVSRNet',is_sequential_cleaning=True))
        checkpoint=torch.load(str(args.checkpoint),map_location='cpu')
        state=checkpoint.get('state_dict',checkpoint)
        prefix='generator_ema.' if any(k.startswith('generator_ema.') for k in state) else 'generator.'
        weights={k[len(prefix):]:v for k,v in state.items() if k.startswith(prefix)}
        if not weights:raise ValueError('checkpoint missing generator weights')
        net.load_state_dict(weights,strict=True);del checkpoint,state,weights
        net=net.eval().to(device)
        torch.cuda.reset_peak_memory_stats();torch.cuda.synchronize()
        loading_done=time.monotonic()
        # Bounded windows: write central frames with context, never isolated frames.
        restored_dir=target/'frames';restored_dir.mkdir()
        for first in range(0,total,args.window):
            if (target/'cancel.flag').exists():raise RuntimeError('cancelled')
            if time.monotonic()-started>600:raise TimeoutError('600-second restoration deadline')
            last=min(first+args.window,total)
            a=max(0,first-args.context);b=min(total,last+args.context)
            tensor=np.stack([f[y:y+h,x:x+w,::-1].copy() for f in frames[a:b]])
            tensor=torch.from_numpy(tensor).permute(0,3,1,2).unsqueeze(0).float().to(device)/255
            with torch.no_grad():result=net(tensor)
            if result.shape != (1,b-a,3,h*4,w*4):raise ValueError('unexpected model output dimensions')
            for i in range(first,last):
                rgb=result[0,i-a].clamp(0,1).permute(1,2,0).cpu().numpy()
                native=cv2.resize(np.rint(rgb[...,::-1]*255).astype(np.uint8),(w,h),interpolation=cv2.INTER_AREA)
                final=mix_roi(frames[i],native,args.roi,args.strength)
                if not cv2.imwrite(str(restored_dir/f'{i:06d}.png'),final):raise OSError('PNG write failed')
            del tensor,result
        torch.cuda.synchronize()
        report.update(loading_seconds=loading_done-started,processing_seconds=time.monotonic()-loading_done,
                      peak_vram_allocated_bytes=torch.cuda.max_memory_allocated())
        subprocess.run(['ffmpeg','-nostdin','-n','-v','error','-framerate',source_video['avg_frame_rate'],'-i',str(restored_dir/'%06d.png'),
                        '-i',str(args.input),'-map','0:v:0','-map','1:a:0?','-c:v','libx264','-crf','14',
                        '-pix_fmt','yuv420p','-c:a','copy','-shortest',str(target/'candidate.mp4')],check=True,timeout=120)
        output_probe = probe_video(target/'candidate.mp4')
        validate_delivery(source_probe, output_probe)
        report.update(status='completed_candidate',output_sha256=sha256(target/'candidate.mp4'),
                      delivery_validation='passed',source_probe=source_probe,output_probe=output_probe)
    except BaseException as e:
        report.update(status='failed',error=f'{type(e).__name__}: {e}')
        raise
    finally:
        cap.release();report['elapsed_seconds']=time.monotonic()-started;save()


if __name__=='__main__':main()
