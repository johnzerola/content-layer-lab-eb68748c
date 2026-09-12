"""Sample-specific green-caption mask ablation. Not a universal text detector."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

ROI = (130, 1300, 820, 294)


def contamination_masks(frames):
    """Native BGR frames; glyph core + conservative stroke/shadow guard.

    Only the green caption style of this source is supported. Temporal union
    +/-1 makes a transparent transition conservative. Clean is not a GT claim.
    """
    bases, metadata = [], []
    for frame in frames:
        h, w = frame.shape[:2]
        b, g, r = [frame[..., c].astype(np.int16) for c in range(3)]
        spatial = np.zeros((h,w), np.uint8)
        spatial[1350:1540, 160:970] = 1
        core = ((g-r > 16) & (g-b > 12) & (g > 45) & (spatial > 0)).astype(np.uint8)
        count, labs, stats, _ = cv2.connectedComponentsWithStats(core, 8)
        filtered = np.zeros_like(core)
        for label in range(1, count):
            if stats[label, cv2.CC_STAT_AREA] >= 5:
                filtered[labs == label] = 255
        # 10 native pixels for the dark outline and antialias/shadow tails;
        # upstream's mask_dilation=2 remains identical in all model arms.
        base = cv2.dilate(filtered, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))
        bases.append(base)
        metadata.append({"green_core_pixels":int((filtered>0).sum()),
                         "mask_without_temporal_pixels":int((base>0).sum())})
    masks=[]
    for i, base in enumerate(bases):
        mask = base.copy()
        for j in (i-1,i+1):
            if 0<=j<len(bases): mask = np.maximum(mask,bases[j])
        masks.append(mask)
        metadata[i].update(mask_pixels=int((mask>0).sum()),
                           no_chroma_candidate=not bool(mask.any()),
                           uncertainty="style-specific colour/halo heuristic, no clean ground truth")
    return masks, metadata


def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    cap=cv2.VideoCapture(str(args.input)); frames=[]
    for i in range(147):
        ok,f=cap.read()
        if not ok:raise ValueError('incomplete source master')
        if i>=104:frames.append(f)
    cap.release()
    masks,meta=contamination_masks(frames)
    base=Path('G:/dowloand/teste/resultado-automatico-v2-20260909/scenes/0002/subtitle-policy')
    dirs={k:args.output/k for k in ('native-precise','roi-precise','native-current','roi-current','native-composite','roi-composite','native-safe-adaptive','roi-safe-adaptive','native-safe-wide','roi-safe-wide')}
    for d in dirs.values():d.mkdir(exist_ok=True)
    rows=[];x,y,w,h=ROI
    preview=np.zeros((11*165,4*820,3),np.uint8)
    for i,(f,m,stats) in enumerate(zip(frames,masks,meta)):
        current=cv2.imread(str(base/f'inference-masks/{i:06d}.png'),0)
        composite=cv2.imread(str(base/f'composite-masks/{i:06d}.png'),0)
        # Archived policy sometimes replaced uncertain/fading frames with the
        # whole 627x100 band. Keep its validated per-frame mask otherwise; on
        # fallback frames use a wider glyph/effect guard instead of the band.
        safe = composite if int((composite > 0).sum()) < 50_000 else cv2.dilate(
            m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
        # A wider controlled guard addresses dark/neon residues seen with A1-A3.
        # Empty clean candidates stay empty; no whole-band fallback is restored.
        seed = composite if int((composite > 0).sum()) < 50_000 else m
        wide = cv2.dilate(seed, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) if seed.any() else seed
        for k,img in [('native-precise',m),('roi-precise',m[y:y+h,x:x+w]),('native-current',current),('roi-current',current[y:y+h,x:x+w]),('native-composite',composite),('roi-composite',composite[y:y+h,x:x+w]),('native-safe-adaptive',safe),('roi-safe-adaptive',safe[y:y+h,x:x+w]),('native-safe-wide',wide),('roi-safe-wide',wide[y:y+h,x:x+w])]:
            if not cv2.imwrite(str(dirs[k]/f'{i:06d}.png'),img):raise IOError(k)
        stats.update(source_frame=i+104,current_mask_pixels=int((current>0).sum()),
                     safe_adaptive_pixels=int((safe>0).sum()),
                     safe_wide_pixels=int((wide>0).sum()),
                     used_archived_fallback=bool(int((composite>0).sum()) >= 50_000),
                     newly_exposed_context_pixels=int(((current>0)&(m==0)).sum()),
                     mask_outside_current_pixels=int(((current==0)&(m>0)).sum()))
        rows.append(stats)
        patch=f[1375:1520,130:950].copy();support=m[1375:1520,130:950]>0
        patch[support]=(patch[support].astype(float)*.65+np.array([0,0,255])*.35).astype(np.uint8)
        left=(i%4)*820;top=(i//4)*165
        cv2.putText(preview,f'f{i+104} core={stats["green_core_pixels"]} mask={stats["mask_pixels"]}',(left+5,top+16),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1)
        preview[top+20:top+165,left:left+820]=patch
    cv2.imwrite(str(args.output/'mask-contact-sheet.png'),preview)
    report={'experiment':'A: inference mask only; composition support fixed to archived mask',
            'roi_xywh':ROI,'frames':rows,'mask_parameters':{'green_minus_red':16,'green_minus_blue':12,'green_min':45,'component_min':5,'halo_radius':10,'temporal_guard_frames':1,'upstream_dilation_fixed':2},
            'source':str(args.input),'source_sha256':hashlib.sha256(args.input.read_bytes()).hexdigest(),
            'limitations':['Mask is specific to green caption in this clip. Unseen black-only effect may escape colour core.',
                          'Unmasked context is a hypothesis, not a clean ground truth annotation.','Same ROI and composition masks are fixed for inference comparison.']}
    (args.output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'frames':len(rows),'mean_precise_pixels':np.mean([r['mask_pixels'] for r in rows]),'zero_mask_source_frames':[r['source_frame'] for r in rows if not r['mask_pixels']]}))


if __name__=='__main__': main()
