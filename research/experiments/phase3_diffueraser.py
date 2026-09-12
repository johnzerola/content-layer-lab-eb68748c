"""Isolated phase-3 probe. Original scene -> DiffuEraser; never a prior output.

One scene, one attempt, ten-minute deadline, no cloud provisioning. Run using
the local DiffuEraser interpreter. Failure logs remain evidence, not a result.
"""
import argparse
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'backend'))


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path('G:/cleaneria-runtime'))
    parser.add_argument('--v3', type=Path, default=Path('G:/dowloand/teste/resultado-automatico-v3-20260909'))
    parser.add_argument('--scene', type=int, choices=(0, 2), default=2)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    target = args.output.resolve()
    if not target.is_relative_to(ROOT / 'benchmarks'):
        raise ValueError('experiment output must stay in research/benchmarks')
    target.mkdir(parents=True, exist_ok=False)
    report = {'status': 'preparing', 'scene': args.scene, 'attempts': 0,
              'billed_seconds': None, 'cost_usd': None,
              'cost_reason': 'Local GPU only; no provider billing or electricity measurement',
              'quality_verdict': 'not_evaluated', 'script_sha256': digest(__file__)}
    def save():
        (target / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    started = time.monotonic()
    process = None
    try:
        import torch
        from app.engines.diffueraser_official import build_diffueraser_command, diffueraser_status
        from app.services.inference_region import prepare_inference_region, restore_inference_region
        from app.services.pixel_composite import composite_lossless
        from app.utils.video import probe, masks_to_video, ffmpeg_filter
        runtime = args.runtime.resolve()
        os.environ.update(DIFFUERASER_ROOT=str(runtime / 'DiffuEraser'),
                          DIFFUERASER_MODELS_ROOT=str(runtime / 'diffueraser-models'),
                          DIFFUERASER_PYTHON=sys.executable,
                          DIFFUERASER_MAX_SIDE='960', DIFFUERASER_MASK_DILATION='4',
                          HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
        old = json.loads((args.v3 / 'manifest.json').read_text(encoding='utf-8'))
        if digest(args.v3 / 'input.mp4') != old['source_sha256']:
            raise ValueError('v3 original checksum mismatch')
        part = old['parts'][args.scene]
        baseline = Path(part['path'])
        if digest(baseline) != part['sha256']:
            raise ValueError('baseline checksum mismatch')
        source = baseline.parent / 'input.mp4'
        masks = baseline.parent / 'subtitle-policy/composite-masks'
        info = probe(str(source))
        start, end = old['scene_spans'][args.scene]
        if info.frames != end - start or not 22 <= info.frames <= 80 or info.duration > 3:
            raise ValueError('requires one complete reviewed short scene')
        report.update(source=str(source), source_sha256=digest(source),
                      baseline=str(baseline), baseline_sha256=digest(baseline), media=asdict(info),
                      mask_kind='v3 composition masks, followed by upstream dilation=4',
                      masks={p.name: digest(p) for p in sorted(masks.glob('*.png'))},
                      torch=torch.__version__, cuda=torch.version.cuda,
                      gpu=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
                      vram_total_bytes=torch.cuda.get_device_properties(0).total_memory if torch.cuda.is_available() else None,
                      readiness=diffueraser_status().as_dict())
        save()
        if not report['readiness']['ready']:
            raise RuntimeError('DiffuEraser runtime incomplete')
        # Independently verify the scene really is the original source slice.
        import numpy as np
        from app.utils.video import read_frames
        original = read_frames(str(args.v3 / 'input.mp4'))
        scene = read_frames(str(source))
        try:
            for i, frame in enumerate(original):
                if start <= i < end and not np.array_equal(frame, next(scene, None)):
                    raise ValueError('scene differs from original pixels')
                if i >= end:
                    break
            if next(scene, None) is not None:
                raise ValueError('extra scene frames')
        finally:
            original.close()
            scene.close()
        region = prepare_inference_region(str(source), str(masks), str(target), info)
        report['roi'] = asdict(region)
        mask_video = target / 'mask.mp4'
        masks_to_video(region.mask_dir, str(mask_video), info.fps)
        command = build_diffueraser_command(region.source_path, str(mask_video), str(target / 'model'), info.duration)
        report.update(command=command, status='prepared')
        save()
        if args.prepare_only:
            return
        # Isolated working directory resolves PCM weights without modifying upstream.
        work = target / 'runtime'
        work.mkdir()
        import shutil
        pcm = work / 'weights/PCM_Weights/sd15'
        pcm.mkdir(parents=True)
        shutil.copy2(runtime / 'diffueraser-models/PCM_Weights/sd15/pcm_sd15_smallcfg_2step_converted.safetensors', pcm)
        env = os.environ.copy()
        env['PYTHONPATH'] = str(runtime / 'DiffuEraser')
        report.update(status='running', attempts=1)
        save()
        with (target / 'inference.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 600
            while process.poll() is None:
                if (target / 'cancel.flag').exists():
                    raise RuntimeError('experiment cancelled')
                if time.monotonic() > deadline:
                    raise TimeoutError('600-second inference deadline')
                time.sleep(1)
            report['returncode'] = process.returncode
        if process.returncode:
            tail = (target / 'inference.log').read_text(encoding='utf-8', errors='replace')[-6000:]
            report['failure_tail'] = tail
            raise RuntimeError('CUDA OOM' if 'out of memory' in tail.lower() else 'upstream inference failed; see log')
        candidate = target / 'model/diffueraser_result.mp4'
        model_info = probe(str(candidate))
        if model_info.frames != info.frames:
            raise ValueError('truncated or extended output rejected')
        report['model_media'] = asdict(model_info)
        report['model_resampled'] = (model_info.width, model_info.height) != (region.width, region.height)
        native = restore_inference_region(str(candidate), region, str(source), str(target / 'native.mp4'), info)
        master = composite_lossless(source, native, masks, target / 'master.mp4', info)
        ffmpeg_filter(master, str(target / 'candidate.mp4'), 'null', crf=14)
        report.update(status='completed_candidate', output_sha256=digest(target / 'candidate.mp4'),
                      note='Silent scene diagnostic; not a finished user video or an approved model')
    except BaseException as exc:
        report.update(status='failed', error=f'{type(exc).__name__}: {exc}')
        raise
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        report['elapsed_seconds'] = time.monotonic() - started
        save()


if __name__ == '__main__':
    main()
