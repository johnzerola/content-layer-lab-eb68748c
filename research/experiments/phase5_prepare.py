"""Freeze B2 and prepare a conservative sweater-only local restoration case."""
import json
from pathlib import Path
import shutil
import time
import cv2
import numpy as np
from phase23_color import Reader, digest

OUT = Path('G:/dowloand/teste/phase-5-20260911')
P3 = Path('G:/dowloand/teste/phase-2-3-20260910')
ROI = (280, 1328, 512, 224)
TARGET = list(range(116, 134))
CONTEXT = list(range(114, 136))
LABELS = {'DO_NOT_TOUCH': 0, 'SAFE_TO_KEEP_FROM_B2': 1,
          'LOW_TEXTURE_CONFIDENCE': 2, 'RESTORE_CANDIDATE': 3}


def save(path, array):
    path.parent.mkdir(parents=True, exist_ok=True)
    assert cv2.imwrite(str(path), array)


def main():
    start = time.perf_counter()
    baseline = P3/'candidates/B2-real-donors-clipped-C2/master.mp4'
    frozen = OUT/'baseline/B2-finish-OFF-rgb-lossless.mp4'
    frozen.parent.mkdir(parents=True, exist_ok=True)
    if not frozen.exists():
        shutil.copy2(baseline, frozen)
    assert digest(frozen) == digest(baseline), 'Baseline drift'
    inputs = {'B2': (frozen, False), 'SOURCE': (P3/'phase2/input.mp4', False),
              'BASELINE_V3': (Path('G:/dowloand/teste/resultado-automatico-v3-20260909/output.mp4'), True),
              'VMAKE_REFERENCE_ONLY': (Path('G:/dowloand/teste/VMAKE.IA.mp4'), True)}
    alignment = json.loads(Path('G:/dowloand/teste/analise-microtextura-20260910/alignment.json').read_text())
    matched = {r['source_frame']: r['reference_frame'] for r in alignment['per_frame']}
    frames = {}
    provenance = {}
    for name, (path, yuv) in inputs.items():
        reader = Reader(path, yuv709=yuv)
        wanted = set(matched[i] if name == 'VMAKE_REFERENCE_ONLY' else i for i in CONTEXT)
        frames[name] = {}
        for i in range(147):
            f = reader.frame()
            if i in wanted:
                frames[name][i] = f.copy()
        reader.close()
        provenance[name] = dict(path=str(path), sha256=digest(path), explicit_bt709_decode=yuv)
        for i in CONTEXT:
            j = matched[i] if name == 'VMAKE_REFERENCE_ONLY' else i
            save(OUT/'input'/name/f'{i:06d}.png', frames[name][j])
    x,y,w,h = ROI
    rows = []
    for i in CONTEXT:
        b2, source = frames['B2'][i], frames['SOURCE'][i]
        archive = cv2.imread(str(P3/'phase2/masks'/f'{i:06d}.png'), 0)
        safe = cv2.imread(str(P3/'masks/native-safe-wide'/f'{i-104:06d}.png'), 0)
        donor = cv2.imread(str(P3/'donors/primary/labels'/f'{i:06d}.png'), 0)
        assert archive is not None and safe is not None and donor.shape == (410,820)
        keep_real = np.zeros(archive.shape, bool)
        keep_real[1240:1650,130:950] = donor == 1
        # Entire frame outside the manually reviewed sweater interior is protected.
        interior = np.zeros(archive.shape, np.uint8)
        interior[1370:1508,312:760] = 1
        equal = np.all(b2 == source, axis=2)
        support = (archive > 0) & (safe > 0) & (interior > 0)
        protected = keep_real | equal
        eligible = support & ~protected
        # Pure support erosion prevents feather from extending into correct pixels.
        eroded = cv2.erode(eligible.astype(np.uint8), np.ones((7,7),np.uint8)) > 0
        label = np.zeros(archive.shape, np.uint8)
        label[interior > 0] = LABELS['SAFE_TO_KEEP_FROM_B2']
        label[eligible] = LABELS['LOW_TEXTURE_CONFIDENCE']
        if i in TARGET:
            label[eroded] = LABELS['RESTORE_CANDIDATE']
        save(OUT/'decision/labels'/f'{i:06d}.png', label)
        # Confidence is categorical evidence of donor availability, NOT probability.
        low_confidence = eligible.astype(np.uint16)*65535
        save(OUT/'decision/low-confidence'/f'{i:06d}.png', low_confidence)
        mask = (label == 3).astype(np.uint8)
        feather = np.clip(cv2.distanceTransform(mask, cv2.DIST_L2, 5)/6,0,1)
        save(OUT/'decision/alpha'/f'{i:06d}.png', np.rint(feather*65535).astype(np.uint16))
        crop = b2[y:y+h,x:x+w]
        save(OUT/'model-input'/f'{i:06d}.png', crop)
        colors = np.array([[0,0,0],[80,160,80],[0,170,255],[220,60,210]],np.uint8)
        overlay = b2.copy()
        inside = label > 0
        overlay[inside] = np.rint(.65*b2[inside]+.35*colors[label[inside]]).astype(np.uint8)
        save(OUT/'decision/overlay'/f'{i:06d}.png', overlay)
        rows.append(dict(frame=i, reference_frame=matched[i], labels={k:int((label==v).sum()) for k,v in LABELS.items()},
                         real_donors_protected=int((keep_real & support).sum()), mask_sha256=digest(OUT/'decision/labels'/f'{i:06d}.png')))
    result = dict(baseline='B2 finish OFF', provenance=provenance, roi_xywh=ROI,
                  target_frames=TARGET, context_frames=CONTEXT, labels=LABELS,
                  confidence_method='Conservative categorical mask: archived AND safe-wide AND sweater interior; exclude B2==SOURCE and accepted real donors; erode 3 px; feather 6 px inside only. No calibrated probability or Vmake metric used.',
                  alignment_method=alignment['method'], rows=rows, seconds=time.perf_counter()-start,
                  full_scene_authorized_by_quality=False, production=False)
    (OUT/'manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'prepared':str(OUT), 'target_frames':TARGET, 'candidate_pixels':sum(r['labels']['RESTORE_CANDIDATE'] for r in rows)}))


if __name__ == '__main__':
    main()
