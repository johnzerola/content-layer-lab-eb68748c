"""Compose only decision-map pixels and measure fixed-support temporal regressions.

No clean sweater ground truth exists. HF energy is descriptive, never acceptance.
Temporal proxy uses identical B2-estimated flow for both variants, with forward /
backward consistency and in-bounds checks. It cannot certify absence of flicker.
"""
import json
import time
import cv2
import numpy as np
from phase5_prepare import OUT, ROI, TARGET, CONTEXT, save
from phase23_color import Reader, rgb_writer, encode_delivery, SOURCE, digest


def gray(bgr):
    b,g,r = cv2.split(bgr.astype(np.float32))
    return .0722*b+.7152*g+.2126*r


def descriptors(frame, mask):
    g = gray(frame)
    high = g-cv2.GaussianBlur(g,(0,0),1)
    dx = cv2.Sobel(g,cv2.CV_32F,1,0)/8
    dy = cv2.Sobel(g,cv2.CV_32F,0,1)/8
    return dict(hf_rms=float(np.sqrt(np.mean(high[mask]**2))),
                gradient_rms=float(np.sqrt(np.mean((dx*dx+dy*dy)[mask]))),
                luma=float(g[mask].mean()))


def temporal_pair(prev, cur, previous_variant, variant, prev_mask, mask):
    a,b = gray(prev).astype(np.uint8),gray(cur).astype(np.uint8)
    backward = cv2.calcOpticalFlowFarneback(b,a,None,.5,3,21,5,7,1.5,0)
    forward = cv2.calcOpticalFlowFarneback(a,b,None,.5,3,21,5,7,1.5,0)
    yy,xx = np.mgrid[:a.shape[0],:a.shape[1]].astype(np.float32)
    mx,my = xx+backward[...,0],yy+backward[...,1]
    remap = lambda arr: cv2.remap(arr,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    fb = np.linalg.norm(backward+remap(forward),axis=2)
    valid = (mx>=1)&(my>=1)&(mx<a.shape[1]-2)&(my<a.shape[0]-2)&(fb<1)
    valid &= mask & (remap(prev_mask.astype(np.float32))>.99)
    valid &= np.abs(gray(cur)-remap(gray(prev)))<12
    if not valid.any():
        return dict(pixels=0, baseline_warp_mae=None, candidate_warp_mae=None)
    return dict(pixels=int(valid.sum()), mean_fb_error=float(fb[valid].mean()),
                baseline_warp_mae=float(np.abs(gray(cur)-remap(gray(prev)))[valid].mean()),
                candidate_warp_mae=float(np.abs(gray(variant)-remap(gray(previous_variant)))[valid].mean()),
                correction_warp_mae=float(np.abs((gray(variant)-gray(cur))-remap(gray(previous_variant)-gray(prev)))[valid].mean()))


def compose(strength, name):
    root = OUT/'candidates'/name
    root.mkdir(parents=True,exist_ok=True)
    x,y,w,h = ROI
    rows, temporal = [],[]
    prev = None
    for i in TARGET:
        base = cv2.imread(str(OUT/'input/B2'/f'{i:06d}.png'))
        labels = cv2.imread(str(OUT/'decision/labels'/f'{i:06d}.png'),0)
        alpha = cv2.imread(str(OUT/'decision/alpha'/f'{i:06d}.png'),-1).astype(np.float32)/65535
        mask = labels==3
        raw = np.load(OUT/'native-float'/f'{i:06d}.npy')[...,::-1]*255
        patch = base[y:y+h,x:x+w].astype(np.float32)
        temporal_alpha = min(1,(i-TARGET[0]+1)/3,(TARGET[-1]-i+1)/3)
        delta = np.clip((raw-patch)*strength,-6,6)*alpha[y:y+h,x:x+w,None]*temporal_alpha
        result = base.copy()
        proposed = np.clip(np.rint(patch+delta),0,255).astype(np.uint8)
        local_mask = mask[y:y+h,x:x+w]
        result_roi = result[y:y+h,x:x+w]
        result_roi[local_mask] = proposed[local_mask]
        diff = np.abs(result.astype(np.int16)-base.astype(np.int16))
        changed = np.any(diff!=0,axis=2)
        assert not changed[~mask].any(), 'Hard protection gate failed'
        save(root/'composite'/f'{i:06d}.png',result)
        save(root/'delta-x16'/f'{i:06d}.png',np.clip(diff*16,0,255).astype(np.uint8))
        rows.append(dict(frame=i, changed_pixels=int(changed.sum()), max_delta=int(diff.max()),
                         outside_changed=0, baseline=descriptors(base,mask),candidate=descriptors(result,mask),
                         mean_abs_delta=float(diff[mask].mean())))
        crop = base[y:y+h,x:x+w]
        if prev:
            temporal.append(dict(frame=i,**temporal_pair(prev[0],crop,prev[1],result_roi,prev[2],local_mask)))
        prev = (crop.copy(),result_roi.copy(),local_mask.copy())
    # Preserve all 147 frames; only the already evaluated short segment is modified.
    reader = Reader(OUT/'baseline/B2-finish-OFF-rgb-lossless.mp4')
    writer = rgb_writer(root/'master.mp4')
    for i in range(147):
        f = reader.frame()
        if i in TARGET:
            f = cv2.imread(str(root/'composite'/f'{i:06d}.png'))
        writer.stdin.write(f.tobytes())
    reader.close()
    writer.stdin.close()
    assert writer.wait()==0
    # Decode master again: require exact B2 equality outside eligible pixels,
    # including the buckle scene, face, hair, window, edges and all non-target frames.
    a,b = Reader(OUT/'baseline/B2-finish-OFF-rgb-lossless.mp4'),Reader(root/'master.mp4')
    outside_changes = 0
    for i in range(147):
        f,g = a.frame(),b.frame()
        use = cv2.imread(str(OUT/'decision/labels'/f'{i:06d}.png'),0)==3 if i in TARGET else np.zeros(f.shape[:2],bool)
        outside_changes += int(np.any(f[~use]!=g[~use],axis=1).sum())
        if i in TARGET:
            assert np.array_equal(g,cv2.imread(str(root/'composite'/f'{i:06d}.png')))
    a.close(); b.close()
    assert outside_changes==0
    encoding = encode_delivery(root/'master.mp4',SOURCE,root/'delivery-crf14.mp4')
    # Proxy predeclared gate: >5% increase in confidence-gated temporal error rejects.
    valid = [r for r in temporal if r['pixels']]
    count = sum(r['pixels'] for r in valid)
    before = sum(r['baseline_warp_mae']*r['pixels'] for r in valid)/count
    after = sum(r['candidate_warp_mae']*r['pixels'] for r in valid)/count
    report = dict(name=name, variable='blend strength only',strength=strength, max_delta_cap=6,
                  temporal_ramp='3 frames at each short-test boundary', spatial_feather_px=6,
                  rows=rows, temporal=temporal, temporal_baseline_mae=before, temporal_candidate_mae=after,
                  temporal_error_change_pct=100*(after/before-1),
                  outside_changed_after_lossless_decode=outside_changes,
                  hard_preservation='PASS', temporal_proxy='REJECT' if after>before*1.05 else 'PASS_PROXY_ONLY',
                  decision='RETEST_VISUAL_MOTION', master_sha256=digest(root/'master.mp4'), encoding=encoding,
                  caveat='No clean texture ground truth. Exact protection applies to lossless master; lossy delivery can change pixels globally.')
    (root/'metrics.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['name','temporal_baseline_mae','temporal_candidate_mae','temporal_proxy','outside_changed_after_lossless_decode']}),flush=True)


if __name__ == '__main__':
    assert json.loads((OUT/'inference.json').read_text())['frames']==TARGET
    started=time.perf_counter()
    compose(.2,'A20')
    compose(.4,'A40')
    (OUT/'evaluation-time.json').write_text(json.dumps({'seconds':time.perf_counter()-started}))
