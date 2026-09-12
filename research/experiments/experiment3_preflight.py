"""Read-only model audit and resource-guarded local initialization, no cloud.

Initialization is NOT an inference/quality pass. Never edits upstream or B2.
"""
from __future__ import annotations
import argparse
import ctypes
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import time
import traceback

OUT = Path('G:/dowloand/teste/experiment-3-alternative-inpainting-20260911')
RUNTIME = Path('G:/cleaneria-runtime')
MODEL = RUNTIME / 'diffueraser-models'
UPSTREAM = RUNTIME / 'DiffuEraser'
BASELINE = Path('G:/dowloand/teste/phase-5-20260911/baseline/B2-finish-OFF-rgb-lossless.mp4')
EXPECTED_B2 = '08e73ade1fa0048f33a5701502f6825428ee392c4e8748ddab6cffb1093779b5'

def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(4*1024*1024), b''):
            h.update(b)
    return h.hexdigest()

class MemoryStatus(ctypes.Structure):
    _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
        (x, ctypes.c_ulonglong) for x in ['total_phys', 'avail_phys', 'total_page',
                                         'avail_page', 'total_virtual', 'avail_virtual', 'extended']]

def sample():
    s = MemoryStatus(); s.length = ctypes.sizeof(s)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s)):
        raise OSError('GlobalMemoryStatusEx failed')
    row = {'time': time.time(), 'available_ram_bytes': s.avail_phys,
           'total_ram_bytes': s.total_phys, 'available_commit_bytes': s.avail_page}
    try:
        gpu = subprocess.check_output(['nvidia-smi', '--query-gpu=memory.used,memory.total',
                                       '--format=csv,noheader,nounits'], text=True, timeout=5)
        used, total = gpu.strip().splitlines()[0].split(',')
        row.update(gpu_used_mib=int(used), gpu_total_mib=int(total))
    except Exception as e:
        row['gpu_error'] = str(e)
    return row

def inventory():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for p in sorted(MODEL.rglob('*')):
        if not p.is_file() or '.cache' in p.parts:
            continue
        row = {'path': str(p), 'bytes': p.stat().st_size, 'sha256': sha(p)}
        rel = p.relative_to(MODEL)
        meta = MODEL / rel.parts[0] / '.cache/huggingface/download' / Path(*rel.parts[1:])
        meta = Path(str(meta) + '.metadata')
        if meta.is_file():
            lines = meta.read_text().splitlines()
            row.update(hf_revision=lines[0], hf_etag=lines[1],
                       etag_matches_sha256=(lines[1] == row['sha256']) if len(lines[1]) == 64 else None)
        if p.suffix == '.safetensors':
            with p.open('rb') as f:
                size = struct.unpack('<Q', f.read(8))[0]
                header = json.loads(f.read(size))
            tensors = [v for k,v in header.items() if k != '__metadata__']
            count = sum(math.prod(v['shape']) for v in tensors)
            row.update(tensor_elements=count, hypothetical_all_fp16_bytes=2*count,
                       dtypes=sorted(set(v['dtype'] for v in tensors)),
                       note='FP16 size estimate includes integer buffers; not measured VRAM')
        rows.append(row)
    baseline_hash = sha(BASELINE)
    assert baseline_hash == EXPECTED_B2, 'B2 differs from frozen baseline'
    code_files = ['run_diffueraser.py', 'diffueraser/diffueraser.py',
                  'diffueraser/pipeline_diffueraser.py', 'propainter/inference.py', 'requirements.txt', 'LICENSE']
    report = {'weights': rows, 'baseline': str(BASELINE), 'baseline_sha256': baseline_hash,
              'upstream_commit': subprocess.check_output(['git','-C',str(UPSTREAM),'rev-parse','HEAD'],text=True).strip(),
              'upstream_tracked_diff': subprocess.check_output(['git','-C',str(UPSTREAM),'diff','--stat'],text=True),
              'code_hashes': {name: sha(UPSTREAM/name) for name in code_files},
              'script_sha256': sha(Path(__file__)), 'resources': sample()}
    save(OUT/'preflight-inventory.json', report)
    print('Inventory and baseline verified', flush=True)

