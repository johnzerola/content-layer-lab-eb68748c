"""Streaming, aligned PNG-sequence benchmarks; no production imports or GPU jobs."""
from __future__ import annotations

import json
import math
import platform
import shutil
import time
from pathlib import Path
from uuid import uuid4

import cv2
import numpy as np
import psutil

from lab.core import ROOT, confined, digest, now


def sequence(directory):
    folder = Path(directory)
    if not folder.is_dir() or folder.is_symlink():
        raise ValueError('A local directory of aligned PNG frames is required')
    files = sorted(folder.glob('*.png'))
    if not files or len(files) > 10000 or any(p.is_symlink() for p in files):
        raise ValueError('Expected 1..10000 regular PNG frames')
    return files


def read_frame(path, mask=False):
    data = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE if mask else cv2.IMREAD_COLOR)
    if data is None:
        raise ValueError(f'Unreadable frame: {path.name}')
    if data.shape[0] * data.shape[1] > 4096 * 4096:
        raise ValueError('Frame exceeds 4096x4096 pixel budget')
    return data


def sequence_hash(files):
    import hashlib
    return hashlib.sha256('\n'.join(p.name + ':' + digest(p) for p in files).encode()).hexdigest()


def load_case(manifest):
    file = confined(ROOT / 'research/benchmarks', manifest)
    case = json.loads(file.read_text(encoding='utf-8'))
    if not case.get('id') or not math.isfinite(case['fps']) or case['fps'] <= 0:
        raise ValueError('Case needs id and finite positive FPS')
    streams = {}
    for name in ('input', 'mask', 'ground_truth'):
        if case.get(name):
            directory = confined(file.parent, case[name], exists=False)
            streams[name] = sequence(directory)
    if 'input' not in streams or 'mask' not in streams:
        raise ValueError('Case requires input and mask')
    names = [p.name for p in streams['input']]
    if any([p.name for p in files] != names for files in streams.values()):
        raise ValueError('Frame names and counts must align exactly')
    if case.get('frames') != len(names):
        raise ValueError('Manifest frame count mismatch')
    shape = read_frame(streams['input'][0]).shape
    for name, files in streams.items():
        for p in files:
            frame = read_frame(p, name == 'mask')
            if frame.shape[:2] != shape[:2]:
                raise ValueError('Frame geometry mismatch')
            if name == 'mask' and not np.isin(frame, [0, 255]).all():
                raise ValueError('Metric masks must be binary 0/255; keep alpha separately')
    return case, streams


def ssim(a, b):
    """Mean local SSIM on BGR channels, Gaussian 11x11 sigma=1.5, reflect border."""
    x, y = a.astype(np.float64), b.astype(np.float64)
    mu_x, mu_y = cv2.GaussianBlur(x, (11, 11), 1.5), cv2.GaussianBlur(y, (11, 11), 1.5)
    var_x = cv2.GaussianBlur(x*x, (11, 11), 1.5) - mu_x*mu_x
    var_y = cv2.GaussianBlur(y*y, (11, 11), 1.5) - mu_y*mu_y
    cov = cv2.GaussianBlur(x*y, (11, 11), 1.5) - mu_x*mu_y
    return float(np.mean(((2*mu_x*mu_y + 6.5025)*(2*cov + 58.5225)) /
                         ((mu_x*mu_x + mu_y*mu_y + 6.5025)*(var_x + var_y + 58.5225))))


def evaluate(streams, outputs, cuts=()):
    inputs, masks, truth = streams['input'], streams['mask'], streams.get('ground_truth')
    if [p.name for p in outputs] != [p.name for p in inputs]:
        raise ValueError('Output frames must match input names and count exactly')
    outside_sum = outside_n = boundary_sum = boundary_n = mse_sum = mse_n = 0
    temporal, similarities, sharpness = [], [], []
    previous = None
    for index, (src, mask, output) in enumerate(zip(inputs, masks, outputs)):
        a, b, m = read_frame(src), read_frame(output), read_frame(mask, True) > 0
        if a.shape != b.shape:
            raise ValueError('Output geometry mismatch')
        delta = np.abs(a.astype(np.float32) - b.astype(np.float32)) / 255
        outside_sum += float(delta[~m].sum())
        outside_n += int((~m).sum()) * 3
        rim = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        rim &= ~m
        boundary_sum += float(delta[rim].sum())
        boundary_n += int(rim.sum()) * 3
        gray = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
        sharpness.append(float(cv2.Laplacian(gray, cv2.CV_64F).var()))
        if truth:
            gt = read_frame(truth[index])
            if gt.shape != b.shape:
                raise ValueError('Ground truth geometry mismatch')
            err = (b.astype(np.float64) - gt.astype(np.float64)) / 255
            mse_sum += float((err*err).sum())
            mse_n += err.size
            similarities.append(ssim(b, gt))
            if previous is not None and index not in cuts:
                temporal.append(float(np.mean(np.abs(err - previous))))
            previous = err
    mse = mse_sum / mse_n if mse_n else None
    return {'outside_mask_mae': outside_sum / outside_n if outside_n else None,
            'boundary_outside_mae': boundary_sum / boundary_n if boundary_n else None,
            'mse_gt': mse, 'psnr_db': -10*math.log10(mse) if mse is not None and mse > 0 else None,
            'perfect_gt_match': mse == 0 if mse is not None else None,
            'ssim_gt': float(np.mean(similarities)) if similarities else None,
            'temporal_error_delta_proxy': float(np.mean(temporal)) if temporal else None,
            'laplacian_variance_proxy': float(np.mean(sharpness)),
            'lpips': None, 'ocr_residual': None, 'ghosting': None,
            'unavailable_reasons': {'lpips': 'Optional learned metric not installed',
                                    'ocr_residual': 'Requires separately validated OCR annotations',
                                    'ghosting': 'Requires flow/occlusion or blinded human review'},
            'limitations': 'Temporal proxy is unwarped error change, not perceptual flicker. Sharpness can reward noise.'}


