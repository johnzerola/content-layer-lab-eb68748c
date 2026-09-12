"""Separate phase-2 boundary A/B on a completed junction comparison."""
import argparse
from dataclasses import asdict
from itertools import zip_longest
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cv2
from app.services.inference_region import _write_video, _check_cancel
from app.services.mask import build_masks_window
from app.services.chunking import localize_masks
from app.video.subtitle_junctions import exclusion_mask
from app.video.subtitle_seams import correct_seam
from app.utils.video import read_frames, probe, ffmpeg_filter, mux_audio
from validate_pixel_preservation import compare, sha256


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('v3', type=Path)
    parser.add_argument('phase2', type=Path)
    parser.add_argument('--regions', type=Path, required=True)
    args = parser.parse_args()
    previous = json.loads((args.phase2 / 'manifest.json').read_text(encoding='utf-8'))
    v3 = json.loads((args.v3 / 'manifest.json').read_text(encoding='utf-8'))
    if previous['status'] != 'completed_candidate':
        raise ValueError('phase-2 comparison incomplete')
    source = args.v3 / 'input.mp4'
    info = probe(str(source))
    if info.duration > 5.001 or sha256(source) != previous['source_sha256'] or sha256(args.regions) != previous['regions_sha256']:
        raise ValueError('phase-2 source/regions mismatch')
    if sha256(args.phase2 / 'reference.mp4') != previous['exports']['reference']['sha256']:
        raise ValueError('phase-2 reference output changed')
    master = args.phase2 / 'seam-master.mp4'
    if master.exists() or (args.phase2 / 'seam.mp4').exists():
        raise ValueError('seam candidate already exists')
    regions = json.loads(args.regions.read_text(encoding='utf-8-sig'))
    stats = {'status': 'running', 'method': 'bounded screened-Poisson colour correction from safe exterior',
             'frame_reports': [], 'baseline_master_sha256': sha256(args.phase2 / 'reference-master.mp4')}
    stats['implementation'] = sha256(Path(__file__).resolve().parents[1] / 'app/video/subtitle_seams.py')
    masks = []
    def frames():
        for s, part in enumerate(v3['parts']):
            directory = Path(part['path']).parent
            local = args.phase2 / 'scenes' / f'{s:04d}'
            scene = probe(str(directory / 'input.mp4'))
            left, top, right, bottom = previous['scenes'][s]['crop_xyxy']
            def crop(a):
                return a[top:bottom, left:right]
            offset = v3['scene_spans'][s][0]
            localized = localize_masks(regions, offset / info.fps, scene.duration)
            if sha256(directory / 'propainter-native.mp4') != previous['native_sha256'][s]:
                raise ValueError('native cache changed')
            streams = [read_frames(str(p)) for p in (directory / 'input.mp4', directory / 'propainter-native.mp4', local / 'reference-master.mp4')]
            count = 0
            try:
                for i, (a, b, result) in enumerate(zip_longest(*streams)):
                    _check_cancel(str(args.phase2 / 'cancel.flag'))
                    if a is None or b is None or result is None or i >= scene.frames:
                        raise ValueError('seam scene count mismatch')
                    raw = cv2.imread(str(directory / 'masks' / f'{i:06d}.png'), 0)
                    mp = directory / 'subtitle-policy/composite-masks' / f'{i:06d}.png'
                    mask = cv2.imread(str(mp), 0)
                    remove, protect = build_masks_window(localized, scene.width, scene.height, i, 1, scene.fps)
                    allowed = cv2.bitwise_and(remove[0], cv2.bitwise_not(protect[0]))
                    excluded = exclusion_mask(crop(a), crop(raw), crop(allowed))
                    excluded = cv2.bitwise_or(excluded, crop(protect[0]))
                    selected = crop(cv2.bitwise_and(mask, allowed))
                    adjusted, report = correct_seam(crop(a), crop(b), crop(result), selected, excluded)
                    crop(result)[:] = adjusted
                    stats['frame_reports'].append({'frame': offset + i, **report})
                    masks.append(mp)
                    count += 1
                    yield result
                if count != scene.frames:
                    raise ValueError('incomplete seam scene')
            finally:
                for stream in streams:
                    stream.close()
    start = time.monotonic()
    try:
        _write_video(master, info.width, info.height, info.fps, frames())
        fidelity = compare(master, source, masks)
        if fidelity['outside']['changed_pixels']:
            raise ValueError('seam changed exterior pixels')
        delivery = ffmpeg_filter(str(master), str(args.phase2 / 'seam-delivery.mp4'), 'null', crf=14)
        output = args.phase2 / 'seam.mp4'
        mux_audio(delivery, str(source), str(output), info.has_audio)
        if asdict(probe(str(output))) != asdict(info):
            raise ValueError('seam delivery timing changed')
        stats.update(status='completed_candidate', seconds=time.monotonic() - start,
                     master_vs_source=fidelity, output_sha256=sha256(output), media=asdict(info))
    except BaseException as e:
        stats.update(status='failed', error=str(e))
        raise
    finally:
        (args.phase2 / 'seam-report.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