def worker():
    started = time.perf_counter()
    state = {'status':'IMPORTING', 'model_inference_completed':False, 'cloud_cost_usd':0}
    def checkpoint(status):
        state.update(status=status, elapsed_seconds=time.perf_counter()-started)
        save(OUT/'initialization-stage.json', state)
        print(status, flush=True)
    try:
        import torch
        state.update(python=sys.version, packages={p:importlib.metadata.version(p) for p in
            ['torch','torchvision','diffusers','transformers','accelerate','peft','numpy','av']},
            cuda=torch.version.cuda, cuda_available=torch.cuda.is_available())
        if not torch.cuda.is_available():
            raise RuntimeError('CUDA unavailable')
        torch.set_num_threads(2)
        torch.cuda.reset_peak_memory_stats()
        a = torch.eye(16, device='cuda')
        assert torch.equal(a @ a, a)
        del a
        torch.cuda.synchronize()
        state['cuda_minimal_operation_passed'] = True
        state['gpu'] = torch.cuda.get_device_name(0)
        checkpoint('CUDA_OPERATION_PASSED')
        sys.path.insert(0, str(UPSTREAM))
        from diffueraser.diffueraser import DiffuEraser
        checkpoint('MODEL_INITIALIZATION_STARTED')
        model = DiffuEraser(torch.device('cuda'), str(MODEL/'stable-diffusion-v1-5'),
                           str(MODEL/'sd-vae-ft-mse'), str(MODEL/'diffuEraser'), ckpt='2-Step')
        torch.cuda.synchronize()
        state.update(peak_allocated_bytes=torch.cuda.max_memory_allocated(),
                     peak_reserved_bytes=torch.cuda.max_memory_reserved())
        checkpoint('MODEL_INITIALIZATION_COMPLETE_INFERENCE_NOT_RUN')
        del model
    except BaseException as exc:
        state['error'] = f'{type(exc).__name__}: {exc}'
        traceback.print_exc()
        checkpoint('FAILED')
        raise

def run():
    inventory()
    report_path = OUT/'initialization-monitor.json'
    if report_path.exists():
        raise RuntimeError('Existing attempt retained; do not overwrite')
    env = os.environ.copy()
    env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', PYTHONUNBUFFERED='1',
               TOKENIZERS_PARALLELISM='false', OMP_NUM_THREADS='2')
    cmd = [str(RUNTIME/'diffueraser-env/Scripts/python.exe'), str(Path(__file__).resolve()), '--worker']
    started = time.perf_counter(); samples = [sample()]; reason = None
    report = {'command':cmd, 'cwd':str(UPSTREAM), 'timeout_seconds':300,
              'ram_floor_bytes':1024**3, 'cloud_cost_usd':0,
              'model_inference_completed':False, 'stage':'INITIALIZATION', 'samples':samples}
    with (OUT/'initialization.log').open('w',encoding='utf-8') as log:
        proc = subprocess.Popen(cmd, cwd=UPSTREAM, env=env, stdout=log, stderr=subprocess.STDOUT)
        report['pid'] = proc.pid
        try:
            while proc.poll() is None:
                row=sample(); samples.append(row)
                if row['available_ram_bytes'] < report['ram_floor_bytes']:
                    reason='RAM_GUARD_ABORT'; break
                if time.perf_counter()-started > 300:
                    reason='TIMEOUT'; break
                save(report_path, report)
                time.sleep(1)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try: proc.wait(timeout=10)
                except subprocess.TimeoutExpired: proc.kill(); proc.wait(timeout=10)
    report.update(returncode=proc.returncode, stop_reason=reason or 'PROCESS_EXIT',
                  elapsed_seconds=time.perf_counter()-started,
                  min_available_ram_bytes=min(x['available_ram_bytes'] for x in samples),
                  peak_device_used_mib=max((x.get('gpu_used_mib',0) for x in samples),default=None),
                  log_sha256=sha(OUT/'initialization.log'), baseline_sha256_after=sha(BASELINE))
    assert report['baseline_sha256_after'] == EXPECTED_B2
    save(report_path,report)
    print(json.dumps({k:v for k,v in report.items() if k != 'samples'},indent=2),flush=True)

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--worker',action='store_true')
    args=parser.parse_args()
    worker() if args.worker else run()
