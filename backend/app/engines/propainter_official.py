"""Adapter for the complete official ProPainter inference pipeline.

The upstream project is intentionally executed as a subprocess. ProPainter is
not only ``InpaintGenerator``: it also uses RAFT and recurrent flow completion.
Keeping the upstream runner intact avoids silently shipping a partial model.
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Callable, Dict, List, Optional, Tuple

from .inpainting import cuda_available


REQUIRED_CODE = (
    "inference_propainter.py",
    "model/propainter.py",
    "model/recurrent_flow_completion.py",
)
REQUIRED_CODE_ANY = (
    ("RAFT/core/raft.py", "RAFT/raft.py"),
)
REQUIRED_WEIGHTS = (
    "ProPainter.pth",
    "recurrent_flow_completion.pth",
    "raft-things.pth",
)


class ProPainterUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ProPainterStatus:
    ready: bool
    root: str
    cuda: bool
    missing: Tuple[str, ...]
    license: str = "NTU S-Lab License 1.0 (non-commercial unless authorized)"

    def as_dict(self) -> Dict[str, object]:
        return asdict(self)


def propainter_root() -> Path:
    configured = os.getenv("PROPAINTER_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    bundled = Path(__file__).resolve().parents[2] / "vendor" / "ProPainter"
    return bundled.resolve()


def propainter_status(require_cuda: bool = True) -> ProPainterStatus:
    root = propainter_root()
    weights_dir = Path(os.getenv("PROPAINTER_WEIGHTS_DIR", str(root / "weights")))
    missing: List[str] = []
    for rel in REQUIRED_CODE:
        if not (root / rel).is_file():
            missing.append(rel)
    for alternatives in REQUIRED_CODE_ANY:
        if not any((root / rel).is_file() for rel in alternatives):
            missing.append("|".join(alternatives))
    for name in REQUIRED_WEIGHTS:
        path = weights_dir / name
        if not path.is_file() or path.stat().st_size < 1024 * 1024:
            missing.append(f"weights/{name}")
    has_cuda = _propainter_cuda_available()
    if require_cuda and not has_cuda:
        missing.append("cuda")
    return ProPainterStatus(not missing, str(root), has_cuda, tuple(missing))


def _propainter_cuda_available() -> bool:
    python = os.getenv("PROPAINTER_PYTHON", sys.executable)
    if Path(python).resolve() == Path(sys.executable).resolve():
        return cuda_available()
    try:
        completed = subprocess.run(
            [
                python,
                "-c",
                "import torch; raise SystemExit(0 if torch.cuda.is_available() else 1)",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60,
        )
        return completed.returncode == 0
    except Exception:
        return cuda_available()


def _processing_size(
    width: int, height: int, preset: str, scale_factor: float = 1.0
) -> Tuple[int, int]:
    default_side = 1280 if preset == "max" else 960
    max_side = max(320, int(os.getenv("PROPAINTER_MAX_SIDE", str(default_side))))
    max_side = max(320, int(max_side * max(0.2, min(1.0, scale_factor))))
    scale = min(1.0, max_side / float(max(width, height)))
    out_w = max(8, int(width * scale) // 8 * 8)
    out_h = max(8, int(height * scale) // 8 * 8)
    return out_w, out_h


def build_propainter_command(
    input_video: str,
    mask_dir: str,
    output_dir: str,
    width: int,
    height: int,
    fps: float,
    preset: str,
    scale_factor: float = 1.0,
    reference_stride: Optional[int] = None,
    temporal_window: Optional[int] = None,
) -> List[str]:
    root = propainter_root()
    proc_w, proc_h = _processing_size(width, height, preset, scale_factor)
    tight = scale_factor < 1.0
    has_cuda = _propainter_cuda_available()
    cpu_only = not has_cuda
    if cpu_only:
        # Sem GPU a memória do container é o gargalo: janelas curtas evitam que
        # o kernel mate o processo por falta de RAM.
        subvideo = "16" if tight else "24"
        neighbor = "5" if tight else "6"
        ref_stride = "12"
    else:
        subvideo = "40" if tight else ("80" if preset == "max" else "64")
        neighbor = "8" if tight else ("12" if preset == "max" else "10")
        ref_stride = "10" if tight else ("5" if preset == "max" else "10")
    if temporal_window is not None:
        if not 4 <= temporal_window <= 80:
            raise ValueError("temporal_window precisa estar entre 4 e 80")
        if has_cuda:
            subvideo = str(min(temporal_window, 40) if tight else temporal_window)
    # Permit small GPUs to keep spatial detail by reducing temporal memory
    # first. OOM retries must never increase a user-specified temporal budget.
    subvideo = str(max(4, min(int(subvideo), int(os.getenv("PROPAINTER_SUBVIDEO_LENGTH", subvideo)))))
    neighbor_limit = max(2, min(int(neighbor), int(os.getenv("PROPAINTER_NEIGHBOR_LENGTH", neighbor))))
    neighbor = str(min(int(subvideo), neighbor_limit) // 2 * 2)
    ref_stride = str(max(1, int(os.getenv("PROPAINTER_REF_STRIDE", ref_stride))))
    if reference_stride is not None and has_cuda:
        if not 1 <= reference_stride <= 30:
            raise ValueError("reference_stride precisa estar entre 1 e 30")
        # Per-scene choice; never mutate process-wide env while other jobs run.
        ref_stride = str(reference_stride)
        # Dense references must have a bounded temporal memory budget. These
        # are also the settings exercised by the automatic local comparison.
        subvideo = str(min(int(subvideo), temporal_window or 32))
        neighbor = str(min(int(neighbor), 6))
    command = [
        os.getenv("PROPAINTER_PYTHON", sys.executable),
        str(root / "inference_propainter.py"),
        "--video", str(Path(input_video).resolve()),
        "--mask", str(Path(mask_dir).resolve()),
        "--output", str(Path(output_dir).resolve()),
        "--width", str(proc_w),
        "--height", str(proc_h),
        "--save_fps", str(max(1, round(fps))),
        "--subvideo_length", subvideo,
        "--neighbor_length", neighbor,
        "--ref_stride", ref_stride,
        "--mask_dilation", "2" if preset == "max" or reference_stride is not None else "1",
    ]
    if has_cuda and os.getenv("PROPAINTER_FP16", "1") == "1":
        command.append("--fp16")
    return command



def run_propainter(
    input_video: str,
    mask_dir: str,
    output_dir: str,
    width: int,
    height: int,
    fps: float,
    preset: str,
    on_stage: Optional[Callable[[str], None]] = None,
    cancel_file: Optional[str] = None,
    reference_stride: Optional[int] = None,
    temporal_window: Optional[int] = None,
    preserve_pixels: Optional[bool] = None,
) -> str:
    status = propainter_status(require_cuda=os.getenv("PROPAINTER_ALLOW_CPU", "0") != "1")
    if not status.ready:
        raise ProPainterUnavailable(
            "ProPainter oficial indisponivel: " + ", ".join(status.missing)
        )

    root = Path(status.root)
    target = Path(output_dir)
    # The refined quality contract must not depend on a deployment-specific
    # environment variable. Callers can require the PNG/RGB lossless route;
    # other profiles retain the existing opt-in environment behavior.
    preserve_pixels = (
        os.getenv("PROPAINTER_PRESERVE_PIXELS", "0") == "1"
        if preserve_pixels is None else bool(preserve_pixels)
    )
    if preserve_pixels:
        # Never erase a caller's existing directory or a source on this route.
        target.mkdir(parents=True, exist_ok=False)
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(
        part for part in (str(root), env.get("PYTHONPATH", "")) if part
    )
    env.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    weights_dir = Path(os.getenv("PROPAINTER_WEIGHTS_DIR", str(root / "weights"))).resolve()

    # Upstream resolves weights relative to its own root. A custom mounted
    # directory is linked into that expected location without copying GBs.
    expected_weights = root / "weights"
    if weights_dir != expected_weights.resolve():
        expected_weights.mkdir(parents=True, exist_ok=True)
        for name in REQUIRED_WEIGHTS:
            source = weights_dir / name
            destination = expected_weights / name
            if not destination.exists():
                try:
                    destination.symlink_to(source)
                except OSError:
                    shutil.copy2(source, destination)

    timeout = max(300, int(os.getenv("PROPAINTER_TIMEOUT_SECONDS", "10800")))
    # RAFT (cálculo de fluxo) escala com a área do quadro: em vertical HD ele
    # estoura a VRAM. Ao detectar falta de memória, reduz a resolução de
    # processamento e a janela temporal, em vez de falhar o chunk inteiro.
    scales = [1.0, 0.72, 0.55, 0.42]
    last_error = ""
    deadline = time.monotonic() + timeout
    for attempt, scale_factor in enumerate(scales):
        if time.monotonic() >= deadline:
            raise TimeoutError("ProPainter excedeu o tempo total, incluindo tentativas")
        if target.exists() and not preserve_pixels:
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)
        log_path = target / "propainter.log"
        command = build_propainter_command(
            input_video, mask_dir, output_dir, width, height, fps, preset, scale_factor,
            reference_stride=reference_stride,
            temporal_window=temporal_window,
        )
        if preserve_pixels:
            returncode, pixel_output = _run_pixel_attempt(
                command, input_video, mask_dir, target, width, height, fps,
                preset, scale_factor, attempt, root, env, deadline, cancel_file, on_stage,
            )
            if pixel_output:
                return pixel_output
        else:
            returncode = _invoke(command, root, env, log_path, deadline, cancel_file, on_stage)

        if returncode == 0:
            candidates = sorted(target.rglob("inpaint_out.mp4"))
            if not candidates:
                raise RuntimeError(
                    f"ProPainter concluiu sem gerar inpaint_out.mp4; log: {log_path}"
                )
            return str(candidates[0])

        tail = ""
        try:
            tail = "\n".join(
                log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-20:]
            )
        except OSError:
            pass
        last_error = f"ProPainter falhou (codigo {returncode}).\n{tail}"
        out_of_memory = (
            "OutOfMemoryError" in tail
            or "out of memory" in tail.lower()
            or returncode in (-9, 137)
        )
        if not out_of_memory or attempt == len(scales) - 1:
            raise RuntimeError(last_error)

    raise RuntimeError(last_error or "ProPainter falhou")


def _run_pixel_attempt(command, source, masks, target, width, height, fps, preset,
                       scale_factor, attempt, root, env, deadline, cancel_file, on_stage):
    from .propainter_pixels import pixel_geometry, prepare_pixels, pack_pixels, write_pixel_report

    max_side = max(320, int(os.getenv("PROPAINTER_MAX_SIDE", "1280" if preset == "max" else "960")))
    geometry = pixel_geometry(width, height, max(320, int(max_side * scale_factor)))
    # TemporaryDirectory owns only this attempt's new files; all are removed
    # on success, cancellation, failure or OOM before any next attempt starts.
    with tempfile.TemporaryDirectory(prefix="pixels-", dir=target) as temporary:
        scratch = Path(temporary)
        count = prepare_pixels(source, masks, scratch, geometry,
                               cancel_file=cancel_file, deadline=deadline,
                               max_bytes=int(os.getenv("PROPAINTER_PIXEL_WORKSPACE_BYTES", str(2 * 1024**3))))
        overrides = {"--video": scratch / "input", "--mask": scratch / "masks",
                     "--output": scratch / "model", "--width": geometry.padded_width,
                     "--height": geometry.padded_height}
        for key, value in overrides.items():
            command[command.index(key) + 1] = str(value)
        command.append("--save_frames")
        code = _invoke(command, root, env, target / "propainter.log", deadline, cancel_file, on_stage)
        if code:
            return code, None
        output = pack_pixels(scratch / "model/input/frames", target / "inpaint-lossless.mp4",
                             geometry, count, fps, cancel_file=cancel_file, deadline=deadline)
        write_pixel_report(target / "pixels.json", geometry, count, fps, attempt)
        return 0, output


def _invoke(command, root, env, log_path, deadline, cancel_file, on_stage):
    if on_stage:
        size = f"{command[command.index('--width') + 1]}x{command[command.index('--height') + 1]}"
        on_stage(f"ProPainter oficial {size}")
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            while process.poll() is None:
                if cancel_file and Path(cancel_file).exists():
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=10)
                    raise RuntimeError("job cancelado")
                if time.monotonic() >= deadline:
                    process.kill()
                    process.wait(timeout=10)
                    raise TimeoutError("ProPainter excedeu o tempo limite")
                time.sleep(1)
            return process.returncode
        finally:
            # Also release GPU on Ctrl-C or an unexpected polling exception.
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)