def benchmark_engine(manifest, engine='identity', radius=3):
    if engine not in {'identity', 'opencv-telea'} or not 1 <= radius <= 20:
        raise ValueError('Supported engines: identity, opencv-telea; radius 1..20')
    case, streams = load_case(manifest)
    run_id = uuid4().hex
    directory = ROOT / 'research/benchmarks/runs' / run_id
    output = directory / 'output'
    output.mkdir(parents=True)
    started, peak_rss = time.perf_counter(), 0
    process = psutil.Process()
    for src, mask in zip(streams['input'], streams['mask']):
        frame, m = read_frame(src), read_frame(mask, True)
        result = frame if engine == 'identity' else cv2.inpaint(frame, m, radius, cv2.INPAINT_TELEA)
        if not cv2.imwrite(str(output / src.name), result):
            raise RuntimeError('Unable to write output frame')
        peak_rss = max(peak_rss, process.memory_info().rss)
    elapsed = time.perf_counter() - started
    metrics = evaluate(streams, sequence(output), case.get('scene_cuts', []))
    report = {'schema_version': 1, 'id': run_id, 'created_at': now(), 'case_id': case['id'],
              'case_kind': case.get('kind', 'unspecified'), 'categories': case.get('categories', []),
              'engine': engine, 'parameters': {'radius': radius} if engine != 'identity' else {},
              'inputs': {k: sequence_hash(v) for k, v in streams.items()}, 'fps': case['fps'],
              'frames': len(streams['input']), 'seconds': elapsed,
              'processed_fps': len(streams['input']) / elapsed,
              'seconds_per_processed_second': elapsed / (len(streams['input']) / case['fps']),
              'ram_sampled_peak_bytes': peak_rss, 'ram_scope': 'Whole lab process, sampled after each frame',
              'gpu': None, 'vram_peak_bytes': None, 'runpod_cost_usd': None,
              'timing_scope': 'PNG decode + CPU engine + PNG encode, excludes quality evaluation',
              'environment': {'python': platform.python_version(), 'platform': platform.platform(),
                              'opencv': cv2.__version__, 'numpy': np.__version__},
              'metrics': metrics, 'result_path': output.relative_to(ROOT).as_posix(),
              'output_sha256': sequence_hash(sequence(output)),
              'claim_scope': 'Harness control; not Cleaner GPU or commercial quality evidence'}
    (directory / 'report.json').write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
    return {**report, 'report_path': (directory / 'report.json').relative_to(ROOT).as_posix()}


def compare_results(report_paths):
    if not 2 <= len(report_paths) <= 10:
        raise ValueError('Provide 2..10 benchmark reports')
    reports = [json.loads(confined(ROOT / 'research/benchmarks', p).read_text(encoding='utf-8')) for p in report_paths]
    first = reports[0]
    keys = ('case_id', 'inputs', 'fps', 'frames')
    if any(any(r[k] != first[k] for k in keys) for r in reports[1:]):
        raise ValueError('Reports must share case, input/mask/GT hashes, FPS and frame count')
    return {'case_id': first['case_id'], 'results': [{'id': r['id'], 'engine': r['engine'],
            'seconds': r['seconds'], 'metrics': r['metrics']} for r in reports],
            'verdict': 'REVIEW_REQUIRED', 'reason': 'Single-case metrics do not establish overall superiority'}


def import_result(manifest, output_directory, engine, provenance):
    """Evaluate aligned external frames. Original job telemetry must remain separate."""
    case, streams = load_case(manifest)
    if not engine.strip() or not provenance:
        raise ValueError('Engine label and provenance required')
    outputs = sequence(confined(ROOT / 'research/benchmarks', output_directory, exists=False))
    metrics = evaluate(streams, outputs, case.get('scene_cuts', []))
    run_id = uuid4().hex
    folder = ROOT / 'research/benchmarks/runs' / run_id
    folder.mkdir(parents=True)
    report = {'schema_version': 1, 'id': run_id, 'case_id': case['id'], 'created_at': now(),
              'engine': engine, 'provenance': provenance, 'inputs': {k: sequence_hash(v) for k,v in streams.items()},
              'fps': case['fps'], 'frames': len(outputs), 'seconds': None, 'metrics': metrics,
              'output_sha256': sequence_hash(outputs), 'result_path': str(outputs[0].parent),
              'claim_scope': 'Imported external output; execution telemetry unavailable'}
    (folder / 'report.json').write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
    return {**report, 'report_path': (folder / 'report.json').relative_to(ROOT).as_posix()}
