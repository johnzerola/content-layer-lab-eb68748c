"""Pipeline assíncrona completa (Celery, com fallback para execução inline).

video → scene detection → text detection → mask generation → refinement
      → temporal tracking → inpainting → validação temporal → encoding
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from types import SimpleNamespace
from typing import Dict, List, Optional

import cv2
import numpy as np
import requests
from celery import Celery
from kombu import Queue

from ..config import get_settings
from ..engines.inpainting import (
    TemporalFillEngine,
    device_name,
    empty_cache,
    process_windowed,
)
from ..engines.diffueraser_official import (
    DiffuEraserUnavailable,
    diffueraser_status,
    run_diffueraser,
)
from ..engines.propainter_official import (
    ProPainterUnavailable,
    propainter_status,
    run_propainter,
)
from ..services import mask as mask_svc
from ..services import protect as protect_svc
from ..services import tracking
from ..services import verify
from ..services.private_storage import PrivateStorage
from ..services.scene import detect_scenes
from ..services.text_detect import detect_text_boxes, frame_text_mask
from ..services.watermark import detect_watermarks, frame_watermark_mask
from ..security import callback_signature, validate_callback_url
from ..storage import job_dir as safe_job_dir, read_state, write_state
from ..utils.video import (
    RawWriter,
    ffmpeg_filter,
    masks_to_video,
    mux_audio,
    normalize_video,
    probe,
    read_chunk,
    read_frames,
)

SETTINGS = get_settings()
WORKER_SECRET = SETTINGS.worker_secret
STORAGE_DIR = str(SETTINGS.storage_dir)
REDIS_URL = SETTINGS.redis_url
celery_app = Celery("cleaner_tasks", broker=REDIS_URL, backend=REDIS_URL)
celery_app.conf.task_queues = (
    Queue("detect", routing_key="detect"),
    Queue("gpu-quality", routing_key="gpu-quality"),
    Queue("gpu-max", routing_key="gpu-max"),
)
celery_app.conf.task_routes = {
    "process_video_task": {"queue": "detect", "routing_key": "detect"},
    "cleaner.gpu_quality": {"queue": "gpu-quality", "routing_key": "gpu-quality"},
    "cleaner.gpu_max": {"queue": "gpu-max", "routing_key": "gpu-max"},
    "cleaner.finalize": {"queue": "detect", "routing_key": "detect"},
}
celery_app.conf.update(
    task_default_queue="detect",
    task_default_routing_key="detect",
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    result_expires=86400,
)


class JobCancelled(RuntimeError):
    pass


def _crop_clean_filter(info, opts: Dict) -> str:
    crop = opts.get("crop_clean") if isinstance(opts.get("crop_clean"), dict) else {}
    y = float(crop.get("y", 0.26))
    h = float(crop.get("h", 0.435))
    y_px = max(0, min(info.height - 2, round(info.height * y)))
    h_px = max(2, min(info.height - y_px, round(info.height * h)))
    # Keep the clean source pixels at original scale, then letterbox back to the
    # original canvas. This avoids the quality loss caused by stretching.
    pad_y = max(0, (info.height - h_px) // 2)
    return f"crop={info.width}:{h_px}:0:{y_px},pad={info.width}:{info.height}:0:{pad_y}:black,setsar=1"


def _enhance_filter(info, opts: Dict) -> str:
    enhance = opts.get("enhance") if isinstance(opts.get("enhance"), dict) else {}
    mode = str(enhance.get("mode", "hq"))
    scale = float(enhance.get("scale", 1))
    filters = []
    if scale > 1:
        out_w = int(round(info.width * min(scale, 2.0)))
        out_h = int(round(info.height * min(scale, 2.0)))
        filters.append(f"scale={out_w}:{out_h}:flags=lanczos")
    if mode != "off":
        filters.append("unsharp=5:5:0.45:3:3:0.20")
    return ",".join(filters)


def _apply_postprocess(input_path: str, output_path: str, info, opts: Dict, emit) -> str:
    strategy = str(opts.get("strategy", "inpaint"))
    enhance_filter = _enhance_filter(info, opts)
    if strategy != "crop-clean" and not enhance_filter:
        return output_path

    source = input_path if strategy == "crop-clean" else output_path
    final_path = str(Path(output_path).with_name("output.post.mp4"))
    filters = []
    if strategy == "crop-clean":
        filters.append(_crop_clean_filter(info, opts))
    if enhance_filter:
        filters.append(enhance_filter)
    emit(96, "melhorando qualidade e reenquadrando", "encoding")
    ffmpeg_filter(source, final_path, ",".join(filters), crf=int(opts.get("crf", 14)))
    os.replace(final_path, output_path)
    return output_path


def sign_payload(payload: dict, secret: str) -> str:
    return hmac.new(secret.encode(), json.dumps(payload, sort_keys=True).encode(),
                    hashlib.sha256).hexdigest()


def _notify(callback_url: Optional[str], payload: dict) -> None:
    if not callback_url:
        return
    try:
        callback_url = validate_callback_url(callback_url, SETTINGS.callback_origins)
        body = json.dumps(payload, sort_keys=True)
        timestamp = str(int(time.time()))
        requests.post(
            callback_url,
            data=body,
            headers={
                "content-type": "application/json",
                "x-callback-timestamp": timestamp,
                "x-signature": callback_signature(WORKER_SECRET, timestamp, body),
            },
            timeout=5,
            allow_redirects=False,
        )
    except Exception as exc:  # pragma: no cover
        print(f"[callback] delivery failed: {type(exc).__name__}")


def auto_detect(job_id: str, mode: str, samples: int = 12) -> List[Dict]:
    """Detecção automática de regiões conforme o modo escolhido."""
    input_path = os.path.join(STORAGE_DIR, job_id, "input.mp4")
    info = probe(input_path)
    step = max(1, info.frames // samples)
    frames = [f for i, f in enumerate(read_frames(input_path)) if i % step == 0][:samples]
    if not frames:
        return []
    h, w = frames[0].shape[:2]

    if mode in ("watermark", "logo"):
        return detect_watermarks(frames)

    if mode in ("subtitle", "text", "smart"):
        heat = np.zeros((h, w), np.float32)
        for frame in frames:
            layer = np.zeros((h, w), np.uint8)
            for box in detect_text_boxes(frame):
                x, y, bw, bh = box
                if mode == "subtitle" and (y + bh / 2) < h * 0.45:
                    continue  # legenda vive no terço inferior
                cv2.rectangle(layer, (x, y), (x + bw, y + bh), 255, -1)
            heat += layer.astype(np.float32) / 255.0
        binary = np.where(heat >= max(2.0, len(frames) * 0.25), 255, 0).astype(np.uint8)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE,
                                  cv2.getStructuringElement(cv2.MORPH_RECT, (25, 9)))
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions: List[Dict] = []
        for i, c in enumerate(contours):
            x, y, bw, bh = cv2.boundingRect(c)
            if bw * bh < w * h * 0.0008:
                continue
            regions.append({
                "id": f"det_{i}",
                "kind": "rect",
                "role": "remove",
                "x": x / w, "y": y / h, "w": bw / w, "h": bh / h,
                "grow": 0.008,
                "label": "Legenda" if mode == "subtitle" else "Texto",
            })
        if mode == "smart":
            regions += detect_watermarks(frames)
        return regions

    return []


def _window_masks(
    frames,
    regions,
    info,
    mode,
    dynamic,
    key_step,
    frame_offset: int,
    auto_protect: bool,
):
    """Build frame-accurate masks for one absolute video window."""
    n = len(frames)
    h, w = info.height, info.width
    base_masks, protect_masks = mask_svc.build_masks_window(
        regions, w, h, frame_offset, n, info.fps
    )
    fixed_watermark_masks = np.zeros_like(base_masks)
    if mode in ("watermark", "logo"):
        fixed_regions = []
        for region in regions:
            region_id = str(region.get("id", ""))
            label = str(region.get("label", "")).lower()
            automatically_moving = region_id.startswith(("wt_", "mv_"))
            is_fixed = mode == "logo" or (
                not automatically_moving
                and ("persistente" in label or not region_id.startswith("wm_"))
            )
            if is_fixed:
                fixed_regions.append(region)
        if fixed_regions:
            fixed_watermark_masks, _ = mask_svc.build_masks_window(
                fixed_regions, w, h, frame_offset, n, info.fps
            )

    if mode in ("subtitle", "text", "smart", "watermark", "logo") and dynamic:
        keys = list(range(0, n, max(1, key_step)))
        if keys[-1] != n - 1:
            keys.append(n - 1)
        key_masks = []
        for key in keys:
            base = base_masks[key]
            if mode in ("watermark", "logo"):
                detected = frame_watermark_mask(frames[key], roi=base)
                detected = np.maximum(detected, fixed_watermark_masks[key])
                if detected.max() == 0:
                    detected = base.copy()
            else:
                detected = frame_text_mask(
                    frames[key], roi=base, subtitle_only=(mode == "subtitle")
                )
                if mode == "smart":
                    detected = np.maximum(
                        detected, frame_watermark_mask(frames[key], roi=base)
                    )
            key_masks.append(detected)
        masks = tracking.interpolate_keyframes(frames, keys, key_masks)
    else:
        masks = [base.copy() for base in base_masks]

    # Person protection must not preserve an overlay crossing a person.
    if auto_protect and mode == "object":
        automatic = protect_svc.sampled_protect_mask(frames, step=max(2, n // 6))
        if automatic is not None:
            protect_masks = np.maximum(protect_masks, automatic[None, ...])

    out = np.zeros((n, h, w), np.uint8)
    for index, current in enumerate(masks):
        current = cv2.bitwise_and(current, base_masks[index])
        if protect_masks[index].max() > 0:
            current = cv2.bitwise_and(current, cv2.bitwise_not(protect_masks[index]))
        out[index] = mask_svc.refine(current)
    return out


def _write_mask_sequence(
    input_path: str,
    mask_dir: str,
    regions: List[Dict],
    info,
    mode: str,
    dynamic: bool,
    key_step: int,
    auto_protect: bool,
    on_progress=None,
) -> int:
    target = Path(mask_dir)
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    total = max(1, info.frames)
    core = 72
    overlap = 8
    written = 0
    start = 0
    while start < total:
        context_start = max(0, start - overlap)
        read_len = min(total, start + core + overlap) - context_start
        frames = read_chunk(input_path, context_start, read_len)
        if not frames:
            break
        masks = _window_masks(
            frames,
            regions,
            info,
            mode,
            dynamic,
            key_step,
            context_start,
            auto_protect,
        )
        masks = tracking.stabilize(masks) if len(masks) > 2 else masks
        offset = start - context_start
        core_len = min(core, total - start, len(frames) - offset)
        for local in range(offset, offset + core_len):
            output = target / f"{written:06d}.png"
            if not cv2.imwrite(str(output), masks[local]):
                raise RuntimeError(f"falha ao gravar mascara {output}")
            written += 1
        if on_progress:
            on_progress(written / total)
        start += core_len
        if core_len <= 0:
            break
    if written == 0:
        raise RuntimeError("nenhuma mascara foi gerada")
    return written


def _audit_video(video_path: str, mask_dir: str, fps: float) -> tuple[List[Dict], dict]:
    segments: List[Dict] = []
    worst = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}
    chunk_frames: List[np.ndarray] = []
    chunk_masks: List[np.ndarray] = []
    start_frame = 0

    def flush() -> None:
        nonlocal start_frame
        if not chunk_frames:
            return
        mask_array = np.asarray(chunk_masks, dtype=np.uint8)
        _, metrics = verify.audit_window(chunk_frames, mask_array)
        coverage = float(np.mean([(mask > 0).mean() for mask in chunk_masks]))
        segments.append({
            "from": round(start_frame / fps, 3),
            "to": round((start_frame + len(chunk_frames)) / fps, 3),
            "coverage": round(coverage, 5),
            **metrics,
        })
        worst["residual_text"] = max(worst["residual_text"], metrics["residual_text"])
        worst["sharpness_ratio"] = min(worst["sharpness_ratio"], metrics["sharpness_ratio"])
        worst["temporal_consistency"] = min(
            worst["temporal_consistency"], metrics["temporal_consistency"]
        )
        start_frame += len(chunk_frames)
        chunk_frames.clear()
        chunk_masks.clear()

    for index, frame in enumerate(read_frames(video_path)):
        mask = cv2.imread(str(Path(mask_dir) / f"{index:06d}.png"), cv2.IMREAD_GRAYSCALE)
        if mask is None:
            break
        chunk_frames.append(frame)
        chunk_masks.append(mask)
        if len(chunk_frames) >= 48:
            flush()
    flush()
    return segments, worst


def _run_official_pipeline(
    input_path: str,
    output_path: str,
    job_dir: str,
    regions: List[Dict],
    info,
    mode: str,
    preset: str,
    dynamic: bool,
    key_step: int,
    auto_protect: bool,
    verify_on: bool,
    emit,
    cancel_file: Optional[str] = None,
) -> tuple[List[Dict], dict, int]:
    mask_dir = os.path.join(job_dir, "masks")
    run_dir = os.path.join(job_dir, "propainter-run")
    emit(18, "gerando mascaras temporais", "tracking")
    frames = _write_mask_sequence(
        input_path,
        mask_dir,
        regions,
        info,
        mode,
        dynamic,
        key_step,
        auto_protect,
        lambda ratio: emit(18 + ratio * 14, "gerando mascaras temporais", "tracking"),
    )
    emit(34, "iniciando ProPainter oficial", "inpainting")
    video_only = run_propainter(
        input_path,
        mask_dir,
        run_dir,
        info.width,
        info.height,
        info.fps,
        preset,
        lambda stage: emit(36, stage, "inpainting"),
        cancel_file,
    )
    normalized_video = normalize_video(
        video_only,
        os.path.join(job_dir, "propainter-native.mp4"),
        info.width,
        info.height,
        info.fps,
    )
    emit(91, "validando resultado", "refining")
    if verify_on:
        segments, metrics = _audit_video(normalized_video, mask_dir, info.fps)
    else:
        segments = []
        metrics = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}
    emit(96, "remontando audio", "encoding")
    mux_audio(normalized_video, input_path, output_path, info.has_audio)
    return segments, metrics, frames


def _run_diffusion_pipeline(
    input_path: str,
    output_path: str,
    job_dir: str,
    regions: List[Dict],
    info,
    mode: str,
    dynamic: bool,
    key_step: int,
    auto_protect: bool,
    verify_on: bool,
    emit,
    cancel_file: Optional[str] = None,
) -> tuple[List[Dict], dict, int]:
    mask_dir = os.path.join(job_dir, "masks")
    mask_video = os.path.join(job_dir, "masks.mp4")
    run_dir = os.path.join(job_dir, "diffueraser-run")
    emit(18, "gerando mascaras temporais", "tracking")
    frames = _write_mask_sequence(
        input_path,
        mask_dir,
        regions,
        info,
        mode,
        dynamic,
        key_step,
        auto_protect,
        lambda ratio: emit(18 + ratio * 12, "gerando mascaras temporais", "tracking"),
    )
    masks_to_video(mask_dir, mask_video, info.fps)
    emit(32, "iniciando DiffuEraser oficial", "inpainting")
    video_only = run_diffueraser(
        input_path,
        mask_video,
        run_dir,
        info.duration,
        lambda stage: emit(34, stage, "inpainting"),
        cancel_file,
    )
    normalized_video = normalize_video(
        video_only,
        os.path.join(job_dir, "diffueraser-native.mp4"),
        info.width,
        info.height,
        info.fps,
    )
    emit(92, "validando resultado", "refining")
    if verify_on:
        segments, metrics = _audit_video(normalized_video, mask_dir, info.fps)
    else:
        segments = []
        metrics = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}
    emit(96, "remontando audio", "encoding")
    mux_audio(normalized_video, input_path, output_path, info.has_audio)
    return segments, metrics, frames


def _info_payload(info) -> Dict[str, object]:
    return {
        "width": int(info.width),
        "height": int(info.height),
        "fps": float(info.fps),
        "frames": int(info.frames),
        "duration": float(info.duration),
        "has_audio": bool(info.has_audio),
    }


def _info_from_payload(payload: Dict[str, object]):
    return SimpleNamespace(
        width=int(payload["width"]),
        height=int(payload["height"]),
        fps=float(payload["fps"]),
        frames=int(payload["frames"]),
        duration=float(payload["duration"]),
        has_audio=bool(payload.get("has_audio", False)),
    )


def _write_stage(job_id: str, patch: Dict[str, object]) -> Dict[str, object]:
    job_path = safe_job_dir(SETTINGS.storage_dir, job_id)
    state = {**read_state(job_path), **patch}
    write_state(job_path, state)
    return state


def _make_emitter(job_id: str, callback_url: Optional[str], callback_seq: int = 0):
    job_path = safe_job_dir(SETTINGS.storage_dir, job_id)

    def emit(progress: float, stage: str, status: str = "processing", **extra) -> None:
        nonlocal callback_seq
        if (job_path / ".cancel").exists():
            raise JobCancelled("job cancelado")
        callback_seq += 1
        payload = {
            "job_id": job_id,
            "status": status,
            "stage": stage,
            "progress": round(progress, 1),
            "callback_seq": callback_seq,
            **extra,
        }
        write_state(job_path, {**read_state(job_path), **payload})
        _notify(callback_url, payload)

    return emit


def _mask_video_to_dir(mask_video: str, mask_dir: str) -> str:
    target = Path(mask_dir)
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            mask_video,
            "-vsync",
            "0",
            "-start_number",
            "0",
            str(target / "%06d.png"),
        ],
        check=True,
    )
    if not (target / "000000.png").is_file():
        raise RuntimeError("mascara distribuida nao gerou frames")
    return str(target)


def _needs_diffueraser(metrics: Dict[str, float], options: Dict) -> bool:
    if os.getenv("CLEANER_AUTO_DIFFUERASER", "1") != "1":
        return False
    if options.get("allow_diffusion_fallback") is False:
        return False
    residual_threshold = float(options.get("residual_threshold", 0.05))
    sharpness_threshold = float(options.get("sharpness_threshold", 0.55))
    temporal_threshold = float(options.get("temporal_threshold", 0.55))
    return (
        float(metrics.get("residual_text", 0.0)) > residual_threshold
        or float(metrics.get("sharpness_ratio", 1.0)) < sharpness_threshold
        or float(metrics.get("temporal_consistency", 1.0)) < temporal_threshold
    )


def _cleanup_intermediate_files(job_path: Path) -> None:
    for name in (
        "masks",
        "masks.mp4",
        "propainter-run",
        "diffueraser-run",
        "propainter-native.mp4",
        "diffueraser-native.mp4",
        "video_only.mp4",
        "video_only.remote.mp4",
        "output.post.mp4",
    ):
        target = job_path / name
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        else:
            target.unlink(missing_ok=True)


def _run_classic_pipeline(
    input_path: str,
    tmp_path: str,
    output_path: str,
    regions: List[Dict],
    info,
    cuts: List[int],
    mode: str,
    dynamic: bool,
    key_step: int,
    auto_protect: bool,
    verify_on: bool,
    emit,
    cancel_file: Optional[str] = None,
) -> tuple[List[Dict], dict, int, str]:
    engine = TemporalFillEngine(context_radius=32, max_neighbors=6)
    core = 20
    overlap = 32
    total = max(1, info.frames)
    writer = RawWriter(tmp_path, info.width, info.height, info.fps)
    segments: List[Dict] = []
    written = 0
    start = 0
    worst = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}
    emit(20, f"reconstrucao temporal classica ({device_name()})", "inpainting")
    try:
        while start < total:
            if cancel_file and Path(cancel_file).exists():
                raise JobCancelled("job cancelado")
            scene_start = max((cut for cut in cuts if cut <= start), default=0)
            scene_end = min((cut for cut in cuts if cut > start), default=total)
            end = min(total, start + core, scene_end)
            context_start = max(scene_start, start - overlap)
            context_end = min(scene_end, end + overlap)
            read_len = context_end - context_start
            frames = read_chunk(input_path, context_start, read_len)
            if not frames:
                break
            core_len = end - start
            masks = _window_masks(
                frames,
                regions,
                info,
                mode,
                dynamic,
                key_step,
                context_start,
                auto_protect,
            )
            if len(masks) > 2 and mode not in ("subtitle", "text"):
                masks = tracking.stabilize(masks)
            offset = start - context_start
            result = engine.process(
                np.asarray(frames),
                masks,
                target_start=offset,
                target_end=offset + core_len,
            )
            metrics = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}
            if verify_on:
                _, metrics = verify.audit_window(result, masks)
            for index in range(offset, offset + core_len):
                if index < len(result):
                    writer.write(result[index])
                    written += 1
            selected = masks[offset:offset + core_len]
            coverage = float(np.mean([(mask > 0).mean() for mask in selected])) if len(selected) else 0.0
            segments.append({
                "from": round(start / info.fps, 3),
                "to": round(end / info.fps, 3),
                "coverage": round(coverage, 5),
                **metrics,
            })
            worst["residual_text"] = max(worst["residual_text"], metrics["residual_text"])
            worst["sharpness_ratio"] = min(worst["sharpness_ratio"], metrics["sharpness_ratio"])
            worst["temporal_consistency"] = min(
                worst["temporal_consistency"], metrics["temporal_consistency"]
            )
            emit(
                min(92.0, 20 + (written / total) * 70),
                f"reconstruindo fundo ({written}/{total} frames)",
                "inpainting",
            )
            start = end
    finally:
        writer.close()
    emit(95, "remontando audio", "encoding")
    mux_audio(tmp_path, input_path, output_path, info.has_audio)
    return segments, worst, written, engine.name


def run_pipeline(
    job_id: str,
    mode: str,
    preset: str,
    masks_data: List[Dict],
    callback_url: Optional[str] = None,
    progress_cb=None,
    options: Optional[Dict] = None,
) -> Dict:
    opts = options or {}
    dynamic = bool(opts.get("dynamic", True))
    auto_protect = bool(opts.get("protect_subject", True))
    key_step = int(opts.get("key_step", 4))
    verify_on = bool(opts.get("verify", True))

    job_path = safe_job_dir(SETTINGS.storage_dir, job_id)
    cancel_path = job_path / ".cancel"
    cancel_path.unlink(missing_ok=True)
    job_dir = str(job_path)
    input_path = str(job_path / "input.mp4")
    tmp_path = str(job_path / "video_only.mp4")
    output_path = str(job_path / "output.mp4")
    callback_seq = int(read_state(job_path).get("callback_seq", 0))

    def emit(progress: float, stage: str, status: str = "processing", **extra) -> None:
        nonlocal callback_seq
        if cancel_path.exists():
            raise JobCancelled("job cancelado")
        callback_seq += 1
        if progress_cb:
            progress_cb(progress, stage)
        payload = {
            "job_id": job_id, "status": status, "stage": stage,
            "progress": round(progress, 1), "callback_seq": callback_seq, **extra,
        }
        write_state(job_path, {**read_state(job_path), **payload})
        _notify(callback_url, payload)

    try:
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"vídeo de entrada ausente para {job_id}")

        emit(3, "analisando vídeo", "analyzing")
        info = probe(input_path)
        if str(opts.get("strategy", "inpaint")) == "crop-clean":
            emit(20, "reenquadrando sem legenda", "encoding")
            ffmpeg_filter(
                input_path,
                output_path,
                ",".join(filter(None, [_crop_clean_filter(info, opts), _enhance_filter(info, opts)])),
                crf=int(opts.get("crf", 14)),
            )
            result_payload = {
                "job_id": job_id,
                "callback_seq": callback_seq + 1,
                "status": "completed",
                "progress": 100,
                "stage": "concluÃ­do",
                "result_url": f"/v1/jobs/{job_id}/result",
                "detections": [],
                "segments": [],
                "metrics": {
                    "temporal_consistency": 1,
                    "sharpness_ratio": 1,
                    "residual_text": 0,
                    "device": device_name(),
                    "frames": info.frames,
                    "engine": "crop-clean-hq",
                    "passes": 1,
                    "strategy": "crop-clean",
                    "enhance": opts.get("enhance", {"mode": "hq"}),
                    "dynamic_masks": False,
                    "subject_protection": False,
                },
                "probe": {
                    "width": info.width, "height": info.height,
                    "fps": round(info.fps, 3), "duration": round(info.duration, 3),
                    "has_audio": info.has_audio,
                },
            }
            write_state(job_path, {**read_state(job_path), **result_payload})
            _notify(callback_url, result_payload)
            return result_payload

        emit(8, "detectando cortes de cena", "analyzing")
        scenes = detect_scenes(input_path)
        cuts = sorted({int(s) for s, _ in scenes})

        regions = list(masks_data or [])
        if not regions:
            emit(14, "detectando áreas automaticamente", "detecting")
            regions = auto_detect(job_id, mode)
        if not regions:
            raise ValueError("nenhuma área para remover foi detectada ou marcada")

        official = propainter_status()
        diffusion = diffueraser_status()
        allow_fallback = os.getenv("CLEANER_ALLOW_CLASSIC_FALLBACK", "0") == "1"
        if preset == "max" and diffusion.ready:
            segments, aggregate, written = _run_diffusion_pipeline(
                input_path,
                output_path,
                job_dir,
                regions,
                info,
                mode,
                dynamic,
                key_step,
                auto_protect,
                verify_on,
                emit,
                str(cancel_path),
            )
            engine_name = "diffueraser-official"
            pass_count = 2
        elif preset == "max" and not allow_fallback:
            raise DiffuEraserUnavailable(
                "preset max solicitado, mas DiffuEraser oficial nao esta pronto: "
                + ", ".join(diffusion.missing)
            )
        elif preset in ("quality", "max") and official.ready:
            segments, aggregate, written = _run_official_pipeline(
                input_path,
                output_path,
                job_dir,
                regions,
                info,
                mode,
                preset,
                dynamic,
                key_step,
                auto_protect,
                verify_on,
                emit,
                str(cancel_path),
            )
            engine_name = "propainter-official"
            pass_count = 1
        else:
            if preset == "quality" and not allow_fallback:
                raise ProPainterUnavailable(
                    "preset de IA solicitado, mas ProPainter oficial nao esta pronto: "
                    + ", ".join(official.missing)
                )
            segments, aggregate, written, engine_name = _run_classic_pipeline(
                input_path,
                tmp_path,
                output_path,
                regions,
                info,
                cuts,
                mode,
                dynamic,
                key_step,
                auto_protect,
                verify_on,
                emit,
                str(cancel_path),
            )
            pass_count = 1

        _apply_postprocess(input_path, output_path, info, opts, emit)

        callback_seq += 1
        result_payload = {
            "job_id": job_id,
            "callback_seq": callback_seq,
            "status": "completed",
            "progress": 100,
            "stage": "concluído",
            "result_url": f"/v1/jobs/{job_id}/result",
            "detections": regions,
            "segments": segments,
            "metrics": {
                "temporal_consistency": round(aggregate["temporal_consistency"], 3),
                "sharpness_ratio": round(aggregate["sharpness_ratio"], 3),
                "residual_text": round(aggregate["residual_text"], 4),
                "device": device_name(),
                "frames": written,
                "engine": engine_name,
                "passes": pass_count,
                "strategy": str(opts.get("strategy", "inpaint")),
                "enhance": opts.get("enhance", {"mode": "hq"}),
                "dynamic_masks": dynamic,
                "subject_protection": auto_protect,
            },
            "probe": {
                "width": info.width, "height": info.height,
                "fps": round(info.fps, 3), "duration": round(info.duration, 3),
                "has_audio": info.has_audio,
            },
        }
        write_state(job_path, {**read_state(job_path), **result_payload})
        _notify(callback_url, result_payload)
        return result_payload

    except Exception as exc:
        empty_cache()
        print(f"[pipeline] falhou: {exc}")
        callback_seq += 1
        failure = {"job_id": job_id, "callback_seq": callback_seq, "status": "failed",
                   "progress": 0, "error": str(exc)[:1000]}
        write_state(job_path, {**read_state(job_path), **failure})
        _notify(callback_url, failure)
        raise


@celery_app.task(name="process_video_task", bind=True, queue="detect")
def process_video_task(
    self,
    job_id: str,
    mode: str,
    preset: str,
    masks_data: list,
    callback_url: str | None,
    options: dict | None = None,
):
    """CPU detect phase.

    Fast/crop jobs can finish on CPU. Quality/max jobs generate one combined
    mask video and hand off original+mask to a GPU worker through MinIO.
    """
    opts = options or {}

    def progress_cb(progress: float, stage: str) -> None:
        self.update_state(state="PROGRESS", meta={"progress": progress, "stage": stage})

    if preset == "fast" or str(opts.get("strategy", "inpaint")) == "crop-clean":
        return run_pipeline(job_id, mode, preset, masks_data, callback_url, progress_cb, opts)

    job_path = safe_job_dir(SETTINGS.storage_dir, job_id)
    cancel_path = job_path / ".cancel"
    input_path = str(job_path / "input.mp4")
    callback_seq = int(read_state(job_path).get("callback_seq", 0))
    emit = _make_emitter(job_id, callback_url, callback_seq)

    try:
        if not Path(input_path).is_file():
            raise FileNotFoundError(f"video de entrada ausente para {job_id}")

        emit(4, "analisando video", "analyzing")
        info = probe(input_path)
        regions = list(masks_data or [])
        if not regions:
            emit(10, "detectando legendas e marcas", "detecting")
            regions = auto_detect(job_id, mode)
        if not regions:
            raise ValueError("nenhuma area para remover foi detectada ou marcada")

        dynamic = bool(opts.get("dynamic", True))
        auto_protect = bool(opts.get("protect_subject", True))
        key_step = int(opts.get("key_step", 4))
        mask_dir = str(job_path / "masks")
        mask_video = str(job_path / "masks.mp4")

        emit(16, "unindo mascaras", "tracking")
        written = _write_mask_sequence(
            input_path,
            mask_dir,
            regions,
            info,
            mode,
            dynamic,
            key_step,
            auto_protect,
            lambda ratio: emit(16 + ratio * 18, "unindo mascaras", "tracking"),
        )
        masks_to_video(mask_dir, mask_video, info.fps)

        emit(36, "enviando para storage privado", "queued")
        storage = PrivateStorage()
        original_object = storage.put_file(input_path, f"{job_id}/input.mp4", "video/mp4")
        mask_object = storage.put_file(mask_video, f"{job_id}/mask.mp4", "video/mp4")
        current_seq = int(read_state(job_path).get("callback_seq", callback_seq))
        payload = {
            "job_id": job_id,
            "mode": mode,
            "preset": preset,
            "regions": regions,
            "options": opts,
            "callback_url": callback_url,
            "callback_seq": current_seq,
            "info": _info_payload(info),
            "objects": {
                "original": original_object,
                "mask": mask_object,
            },
            "mask_frames": written,
        }
        _write_stage(
            job_id,
            {
                "status": "queued",
                "progress": 38,
                "stage": "aguardando GPU",
                "detections": regions,
                "probe": _info_payload(info),
                "pipeline": "distributed",
                "queue": "gpu-quality",
            },
        )
        gpu_quality_task.apply_async(args=[payload], queue="gpu-quality")
        return {"status": "queued", "job_id": job_id, "queue": "gpu-quality"}
    except Exception as exc:
        empty_cache()
        failure = {
            "job_id": job_id,
            "status": "failed",
            "progress": 0,
            "error": str(exc)[:1000],
        }
        write_state(job_path, {**read_state(job_path), **failure})
        _notify(callback_url, failure)
        raise
    finally:
        if cancel_path.exists():
            cancel_path.unlink(missing_ok=True)


@celery_app.task(name="cleaner.gpu_quality", bind=True, queue="gpu-quality")
def gpu_quality_task(self, payload: dict):
    """GPU quality phase: ProPainter plus localized validation."""
    job_id = payload["job_id"]
    callback_url = payload.get("callback_url")
    opts = payload.get("options") or {}
    info = _info_from_payload(payload["info"])
    gpu_path = safe_job_dir(SETTINGS.storage_dir, job_id)
    gpu_path.mkdir(parents=True, exist_ok=True)
    emit = _make_emitter(job_id, callback_url, int(payload.get("callback_seq") or 0))

    try:
        emit(42, "baixando original e mascara na GPU", "processing")
        storage = PrivateStorage()
        input_path = storage.get_file(payload["objects"]["original"], gpu_path / "input.mp4")
        mask_video = storage.get_file(payload["objects"]["mask"], gpu_path / "masks.mp4")
        mask_dir = _mask_video_to_dir(str(mask_video), str(gpu_path / "masks"))

        emit(50, "rodando ProPainter", "inpainting")
        video_only = run_propainter(
            str(input_path),
            mask_dir,
            str(gpu_path / "propainter-run"),
            info.width,
            info.height,
            info.fps,
            payload.get("preset", "quality"),
            lambda stage: emit(52, stage, "inpainting"),
            str(gpu_path / ".cancel"),
        )
        normalized = normalize_video(
            video_only,
            str(gpu_path / "propainter-native.mp4"),
            info.width,
            info.height,
            info.fps,
        )

        emit(76, "validando area reconstruida", "refining")
        if bool(opts.get("verify", True)):
            segments, metrics = _audit_video(normalized, mask_dir, info.fps)
        else:
            segments = []
            metrics = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}

        diffusion = diffueraser_status()
        should_max = diffusion.ready and _needs_diffueraser(metrics, opts)
        if should_max:
            emit(82, "residuo detectado; enviando para DiffuEraser", "queued")
            max_payload = {
                **payload,
                "quality": {"segments": segments, "metrics": metrics},
                "objects": payload["objects"],
                "callback_seq": int(read_state(gpu_path).get("callback_seq", payload.get("callback_seq") or 0)),
            }
            gpu_max_task.apply_async(args=[max_payload], queue="gpu-max")
            return {"status": "queued", "queue": "gpu-max", "validation": metrics}

        emit(86, "subindo resultado ProPainter", "queued")
        video_object = storage.put_file(normalized, f"{job_id}/propainter-video.mp4", "video/mp4")
        finalize_payload = {
            **payload,
            "objects": {**payload["objects"], "video": video_object},
            "segments": segments,
            "metrics": metrics,
            "engine": "propainter-official",
            "device": device_name(),
            "passes": 1,
            "callback_seq": int(read_state(gpu_path).get("callback_seq", payload.get("callback_seq") or 0)),
        }
        finalize_video_task.apply_async(args=[finalize_payload], queue="detect")
        _cleanup_intermediate_files(gpu_path)
        return {"status": "queued", "queue": "detect", "engine": "propainter-official"}
    except Exception as exc:
        empty_cache()
        failure = {
            "job_id": job_id,
            "status": "failed",
            "progress": 0,
            "error": str(exc)[:1000],
        }
        write_state(gpu_path, {**read_state(gpu_path), **failure})
        _notify(callback_url, failure)
        raise


@celery_app.task(name="cleaner.gpu_max", bind=True, queue="gpu-max")
def gpu_max_task(self, payload: dict):
    """GPU max phase: DiffuEraser fallback when quality validation fails."""
    job_id = payload["job_id"]
    callback_url = payload.get("callback_url")
    info = _info_from_payload(payload["info"])
    gpu_path = safe_job_dir(SETTINGS.storage_dir, job_id)
    gpu_path.mkdir(parents=True, exist_ok=True)
    emit = _make_emitter(job_id, callback_url, int(payload.get("callback_seq") or 0))

    try:
        emit(84, "baixando arquivos para DiffuEraser", "processing")
        storage = PrivateStorage()
        input_path = storage.get_file(payload["objects"]["original"], gpu_path / "input.mp4")
        mask_video = storage.get_file(payload["objects"]["mask"], gpu_path / "masks.mp4")
        mask_dir = _mask_video_to_dir(str(mask_video), str(gpu_path / "masks"))

        emit(88, "rodando DiffuEraser", "inpainting")
        video_only = run_diffueraser(
            str(input_path),
            str(mask_video),
            str(gpu_path / "diffueraser-run"),
            info.duration,
            lambda stage: emit(90, stage, "inpainting"),
            str(gpu_path / ".cancel"),
        )
        normalized = normalize_video(
            video_only,
            str(gpu_path / "diffueraser-native.mp4"),
            info.width,
            info.height,
            info.fps,
        )
        if bool((payload.get("options") or {}).get("verify", True)):
            segments, metrics = _audit_video(normalized, mask_dir, info.fps)
        else:
            segments = []
            metrics = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}

        emit(94, "subindo resultado DiffuEraser", "queued")
        video_object = storage.put_file(normalized, f"{job_id}/diffueraser-video.mp4", "video/mp4")
        finalize_payload = {
            **payload,
            "objects": {**payload["objects"], "video": video_object},
            "segments": segments,
            "metrics": metrics,
            "engine": "diffueraser-official",
            "device": device_name(),
            "passes": 2,
            "callback_seq": int(read_state(gpu_path).get("callback_seq", payload.get("callback_seq") or 0)),
        }
        finalize_video_task.apply_async(args=[finalize_payload], queue="detect")
        _cleanup_intermediate_files(gpu_path)
        return {"status": "queued", "queue": "detect", "engine": "diffueraser-official"}
    except Exception as exc:
        empty_cache()
        failure = {
            "job_id": job_id,
            "status": "failed",
            "progress": 0,
            "error": str(exc)[:1000],
        }
        write_state(gpu_path, {**read_state(gpu_path), **failure})
        _notify(callback_url, failure)
        raise


@celery_app.task(name="cleaner.finalize", bind=True, queue="detect")
def finalize_video_task(self, payload: dict):
    """CPU final phase: mux original audio, write final state and clean storage."""
    job_id = payload["job_id"]
    callback_url = payload.get("callback_url")
    opts = payload.get("options") or {}
    info = _info_from_payload(payload["info"])
    job_path = safe_job_dir(SETTINGS.storage_dir, job_id)
    job_path.mkdir(parents=True, exist_ok=True)
    emit = _make_emitter(
        job_id,
        callback_url,
        int(payload.get("callback_seq") or read_state(job_path).get("callback_seq", 0)),
    )
    storage = PrivateStorage()

    try:
        emit(96, "baixando resultado da GPU", "encoding")
        original = job_path / "input.mp4"
        if not original.is_file():
            storage.get_file(payload["objects"]["original"], original)
        video_only = storage.get_file(payload["objects"]["video"], job_path / "video_only.remote.mp4")
        output_path = str(job_path / "output.mp4")
        mux_audio(str(video_only), str(original), output_path, info.has_audio)
        _apply_postprocess(str(original), output_path, info, opts, emit)

        result_payload = {
            "job_id": job_id,
            "callback_seq": int(read_state(job_path).get("callback_seq", 0)) + 1,
            "status": "completed",
            "progress": 100,
            "stage": "concluido",
            "result_url": f"/v1/jobs/{job_id}/result",
            "detections": payload.get("regions", []),
            "segments": payload.get("segments", []),
            "metrics": {
                **(payload.get("metrics") or {}),
                "device": payload.get("device", device_name()),
                "frames": int(payload.get("mask_frames") or info.frames),
                "engine": payload.get("engine", "distributed"),
                "passes": int(payload.get("passes", 1)),
                "strategy": str(opts.get("strategy", "inpaint")),
                "enhance": opts.get("enhance", {"mode": "hq"}),
                "dynamic_masks": bool(opts.get("dynamic", True)),
                "subject_protection": bool(opts.get("protect_subject", True)),
            },
            "probe": _info_payload(info),
            "pipeline": "distributed",
        }
        write_state(job_path, {**read_state(job_path), **result_payload})
        _notify(callback_url, result_payload)
        _cleanup_intermediate_files(job_path)
        try:
            original.unlink(missing_ok=True)
            storage.delete_prefix(f"{job_id}/")
        except Exception as cleanup_exc:  # pragma: no cover
            print(f"[cleanup] distributed cleanup failed: {cleanup_exc}")
        return result_payload
    except Exception as exc:
        empty_cache()
        failure = {
            "job_id": job_id,
            "status": "failed",
            "progress": 0,
            "error": str(exc)[:1000],
        }
        write_state(job_path, {**read_state(job_path), **failure})
        _notify(callback_url, failure)
        raise
