"""Experiment 1: CPU-only fidelity/color/delivery audit with identity inference.

This file is a laboratory harness. It imports the current backend helpers but
does not modify production code, B2, masks, models, weights, or deployment.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import time

import cv2
import numpy as np


REPO = Path(__file__).resolve().parents[2]
OUT = Path("G:/dowloand/teste/experiment-1-fidelity-20260911")
FPS = 30
CONTEXT_FRAMES = 3
BODY_FRAMES = 120
TOTAL_FRAMES = BODY_FRAMES + 2 * CONTEXT_FRAMES
SAMPLE_FRAMES_FULL = sorted(set(np.linspace(0, TOTAL_FRAMES - 1, 12).round().astype(int).tolist()))
SAMPLE_FRAMES_BODY = sorted(set(np.linspace(0, BODY_FRAMES - 1, 12).round().astype(int).tolist()))

SOURCES = {
    "current": {
        "path": Path("G:/dowloand/teste/padro-01-001 (15).mp4"),
        "start": 0.0,
        "category": "current subtitle-removal clip",
    },
    "independent_detail": {
        "path": Path("C:/Users/DINO/Downloads/3vi3f1lms_video_no_watermark.mp4"),
        "start": 2.0,
        "category": "independent bright/detail scene",
    },
    "independent_lowlight": {
        "path": Path("C:/Users/DINO/Downloads/tiktok_video_no_watermark (1).mp4"),
        "start": 2.0,
        "category": "independent low-light scene",
    },
}

DECODERS = {
    "default_bt709": "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgr24",
    "accurate_bt709": (
        "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:"
        "flags=accurate_rnd+full_chroma_int,format=bgr24"
    ),
    "bicubic_accurate_bt709": (
        "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:"
        "flags=bicubic+accurate_rnd+full_chroma_int,format=bgr24"
    ),
    "lanczos_accurate_bt709": (
        "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:"
        "flags=lanczos+accurate_rnd+full_chroma_int,format=bgr24"
    ),
}

COMMANDS: list[dict] = []
PROBE_CACHE: dict[str, dict] = {}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def run(label: str, command: list[str], *, timeout: int = 600) -> float:
    started = time.perf_counter()
    proc = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    elapsed = time.perf_counter() - started
    COMMANDS.append({
        "label": label,
        "argv": command,
        "seconds": elapsed,
        "returncode": proc.returncode,
        "stderr": proc.stderr[-2000:],
    })
    if proc.returncode:
        raise RuntimeError(f"{label} failed: {proc.stderr[-2000:]}")
    return elapsed


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def ffprobe(path: Path) -> dict:
    cache_key = str(path.resolve())
    if cache_key in PROBE_CACHE:
        return PROBE_CACHE[cache_key]
    command = [
        "ffprobe", "-v", "error", "-show_streams", "-show_format",
        "-show_frames", "-select_streams", "v:0",
        "-show_entries",
        "stream=index,codec_type,codec_name,profile,width,height,pix_fmt,bits_per_raw_sample,"
        "color_range,color_space,color_transfer,color_primaries,chroma_location,"
        "sample_aspect_ratio,display_aspect_ratio,r_frame_rate,avg_frame_rate,time_base,"
        "duration_ts,duration,nb_frames,bit_rate:"
        "frame=best_effort_timestamp,best_effort_timestamp_time,pkt_duration_time,key_frame:"
        "format=format_name,duration,size,bit_rate",
        "-of", "json", str(path),
    ]
    data = json.loads(subprocess.check_output(command, text=True, encoding="utf-8"))
    video = next(stream for stream in data["streams"] if stream["codec_type"] == "video" or stream.get("index") == 0)
    frames = data.get("frames", [])
    result = {
        "path": str(path),
        "sha256": digest(path),
        "bytes": path.stat().st_size,
        "video": video,
        "container": data["format"],
        "frame_count_observed": len(frames),
        "pts": [f.get("best_effort_timestamp") for f in frames],
        "pts_time": [f.get("best_effort_timestamp_time") for f in frames],
        "duration_time": [f.get("pkt_duration_time") for f in frames],
        "keyframes": [i for i, f in enumerate(frames) if f.get("key_frame") == 1],
    }
    PROBE_CACHE[cache_key] = result
    return result


def create_calibration() -> tuple[Path, Path]:
    root = OUT / "calibration"
    frames = root / "rgb-reference"
    frames.mkdir(parents=True, exist_ok=True)
    width, height = 640, 360
    colors = np.array([
        [255, 255, 255], [255, 255, 0], [0, 255, 255], [0, 255, 0],
        [255, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 0],
    ], dtype=np.uint8)
    for i in range(90):
        if i < 30:
            rgb = np.zeros((height, width, 3), np.uint8)
            for n, color in enumerate(colors):
                rgb[:, n * width // 8:(n + 1) * width // 8] = color
            for y, value in enumerate(np.linspace(0, 255, height).astype(np.uint8)):
                rgb[y, width - 96:] = value
        elif i < 60:
            ramp = np.linspace(0, 255, width).round().astype(np.uint8)
            rgb = np.repeat(ramp[None, :, None], height, axis=0)
            rgb = np.repeat(rgb, 3, axis=2)
            rgb[height // 2:, :, :] = np.clip(rgb[height // 2:, :, :] * 0.25 + 16, 0, 255)
        else:
            x = np.linspace(0, 1, width, dtype=np.float32)[None, :]
            y = np.linspace(0, 1, height, dtype=np.float32)[:, None]
            rgb = np.empty((height, width, 3), np.float32)
            rgb[..., 0] = 255 * x
            rgb[..., 1] = 255 * y
            rgb[..., 2] = 255 * (1 - x)
            checker = ((np.indices((height, width)).sum(axis=0) // 4) % 2) * 8 - 4
            rgb = np.clip(rgb + checker[..., None], 0, 255).astype(np.uint8)
        assert cv2.imwrite(str(frames / f"{i:06d}.png"), rgb[..., ::-1])

    rgb_master = root / "rgb-reference.mkv"
    run("calibration_rgb_master", [
        "ffmpeg", "-y", "-v", "error", "-framerate", str(FPS),
        "-i", str(frames / "%06d.png"), "-an", "-c:v", "ffv1", "-level", "3",
        "-pix_fmt", "gbrp", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-colorspace", "rgb", "-color_range", "pc", "-r", str(FPS), str(rgb_master),
    ])
    yuv_master = root / "yuv420-reference.mkv"
    run("calibration_yuv420_master", [
        "ffmpeg", "-y", "-v", "error", "-i", str(rgb_master),
        "-vf", "scale=out_color_matrix=bt709:in_range=pc:out_range=tv:"
        "flags=accurate_rnd+full_chroma_int,format=yuv420p,setsar=1/1,"
        "setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
        "-an", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-color_range", "tv", "-r", str(FPS), str(yuv_master),
    ])
    return rgb_master, yuv_master


class RawReader:
    def __init__(self, path: Path, width: int, height: int, pix_fmt: str,
                 vf: str | None = None, frame_indices: list[int] | None = None):
        self.width, self.height, self.pix_fmt = width, height, pix_fmt
        command = ["ffmpeg", "-v", "error", "-threads", "1", "-i", str(path)]
        filters = []
        if frame_indices is not None:
            filters.append("select=" + "+".join(f"eq(n\\,{index})" for index in frame_indices))
        if vf:
            filters.append(vf)
        if filters:
            command += ["-vf", ",".join(filters)]
        command += ["-fps_mode", "passthrough", "-pix_fmt", pix_fmt, "-f", "rawvideo", "pipe:1"]
        self.proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def read(self):
        assert self.proc.stdout is not None
        if self.pix_fmt == "bgr24":
            size = self.width * self.height * 3
            raw = self.proc.stdout.read(size)
            return None if len(raw) != size else np.frombuffer(raw, np.uint8).reshape(self.height, self.width, 3)
        size = self.width * self.height * 3 // 2
        raw = self.proc.stdout.read(size)
        if len(raw) != size:
            return None
        y_size = self.width * self.height
        uv_size = y_size // 4
        data = np.frombuffer(raw, np.uint8)
        return data[:y_size].reshape(self.height, self.width), data[y_size:y_size + uv_size], data[y_size + uv_size:]

    def close(self):
        if self.proc.stdout:
            self.proc.stdout.close()
        if self.proc.stderr:
            self.proc.stderr.close()
        self.proc.wait(timeout=30)


def ssim_luma(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a.astype(np.float32), b.astype(np.float32)
    blur = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5)
    ma, mb = blur(a), blur(b)
    va, vb = blur(a * a) - ma * ma, blur(b * b) - mb * mb
    cov = blur(a * b) - ma * mb
    value = ((2 * ma * mb + 6.5025) * (2 * cov + 58.5225)) / (
        (ma * ma + mb * mb + 6.5025) * (va + vb + 58.5225)
    )
    return float(np.mean(value))


def bt709_luma(frame: np.ndarray) -> np.ndarray:
    b, g, r = cv2.split(frame.astype(np.float32))
    return 0.0722 * b + 0.7152 * g + 0.2126 * r


def rgb_metrics(reference: Path, candidate: Path, decoder: str, samples: list[int],
                reference_decoder: str | None = None) -> dict:
    probe = ffprobe(reference)
    width, height = int(probe["video"]["width"]), int(probe["video"]["height"])
    a = RawReader(reference, width, height, "bgr24", reference_decoder or decoder, samples)
    b = RawReader(candidate, width, height, "bgr24", decoder, samples)
    totals = {"abs": 0.0, "sq": 0.0, "count": 0, "luma_bias": [], "ssim": [],
              "grad_a": 0.0, "grad_b": 0.0, "edges": 0, "edges_kept": 0,
              "delta_e": [], "hist_l1": []}
    index = 0
    while True:
        fa, fb = a.read(), b.read()
        if fa is None or fb is None:
            break
        if True:
            diff = fb.astype(np.float32) - fa.astype(np.float32)
            totals["abs"] += float(np.abs(diff).sum())
            totals["sq"] += float((diff * diff).sum())
            totals["count"] += diff.size
            ya, yb = bt709_luma(fa), bt709_luma(fb)
            totals["luma_bias"].append(float(np.mean(yb - ya)))
            totals["ssim"].append(ssim_luma(ya, yb))
            gxa, gya = cv2.Sobel(ya, cv2.CV_32F, 1, 0), cv2.Sobel(ya, cv2.CV_32F, 0, 1)
            gxb, gyb = cv2.Sobel(yb, cv2.CV_32F, 1, 0), cv2.Sobel(yb, cv2.CV_32F, 0, 1)
            totals["grad_a"] += float(np.sum(gxa * gxa + gya * gya))
            totals["grad_b"] += float(np.sum(gxb * gxb + gyb * gyb))
            ea, eb = cv2.Canny(np.uint8(ya), 30, 80) > 0, cv2.Canny(np.uint8(yb), 30, 80) > 0
            eb = cv2.dilate(eb.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            totals["edges"] += int(ea.sum())
            totals["edges_kept"] += int((ea & eb).sum())
            la = cv2.cvtColor(fa[::4, ::4].astype(np.float32) / 255, cv2.COLOR_BGR2LAB)
            lb = cv2.cvtColor(fb[::4, ::4].astype(np.float32) / 255, cv2.COLOR_BGR2LAB)
            totals["delta_e"].append(float(np.linalg.norm(lb - la, axis=2).mean()))
            ha = np.histogram(ya, bins=64, range=(0, 256), density=True)[0]
            hb = np.histogram(yb, bins=64, range=(0, 256), density=True)[0]
            totals["hist_l1"].append(float(np.abs(hb - ha).sum() * 4 / 2))
        index += 1
    a.close(); b.close()
    mse = totals["sq"] / totals["count"]
    return {
        "sample_frames": samples,
        "mae": totals["abs"] / totals["count"],
        "psnr_db": None if mse == 0 else 10 * math.log10(255 * 255 / mse),
        "perfect_match": mse == 0,
        "ssim_luma": float(np.mean(totals["ssim"])),
        "luma_bias": float(np.mean(totals["luma_bias"])),
        "gradient_ratio": math.sqrt(totals["grad_b"] / totals["grad_a"]),
        "source_edge_preservation_1px": totals["edges_kept"] / totals["edges"] if totals["edges"] else None,
        "delta_e76_srgb_assumption": float(np.mean(totals["delta_e"])),
        "luma_histogram_l1": float(np.mean(totals["hist_l1"])),
        "decoded_frames_sampled": index,
        "decoder_filter": decoder,
    }


def yuv_metrics(reference: Path, candidate: Path, samples: list[int]) -> dict:
    probe = ffprobe(reference)
    width, height = int(probe["video"]["width"]), int(probe["video"]["height"])
    a = RawReader(reference, width, height, "yuv420p", frame_indices=samples)
    b = RawReader(candidate, width, height, "yuv420p", frame_indices=samples)
    values = {name: {"abs": 0.0, "bias": 0.0, "count": 0, "max": 0}
              for name in ("Y", "U", "V")}
    index = 0
    while True:
        fa, fb = a.read(), b.read()
        if fa is None or fb is None:
            break
        if True:
            for name, pa, pb in zip(("Y", "U", "V"), fa, fb):
                diff = pb.astype(np.int16) - pa.astype(np.int16)
                values[name]["abs"] += float(np.abs(diff).sum())
                values[name]["bias"] += float(diff.sum())
                values[name]["count"] += diff.size
                values[name]["max"] = max(values[name]["max"], int(np.abs(diff).max()))
        index += 1
    a.close(); b.close()
    return {name: {"mae": item["abs"] / item["count"], "bias": item["bias"] / item["count"],
                   "max_abs": item["max"]} for name, item in values.items()}


def calibration_metrics(rgb_master: Path, yuv_master: Path) -> tuple[str, dict]:
    result = {}
    for name, decoder in DECODERS.items():
        result[name] = {
            "overall": rgb_metrics(rgb_master, yuv_master, decoder,
                                   [0, 15, 30, 45, 60, 75, 89], "format=bgr24"),
            "grayscale_ramp": rgb_metrics(rgb_master, yuv_master, decoder,
                                          [30, 45, 59], "format=bgr24"),
        }
    # The known grayscale ramp decides Y' bias; overall MAE breaks ties.
    chosen = min(result, key=lambda n: (abs(result[n]["grayscale_ramp"]["luma_bias"]),
                                        result[n]["overall"]["mae"]))
    return chosen, result


def source_master(name: str, spec: dict) -> tuple[Path, Path]:
    root = OUT / "sources" / name
    root.mkdir(parents=True, exist_ok=True)
    full = root / "source-canonical-126f.mkv"
    run(f"{name}_canonical", [
        "ffmpeg", "-y", "-v", "error", "-ss", f"{spec['start']:.3f}", "-i", str(spec["path"]),
        "-frames:v", str(TOTAL_FRAMES), "-vf",
        "setpts=N/(30*TB),setsar=1/1,setparams=range=tv:color_primaries=bt709:"
        "color_trc=bt709:colorspace=bt709",
        "-an", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-color_range", "tv", str(full),
    ])
    target = root / "source-reference-120f.mp4"
    run(f"{name}_reference", [
        "ffmpeg", "-y", "-v", "error", "-i", str(full), "-vf",
        f"trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "setpts=PTS-STARTPTS,setsar=1/1,setparams=range=tv:color_primaries=bt709:"
        "color_trc=bt709:colorspace=bt709",
        "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0",
        "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-color_range", "tv", "-video_track_timescale", "90000", str(target),
    ])
    return full, target


def make_mask(directory: Path, width: int, height: int):
    directory.mkdir(parents=True, exist_ok=True)
    white = np.full((height, width), 255, np.uint8)
    for index in range(TOTAL_FRAMES):
        assert cv2.imwrite(str(directory / f"{index:06d}.png"), white)


def scene_current(source: Path, output: Path, label: str):
    run(label, [
        "ffmpeg", "-y", "-v", "error", "-i", str(source),
        "-vf", f"trim=start_frame=0:end_frame={TOTAL_FRAMES},setpts=PTS-STARTPTS",
        "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0",
        "-pix_fmt", "yuv420p", str(output),
    ])


def fused_composite_trim(source: Path, mask_dir: Path, output: Path, label: str):
    run(label, [
        "ffmpeg", "-y", "-v", "error", "-i", str(source), "-i", str(source),
        "-framerate", str(FPS), "-i", str(mask_dir / "%06d.png"), "-filter_complex",
        f"[0:v]trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "setpts=PTS-STARTPTS,format=gbrp[a];"
        f"[1:v]trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "setpts=PTS-STARTPTS,format=gbrp[b];"
        f"[2:v]trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "setpts=PTS-STARTPTS,format=gbrp[m];[a][b][m]maskedmerge,format=yuv420p[v]",
        "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
        "-pix_fmt", "yuv420p", "-frames:v", str(BODY_FRAMES), str(output),
    ])


def proposed_identity_delivery(source: Path, output: Path, label: str):
    run(label, [
        "ffmpeg", "-y", "-v", "error", "-i", str(source), "-vf",
        f"trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "setpts=PTS-STARTPTS,setsar=1/1,setparams=range=tv:color_primaries=bt709:"
        "color_trc=bt709:colorspace=bt709",
        "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-color_range", "tv", "-movflags", "+faststart", "-video_track_timescale", "90000",
        "-frames:v", str(BODY_FRAMES), str(output),
    ])


def proposed_identity_compositor(source: Path, mask_dir: Path, output: Path, label: str):
    # Preserve source Y/U/V outside the edited support. The full-resolution
    # luma mask and half-resolution chroma masks avoid the neutral-chroma mask
    # produced by a generic gray->YUV conversion. Fixed 1/30 timebases prevent
    # framesync from selecting adjacent frames when source PTS are millisecond-
    # quantized and the PNG sequence is exact CFR.
    run(label, [
        "ffmpeg", "-y", "-v", "error", "-i", str(source), "-i", str(source),
        "-framerate", str(FPS), "-i", str(mask_dir / "%06d.png"), "-filter_complex",
        f"[0:v]trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "settb=expr=1/30,setpts=N,format=yuv420p,extractplanes=y+u+v[sy][su][sv];"
        f"[1:v]trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "settb=expr=1/30,setpts=N,format=yuv420p,extractplanes=y+u+v[iy][iu][iv];"
        f"[2:v]trim=start_frame={CONTEXT_FRAMES}:end_frame={CONTEXT_FRAMES + BODY_FRAMES},"
        "settb=expr=1/30,setpts=N,format=gray,split=2[my][mc0];"
        "[mc0]scale=w=iw/2:h=ih/2:flags=area,split=2[mcu][mcv];"
        "[sy][iy][my]maskedmerge[oy];[su][iu][mcu]maskedmerge[ou];"
        "[sv][iv][mcv]maskedmerge[ov];[oy][ou][ov]mergeplanes=format=yuv420p:"
        "map0s=0:map0p=0:map1s=1:map1p=0:map2s=2:map2p=0,setsar=1/1,"
        "setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709[v]",
        "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
        "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-colorspace", "bt709", "-color_range", "tv", "-movflags", "+faststart",
        "-video_track_timescale", "90000", "-frames:v", str(BODY_FRAMES), str(output),
    ])


def build_paths(name: str, full: Path, target: Path, video, chunks) -> dict[str, tuple[Path, Path, int, str]]:
    root = OUT / "runs" / name
    baseline, ablation, proposed = root / "baseline-current", root / "ablations", root / "proposed"
    for directory in (baseline, ablation, proposed):
        directory.mkdir(parents=True, exist_ok=True)
    info = ffprobe(full)["video"]
    mask = root / "identity-mask"
    make_mask(mask, int(info["width"]), int(info["height"]))

    sliced = baseline / "01-slice.mp4"
    started = time.perf_counter(); chunks.slice_video(str(full), str(sliced), 0, TOTAL_FRAMES / FPS)
    COMMANDS.append({"label": f"{name}_current_slice_helper", "argv": "backend slice_video exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})
    slice_trim = baseline / "02-slice-then-trim.mp4"
    started = time.perf_counter(); chunks.trim_edges(str(sliced), str(slice_trim), CONTEXT_FRAMES / FPS, BODY_FRAMES / FPS)
    COMMANDS.append({"label": f"{name}_slice_trim_helper", "argv": "backend trim_edges exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})
    source_comp = baseline / "03-source-compositor.mp4"
    started = time.perf_counter(); video.composite_masked(str(full), str(full), str(mask), FPS, str(source_comp))
    COMMANDS.append({"label": f"{name}_source_compositor_helper", "argv": "backend composite_masked exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})

    scene = baseline / "04-scene.mp4"; scene_current(sliced, scene, f"{name}_current_scene")
    comp = baseline / "05-compositor.mp4"
    started = time.perf_counter(); video.composite_masked(str(scene), str(scene), str(mask), FPS, str(comp))
    COMMANDS.append({"label": f"{name}_current_compositor_helper", "argv": "backend composite_masked exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})
    current = baseline / "06-delivery.mp4"
    started = time.perf_counter(); chunks.trim_edges(str(comp), str(current), CONTEXT_FRAMES / FPS, BODY_FRAMES / FPS)
    COMMANDS.append({"label": f"{name}_current_trim_helper", "argv": "backend trim_edges exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})

    ns_scene = ablation / "drop-slice-01-scene.mp4"; scene_current(full, ns_scene, f"{name}_drop_slice_scene")
    ns_comp = ablation / "drop-slice-02-compositor.mp4"
    started = time.perf_counter(); video.composite_masked(str(ns_scene), str(ns_scene), str(mask), FPS, str(ns_comp))
    COMMANDS.append({"label": f"{name}_drop_slice_compositor", "argv": "backend composite_masked exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})
    no_slice = ablation / "drop-slice-delivery.mp4"
    started = time.perf_counter(); chunks.trim_edges(str(ns_comp), str(no_slice), CONTEXT_FRAMES / FPS, BODY_FRAMES / FPS)
    COMMANDS.append({"label": f"{name}_drop_slice_trim", "argv": "backend trim_edges exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})

    no_scene_comp = ablation / "drop-scene-01-compositor.mp4"
    started = time.perf_counter(); video.composite_masked(str(sliced), str(sliced), str(mask), FPS, str(no_scene_comp))
    COMMANDS.append({"label": f"{name}_drop_scene_compositor", "argv": "backend composite_masked exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})
    no_scene = ablation / "drop-scene-delivery.mp4"
    started = time.perf_counter(); chunks.trim_edges(str(no_scene_comp), str(no_scene), CONTEXT_FRAMES / FPS, BODY_FRAMES / FPS)
    COMMANDS.append({"label": f"{name}_drop_scene_trim", "argv": "backend trim_edges exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})

    no_trim = ablation / "drop-trim-fused-delivery.mp4"
    fused_composite_trim(scene, mask, no_trim, f"{name}_drop_trim_fused")

    no_comp = ablation / "drop-compositor-identity-diagnostic.mp4"
    started = time.perf_counter(); chunks.trim_edges(str(scene), str(no_comp), CONTEXT_FRAMES / FPS, BODY_FRAMES / FPS)
    COMMANDS.append({"label": f"{name}_drop_compositor_diagnostic", "argv": "backend trim_edges exact helper",
                     "seconds": time.perf_counter() - started, "returncode": 0, "stderr": ""})

    ceiling = proposed / "transport-ceiling-one-encode.mp4"
    proposed_identity_delivery(full, ceiling, f"{name}_proposed_transport_ceiling")
    harness = proposed / "harness-explicit-compositor-one-encode.mp4"
    proposed_identity_compositor(full, mask, harness, f"{name}_proposed_harness")
    copied = proposed / "backend-equivalent-input.mkv"; shutil.copy2(full, copied)
    backend = proposed / "backend-equivalent-explicit-compositor-one-encode.mp4"
    proposed_identity_compositor(copied, mask, backend, f"{name}_proposed_backend_equivalent")

    return {
        "source_full": (full, full, 0, "canonical control"),
        "source_target": (target, target, 0, "canonical control"),
        "slice": (sliced, full, 1, "exact current helper"),
        "slice_trim": (slice_trim, target, 2, "exact current helpers"),
        "source_compositor": (source_comp, full, 1, "exact current helper"),
        "current_complete": (current, target, 4, "slice + scene + compositor + trim"),
        "drop_slice_only": (no_slice, target, 3, "one current encode removed"),
        "drop_scene_only": (no_scene, target, 3, "one current encode removed"),
        "drop_trim_only": (no_trim, target, 3, "trim fused into compositor"),
        "drop_compositor_diagnostic": (no_comp, target, 3, "identity-only diagnostic"),
        "proposed_transport_ceiling": (ceiling, target, 1, "single YUV encode; no RGB compositor"),
        "proposed_harness": (harness, target, 1, "plane-aware YUV compositor + final encode"),
        "proposed_backend_equivalent": (backend, target, 1, "copy transport + plane-aware YUV compositor"),
    }


def pts_check(reference: dict, candidate: dict) -> dict:
    rt = [float(x) for x in reference["pts_time"]]
    ct = [float(x) for x in candidate["pts_time"]]
    same_count = len(rt) == len(ct)
    maximum = max((abs(a - b) for a, b in zip(rt, ct)), default=None)
    return {"same_frame_count": same_count, "reference_frames": len(rt), "candidate_frames": len(ct),
            "max_pts_time_error_seconds": maximum,
            "same_duration_sequence": reference["duration_time"] == candidate["duration_time"]}


def evaluate(name: str, paths: dict, decoder: str) -> tuple[dict, dict]:
    forensics = {key: ffprobe(item[0]) for key, item in paths.items()}
    metrics = {}
    for key, (candidate, reference, encodes, note) in paths.items():
        samples = SAMPLE_FRAMES_BODY if "target" in str(reference) else SAMPLE_FRAMES_FULL
        metrics[key] = {
            "reference": str(reference), "candidate": str(candidate), "encode_count": encodes, "note": note,
            "rgb": rgb_metrics(reference, candidate, decoder, samples),
            "yuv420_planes": yuv_metrics(reference, candidate, samples),
            "pts": pts_check(ffprobe(reference), forensics[key]),
        }
        print(name, key, json.dumps({k: metrics[key]["rgb"][k]
              for k in ("mae", "ssim_luma", "luma_bias", "gradient_ratio")}), flush=True)
    return forensics, metrics


def comparator(name: str, target: Path, current: Path, proposed: Path):
    output = OUT / "comparators" / f"{name}-source-current-proposed.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    filters = []
    colors = ("0x2E7D32", "0xC62828", "0x1565C0")
    for index, color in enumerate(colors):
        filters.append(
            f"[{index}:v]scale=360:640:force_original_aspect_ratio=decrease:flags=lanczos,"
            f"pad=360:640:(ow-iw)/2:(oh-ih)/2:black,"
            f"drawbox=x=0:y=0:w=iw:h=10:color={color}:t=fill[v{index}]"
        )
    filter_complex = ";".join(filters) + ";[v0][v1][v2]hstack=inputs=3[v]"
    run(f"{name}_comparator", [
        "ffmpeg", "-y", "-v", "error", "-i", str(target), "-i", str(current), "-i", str(proposed),
        "-filter_complex", filter_complex, "-map", "[v]", "-an", "-c:v", "libx264",
        "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", str(output),
    ])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cv2.setNumThreads(2)
    video = load_module("experiment1_video", REPO / "backend/app/utils/video.py")
    chunks = load_module("experiment1_chunks", REPO / "backend/app/services/chunking.py")
    rgb_cal, yuv_cal = create_calibration()
    decoder_name, calibration = calibration_metrics(rgb_cal, yuv_cal)
    decoder = DECODERS[decoder_name]
    print("CALIBRATION", decoder_name, json.dumps(calibration[decoder_name]), flush=True)

    all_forensics, all_metrics, source_manifest = {}, {}, {}
    for name, spec in SOURCES.items():
        full, target = source_master(name, spec)
        paths = build_paths(name, full, target, video, chunks)
        forensics, metrics = evaluate(name, paths, decoder)
        all_forensics[name], all_metrics[name] = forensics, metrics
        source_manifest[name] = {**{k: str(v) if isinstance(v, Path) else v for k, v in spec.items()},
                                 "original_sha256": digest(spec["path"]),
                                 "canonical_sha256": digest(full), "target_sha256": digest(target)}
        comparator(name, target, paths["current_complete"][0], paths["proposed_backend_equivalent"][0])

    code_files = [
        REPO / "backend/app/utils/video.py", REPO / "backend/app/services/chunking.py",
        REPO / "backend/app/services/scene_pipeline.py", REPO / "backend/app/main.py",
        REPO / "backend/runpod_handler.py", REPO / "src/lib/cleaner-chunks.server.ts", Path(__file__),
    ]
    (OUT / "calibration-analysis.json").write_text(json.dumps({
        "selected_decoder": decoder_name, "selected_filter": decoder,
        "selection_rule": "minimum absolute BT.709 RGB luma bias; overall RGB MAE breaks ties",
        "results": calibration,
        "caveat": "Known RGB patterns are converted once to limited-range YUV420; chroma subsampling is expected loss.",
    }, indent=2), encoding="utf-8")
    (OUT / "source-manifest.json").write_text(json.dumps(source_manifest, indent=2), encoding="utf-8")
    (OUT / "ffprobe-by-stage.json").write_text(json.dumps(all_forensics, indent=2), encoding="utf-8")
    (OUT / "metrics-by-stage.json").write_text(json.dumps(all_metrics, indent=2), encoding="utf-8")
    (OUT / "commands-and-times.json").write_text(json.dumps(COMMANDS, indent=2), encoding="utf-8")
    (OUT / "code-hashes.json").write_text(json.dumps({str(p.relative_to(REPO)): digest(p) for p in code_files}, indent=2), encoding="utf-8")
    artifacts = {}
    for path in OUT.rglob("*"):
        if path.is_file() and path.name != "artifact-hashes.json":
            artifacts[str(path.relative_to(OUT))] = {"sha256": digest(path), "bytes": path.stat().st_size}
    (OUT / "artifact-hashes.json").write_text(json.dumps(artifacts, indent=2), encoding="utf-8")
    print("EXPERIMENT_1_COMPLETE", OUT, flush=True)


if __name__ == "__main__":
    main()
