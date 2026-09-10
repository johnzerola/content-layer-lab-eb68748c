"""Bounded local ProPainter comparison, using original pixels and reviewed regions.

Example (PowerShell, from repository root):
    python backend/scripts/validate_local_roi_sample.py --input original.mp4 \
        --reference VMAKE.IA.mp4 --regions regions.json --output-dir G:/tests/new-run

Run --prepare-only first to inspect masks without invoking ProPainter. Each run
requires a NEW directory; originals, references and earlier results are read-only.
Region coordinates are normalized; optional from/to times refer to the original
input. --static-mask removes the entire reviewed region and is a diagnostic
control, whereas the default detects text inside the reviewed search region.
Reference pixels are never supplied to an inference model. No network/service
configuration or deployment is performed by this runner.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, replace
from datetime import datetime, timezone
import hashlib
import html
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time


def bounded_seconds(value: str) -> float:
    seconds = float(value)
    if not math.isfinite(seconds) or not 0 < seconds <= 5:
        raise argparse.ArgumentTypeError("seconds must be greater than 0 and at most 5")
    return seconds


def nonnegative(value: str) -> float:
    seconds = float(value)
    if not math.isfinite(seconds) or seconds < 0:
        raise argparse.ArgumentTypeError("start must be finite and nonnegative")
    return seconds


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("--input", required=True, type=Path)
    result.add_argument("--reference", required=True, type=Path)
    result.add_argument("--regions", required=True, type=Path, help="JSON array of normalized reviewed regions")
    result.add_argument("--output-dir", required=True, type=Path, help="Must not already exist")
    result.add_argument("--runtime", type=Path, default=Path("G:/cleaneria-runtime"))
    result.add_argument("--seconds", type=bounded_seconds, default=5.0)
    result.add_argument("--start", type=nonnegative, default=0.0)
    result.add_argument("--reference-start", type=nonnegative, default=0.0,
                        help="Matching time in reference, which may already be trimmed")
    result.add_argument("--max-side", type=int, default=720, help="Inference size cap; source stays at native resolution")
    result.add_argument("--mode", choices=("karaoke", "subtitle", "text"), default="karaoke")
    result.add_argument("--static-mask", action="store_true", help="Remove whole reviewed region instead of text detection")
    result.add_argument("--prepare-only", action="store_true", help="Prepare samples and scene-isolated mask previews, no inference")
    result.add_argument("--full-frame", action="store_true", help="Disable spatial crop for controlled comparison")
    result.add_argument("--scene-cuts", type=str, help="Reviewed scene cut frame indices within sample, comma-separated")
    result.add_argument("--prepared-from", type=Path, help="Reuse reviewed masks from a matching --prepare-only run")
    result.add_argument("--mask-halo", type=int, default=0, help="Extra native mask dilation, 0..24 pixels, inside selected region")
    result.add_argument("--repair-empty-masks", action="store_true", help="Retry subtitle detection on empty reviewed masks before dilation")
    result.add_argument("--repair-color-masks", action="store_true", help="Supplement reviewed masks with the current colored subtitle detector")
    return result


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(data)
    return digest.hexdigest()


def implementation_fingerprint(runtime: Path) -> dict:
    backend = Path(__file__).resolve().parents[1]
    names = ["scripts/validate_local_roi_sample.py", "app/workers/tasks.py",
             "app/services/inference_region.py", "app/services/subtitle_policy.py", "app/services/text_detect.py",
             "app/services/scene.py", "app/services/scene_pipeline.py",
             "app/utils/video.py", "app/engines/propainter_official.py"]
    files = {name: sha256(backend / name) for name in names}
    upstream = runtime / "ProPainter" / "inference_propainter.py"
    weights = runtime / "ProPainter" / "weights"
    return {"application_files": files,
            "upstream_runner_sha256": sha256(upstream) if upstream.is_file() else None,
            "weights": {name: sha256(weights / name) for name in
                        ("ProPainter.pth", "raft-things.pth", "recurrent_flow_completion.pth")
                        if (weights / name).is_file()}}


def read_regions(path: Path) -> list[dict]:
    regions = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(regions, list) or not regions or not all(isinstance(region, dict) for region in regions):
        raise ValueError("regions JSON must contain a nonempty array of region objects")
    for region in regions:
        if region.get("kind", "rect") == "rect":
            coords = [float(region[key]) for key in ("x", "y", "w", "h")]
            if not all(math.isfinite(value) and 0 <= value <= 1 for value in coords):
                raise ValueError("region coordinates must be finite and normalized to [0, 1]")
            x, y, width, height = coords
            if width <= 0 or height <= 0 or x + width > 1.000001 or y + height > 1.000001:
                raise ValueError("region must fit inside the video and have positive area")
        for key in ("from", "to", "from_time", "to_time"):
            if region.get(key) is not None:
                nonnegative(str(region[key]))
    if not any(region.get("role", "remove") == "remove" and region.get("enabled", True) for region in regions):
        raise ValueError("at least one enabled remove region is required")
    return regions


def configure_runtime(runtime: Path, max_side: int, directory: Path) -> dict:
    if not 320 <= max_side <= 1920:
        raise ValueError("max-side must be between 320 and 1920")
    python = runtime / "propainter-env" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    values = {
        "PROPAINTER_ROOT": str(runtime / "ProPainter"),
        "PROPAINTER_WEIGHTS_DIR": str(runtime / "ProPainter" / "weights"),
        "PROPAINTER_PYTHON": str(python),
        "PROPAINTER_MAX_SIDE": str(max_side),
        "PROPAINTER_FP16": "1",
        "PROPAINTER_ALLOW_CPU": "0",
        "CLEANER_AUTO_DIFFUERASER": "0",
        "CLEANER_ENV": "development",
        "CLEANER_STORAGE": str(directory / "storage"),
        "USE_CELERY": "0",
    }
    os.environ.update(values)
    values["CLEANER_SUBTITLE_SHADOW_PX"] = os.getenv("CLEANER_SUBTITLE_SHADOW_PX", "auto")
    for name, default in {"CLEANER_INFERENCE_ROI": "1", "CLEANER_INFERENCE_ROI_MARGIN": "96",
                          "PROPAINTER_SUBVIDEO_LENGTH": "80", "PROPAINTER_NEIGHBOR_LENGTH": "6",
                          "PROPAINTER_REF_STRIDE": "10"}.items():
        os.environ.setdefault(name, default)
        values[name] = os.environ[name]
    return values


def run_command(command: list[str], log_path: Path) -> None:
    with log_path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(command, ensure_ascii=False) + "\n")
        stream.flush()
        subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=180)


def sample_command(source: Path, target: Path, start: float, frames: int, fps: float) -> list[str]:
    # Cap by whole frames and timestamps, never a keyframe-only stream-copy trim.
    # Explicit video-only timing avoids retaining the source's longer audio tail.
    duration = frames / fps
    return [
        "ffmpeg", "-nostdin", "-n", "-loglevel", "error", "-ss", f"{start:.9f}", "-i", str(source),
        "-map", "0:v:0", "-map", "0:a:0?", "-vf", f"trim=end_frame={frames},setpts=PTS-STARTPTS",
        "-frames:v", str(frames), "-r", f"{fps:.12g}", "-t", f"{duration:.9f}",
        "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(target),
    ]


def validate_sample(info, source_info, frames: int) -> None:
    if (info.width, info.height) != (source_info.width, source_info.height):
        raise RuntimeError("sample changed native video dimensions")
    if info.frames != frames or not 0 < info.frames / info.fps <= 5.000001:
        raise RuntimeError("sample has an unexpected frame count or exceeds five seconds")
    if info.has_audio != source_info.has_audio:
        raise RuntimeError("sample did not preserve the source audio presence")


def prepare_masks(source: Path, directory: Path, regions: list[dict], info, scenes, args, emit) -> dict:
    import cv2
    from app.services.chunking import localize_masks
    from app.utils.video import RawWriter, read_frames
    from app.workers.tasks import _write_mask_sequence

    preview_path = directory / "mask-preview.mp4"
    writer = RawWriter(str(preview_path), info.width, info.height, info.fps, crf=16)
    coverage, manifest_scenes = [], []
    try:
        for index, (start, end) in enumerate(scenes):
            scene_dir = directory / "mask-review" / f"{index:04d}"
            scene_dir.mkdir(parents=True)
            scene_input = scene_dir / "input.mp4"
            run_command([
                "ffmpeg", "-nostdin", "-n", "-loglevel", "error", "-i", str(source),
                "-vf", f"trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS",
                "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0",
                "-pix_fmt", "yuv420p", str(scene_input),
            ], directory / "ffmpeg.log")
            part_info = replace(info, frames=end - start, duration=(end - start) / info.fps, has_audio=False)
            part_regions = localize_masks(regions, start / info.fps, part_info.duration)
            masks = scene_dir / "masks"
            count = _write_mask_sequence(str(scene_input), str(masks), part_regions, part_info,
                                         args.mode, not args.static_mask, 1, False)
            manifest_scenes.append({"start_frame": start, "end_frame": end, "masks": str(masks.relative_to(directory))})
            saved = {0, count // 2, count - 1}
            for local, frame in enumerate(read_frames(str(scene_input))):
                mask = cv2.imread(str(masks / f"{local:06d}.png"), cv2.IMREAD_GRAYSCALE)
                if mask is None:
                    raise RuntimeError("missing preview mask")
                selected = mask > 0
                coverage.append(float(selected.mean()))
                overlay = frame.copy()
                overlay[selected] = (frame[selected] * 0.5 + (20, 110, 20)).clip(0, 255).astype("uint8")
                writer.write(overlay)
                if local in saved:
                    cv2.imwrite(str(scene_dir / f"preview-{local:06d}.jpg"), overlay)
            emit(18 + 70 * (index + 1) / len(scenes), f"scene {index + 1}/{len(scenes)} mask preview", "preparing")
    finally:
        writer.close()
    if len(coverage) != info.frames:
        raise RuntimeError("mask preview has an incomplete frame sequence")
    return {"preview": preview_path.name, "scenes": manifest_scenes,
            "coverage_mean": sum(coverage) / len(coverage), "coverage_max": max(coverage),
            "empty_frames": sum(value == 0 for value in coverage)}


def comparison_html(directory: Path, prepared: bool) -> None:
    middle = "mask-preview.mp4" if prepared else "output.mp4"
    middle_label = "Mascara de diagnostico (sem remocao)" if prepared else "ProPainter local (candidato)"
    cards = "\n".join(
        f'<figure><figcaption>{html.escape(label)}</figcaption><video controls playsinline preload="metadata" src="{filename}" {"" if index == 0 else "muted"}></video></figure>'
        for index, (filename, label) in enumerate((("input.mp4", "Original"), (middle, middle_label), ("reference.mp4", "Referencia Vmake")))
    )
    document = '''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comparacao de remocao de legendas</title><style>
body{font:16px system-ui;margin:24px;background:#161819;color:#eee}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;flex:1;min-width:240px}video{width:100%;max-height:75vh;background:#000}figcaption{margin-bottom:8px}button{padding:12px;margin:0 8px 16px 0}a{color:#b8dbff}
</style><h1>Comparacao no mesmo trecho</h1><p>A referencia serve para avaliacao visual; nao foi fornecida ao modelo. Igualdade de qualidade ainda exige revisao do movimento, textura e legenda residual.</p>
<button id="play">Reproduzir juntos</button><button id="pause">Pausar</button><button id="reset">Voltar ao inicio</button><main>CARDS</main>
<p>Instantes nominais: a exportacao Vmake pode ter deslocamento temporal e mudancas de aparencia. Isto nao e comparacao contra pixels verdadeiros ocultos. O audio toca somente no original. <a href="manifest.json">Manifesto e medidas</a></p>
<script>const videos=[...document.querySelectorAll('video')];const first=videos[0];
document.querySelector('#play').onclick=()=>{videos.slice(1).forEach(v=>v.currentTime=first.currentTime);videos.forEach(v=>v.play().catch(()=>{}))};
document.querySelector('#pause').onclick=()=>videos.forEach(v=>v.pause());
document.querySelector('#reset').onclick=()=>videos.forEach(v=>{v.pause();v.currentTime=0});
first.addEventListener('seeked',()=>videos.slice(1).forEach(v=>{if(Math.abs(v.currentTime-first.currentTime)>.08)v.currentTime=first.currentTime}));
</script></html>'''
    (directory / "comparison.html").write_text(document.replace("CARDS", cards), encoding="utf-8")


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    source, reference, regions_path = (path.resolve(strict=True) for path in (args.input, args.reference, args.regions))
    regions = read_regions(regions_path)
    directory = args.output_dir.resolve()
    if not 320 <= args.max_side <= 1920:
        raise ValueError("max-side must be between 320 and 1920")
    if not 0 <= args.mask_halo <= 24 or (args.mask_halo and not args.prepared_from):
        raise ValueError("mask-halo requires prepared-from and must be 0..24")
    if (args.repair_empty_masks or args.repair_color_masks) and (not args.prepared_from or args.mode not in ("karaoke", "subtitle")):
        raise ValueError("mask repair requires prepared-from and a subtitle mode")
    directory.mkdir(parents=True, exist_ok=False)
    runtime_env = configure_runtime(args.runtime.resolve(), args.max_side, directory)
    if args.full_frame:
        os.environ["CLEANER_INFERENCE_ROI"] = runtime_env["CLEANER_INFERENCE_ROI"] = "0"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    began = time.monotonic()
    manifest = {"status": "preparing", "started_at": datetime.now(timezone.utc).isoformat(),
                "source": {"path": str(source), "sha256": sha256(source)},
                "reference": {"path": str(reference), "sha256": sha256(reference)},
                "regions": {"path": str(regions_path), "sha256": sha256(regions_path), "values": regions},
                "options": {"seconds": args.seconds, "start": args.start, "reference_start": args.reference_start,
                            "mode": args.mode, "dynamic": not args.static_mask, "max_side": args.max_side,
                            "prepare_only": args.prepare_only, "alternative_attempts": 0},
                "runtime": runtime_env, "implementation": implementation_fingerprint(args.runtime.resolve()),
                "quality_verdict": "pending_visual_review"}
    manifest_path = directory / "manifest.json"

    def save():
        manifest["elapsed_seconds"] = round(time.monotonic() - began, 3)
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    def emit(progress, message, stage):
        line = f"[{progress:5.1f}%] {stage}: {message}"
        print(line, flush=True)
        with (directory / "progress.log").open("a", encoding="utf-8") as log:
            log.write(line + "\n")
        manifest["progress"] = {"percent": progress, "stage": stage, "message": message}
        save()

    save()
    try:
        from app.services.chunking import localize_masks
        from app.services.scene import detect_scenes
        from app.utils.video import probe
        from app.workers.tasks import _run_official_pipeline

        original_info, reference_info = probe(str(source)), probe(str(reference))
        seconds = min(args.seconds, original_info.duration - args.start, reference_info.duration - args.reference_start)
        frames = math.floor(seconds * original_info.fps + 1e-7)
        reference_frames = math.floor(seconds * reference_info.fps + 1e-7)
        if frames < 1 or reference_frames < 1:
            raise ValueError("requested time range is outside the source/reference video")
        sample, reference_sample = directory / "input.mp4", directory / "reference.mp4"
        emit(2, "extracting bounded native-resolution source and reference", "preparing")
        run_command(sample_command(source, sample, args.start, frames, original_info.fps), directory / "ffmpeg.log")
        run_command(sample_command(reference, reference_sample, args.reference_start, reference_frames, reference_info.fps), directory / "ffmpeg.log")
        info, ref_info = probe(str(sample)), probe(str(reference_sample))
        validate_sample(info, original_info, frames)
        validate_sample(ref_info, reference_info, reference_frames)
        regions = localize_masks(regions, args.start, frames / info.fps)
        if not any(region.get("role", "remove") == "remove" for region in regions):
            raise ValueError("reviewed remove regions do not overlap the sample")
        scenes = detect_scenes(str(sample))
        if args.scene_cuts:
            from app.services.scene_pipeline import frame_spans
            cuts = [int(value) for value in args.scene_cuts.split(",")]
            if any(cut <= 0 or cut >= frames for cut in cuts):
                raise ValueError("reviewed scene cuts must be within sample frame range")
            scenes = frame_spans(frames, cuts)
            manifest["scene_detection"] = "reviewed_manual_cuts"
        if not scenes or scenes[-1][1] != frames:
            raise RuntimeError("scene detection did not cover every sample frame")
        manifest.update({"sample": {**asdict(info), "sha256": sha256(sample)}, "reference_sample": asdict(ref_info),
                         "scene_spans": scenes, "sample_regions": regions})
        if args.prepare_only:
            manifest["mask_review"] = prepare_masks(sample, directory, regions, info, scenes, args, emit)
            manifest["status"] = "prepared_only"
        else:
            output = directory / "output.mp4"
            manifest["status"] = "running"
            save()
            if args.prepared_from:
                import cv2
                import numpy as np
                from app.services.scene_pipeline import run_scenes
                from app.services.mask import build_masks_window
                from app.services.text_detect import frame_text_mask, _colored_subtitle_mask
                from app.utils.video import read_chunk, read_frames
                prepared = args.prepared_from.resolve(strict=True)
                previous = json.loads((prepared / "manifest.json").read_text(encoding="utf-8"))
                if (previous.get("status") != "prepared_only" or previous["sample"]["sha256"] != sha256(sample)
                        or previous["regions"]["sha256"] != sha256(regions_path)
                        or previous["scene_spans"] != [list(span) for span in scenes]):
                    raise ValueError("prepared masks do not match exact sample, regions and scene spans")
                manifest["reviewed_masks"] = {"directory": str(prepared), "extra_halo_px": args.mask_halo,
                                              "repair_empty_masks": args.repair_empty_masks,
                                              "repair_color_masks": args.repair_color_masks, "scenes": []}

                def run_reviewed(src, out, work, selected_regions, part, progress):
                    # run_scenes can skip shots outside timed regions.
                    index = int(Path(work).name)
                    origin = prepared / "mask-review" / f"{index:04d}" / "masks"
                    masks = Path(work) / "masks"
                    masks.mkdir(exist_ok=True)
                    removes, protects = build_masks_window(selected_regions, part.width, part.height, 0, part.frames, part.fps)
                    digest = hashlib.sha256()
                    repaired = []
                    source_frames = read_frames(src) if args.repair_color_masks else None
                    for frame_index in range(part.frames):
                        mask = cv2.imread(str(origin / f"{frame_index:06d}.png"), 0)
                        if mask is None or mask.shape != (part.height, part.width):
                            raise ValueError("reviewed mask missing or wrong geometry")
                        if source_frames is not None:
                            frame = next(source_frames)
                            colored = _colored_subtitle_mask(frame, removes[frame_index])
                            if np.any((colored > 0) & (mask == 0)):
                                repaired.append(frame_index)
                            mask = cv2.bitwise_or(mask, colored)
                        if args.repair_empty_masks and not mask.any() and removes[frame_index].any():
                            single_frame = read_chunk(src, frame_index, 1)
                            if len(single_frame) != 1:
                                raise ValueError("missing source frame for empty mask review")
                            mask = frame_text_mask(single_frame[0], roi=removes[frame_index], subtitle_only=True)
                            if mask.any():
                                repaired.append(frame_index)
                        if args.mask_halo:
                            k = 2 * args.mask_halo + 1
                            mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
                        mask = np.where((removes[frame_index] > 0) & (protects[frame_index] == 0), mask, 0).astype(np.uint8)
                        digest.update(mask.tobytes())
                        if not cv2.imwrite(str(masks / f"{frame_index:06d}.png"), mask):
                            raise RuntimeError("could not save reviewed mask")
                    if source_frames is not None:
                        source_frames.close()
                    manifest["reviewed_masks"]["scenes"].append({"index": index, "mask_pixels_sha256": digest.hexdigest(),
                                                               "repaired_frames": sorted(set(repaired))})
                    save()
                    return _run_official_pipeline(src, out, work, selected_regions, part, args.mode, "max",
                        False, 1, False, True, progress, composite_on=True, prepared_mask_dir=str(masks))

                segments, metrics, written = run_scenes(str(sample), str(output), str(directory), regions, info,
                    [start for start, _ in scenes if start > 0], run_reviewed, emit)
            else:
                segments, metrics, written = _run_official_pipeline(
                    str(sample), str(output), str(directory), regions, info, args.mode, "max",
                    not args.static_mask, 1, False, True, emit, composite_on=True,
                    scene_cuts=[start for start, _ in scenes if start > 0], refinement_budget=None,
                )
            output_info = probe(str(output))
            validate_sample(output_info, info, frames)
            if written != frames:
                raise RuntimeError("inference returned an incomplete video")
            manifest.update({"status": "completed_candidate", "segments": segments, "metrics": metrics,
                             "output": {**asdict(output_info), "path": output.name, "sha256": sha256(output)}})
        comparison_html(directory, args.prepare_only)
        emit(100, "comparison artifacts ready; visual quality approval remains pending", "completed")
        return 0
    except Exception as exc:
        manifest.update({"status": "failed", "error": {"type": type(exc).__name__, "message": str(exc)}})
        save()
        print(f"FAILED: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
