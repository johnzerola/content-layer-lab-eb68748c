"""Scene-isolated inference shared by the official video engines."""
from dataclasses import replace
from pathlib import Path
import subprocess

from .chunking import concat_videos, localize_masks
from ..utils.video import mux_audio, probe


def frame_spans(total: int, cuts=()):
    bounds = [0, *sorted({int(c) for c in cuts if 0 < int(c) < total}), total]
    return [(a, b) for a, b in zip(bounds, bounds[1:]) if b > a]


def run_scenes(input_path, output_path, job_dir, regions, info, cuts, run_one, emit,
               cancel_file=None):
    """Run each shot from ORIGINAL pixels; preserve absolute mask intervals.

    Intermediate inputs are lossless and silent. Only the final assembly takes
    audio from the original. A failed/short scene aborts, never produces a
    shortened successful output. run_one must not recursively split again.
    """
    parts, segments = [], []
    aggregate = {"residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0}
    spans = frame_spans(info.frames, cuts)
    scene_root = Path(job_dir) / "scenes"
    scene_root.mkdir(parents=True, exist_ok=True)
    for index, (start, end) in enumerate(spans):
        if cancel_file and Path(cancel_file).exists():
            raise RuntimeError("job cancelado")
        directory = scene_root / f"{index:04d}"
        directory.mkdir(exist_ok=True)
        source, result = directory / "input.mp4", directory / "output.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(input_path),
            "-vf", f"trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS",
            "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0",
            "-pix_fmt", "yuv420p", str(source),
        ], check=True, timeout=180)
        scene_info = replace(info, frames=end - start, duration=(end - start) / info.fps, has_audio=False)
        scene_regions = localize_masks(regions, start / info.fps, scene_info.duration)

        def progress(value, label, stage):
            emit(18 + 76 * (index + value / 100) / len(spans),
                 f"cena {index + 1}/{len(spans)}: {label}", stage)

        if not scene_regions:
            # A timed overlay may not exist in this shot. Preserve the shot.
            # normalize_video returns source for matching geometry without
            # creating result. Copy explicitly so later assembly has a file.
            import shutil
            shutil.copyfile(source, result)
            scene_segments, metrics, written = [], {
                "residual_text": 0.0, "sharpness_ratio": 1.0, "temporal_consistency": 1.0
            }, end - start
        else:
            scene_segments, metrics, written = run_one(
                str(source), str(result), str(directory), scene_regions, scene_info, progress
            )
        result_info = probe(str(result))
        if written != end - start or result_info.frames != end - start:
            raise RuntimeError("motor alterou a quantidade de quadros da cena")
        if (result_info.width, result_info.height) != (info.width, info.height):
            raise RuntimeError("motor alterou o enquadramento da cena")
        for segment in scene_segments:
            segments.append({**segment,
                "from": round(segment["from"] + start / info.fps, 6),
                "to": round(segment["to"] + start / info.fps, 6), "scene": index})
        aggregate["residual_text"] = max(aggregate["residual_text"], metrics["residual_text"])
        for key in ("sharpness_ratio", "temporal_consistency"):
            aggregate[key] = min(aggregate[key], metrics[key])
        aggregate["alternative_attempts"] = aggregate.get("alternative_attempts", 0) + metrics.get("alternative_attempts", 0)
        if metrics.get("alternative_failed"):
            aggregate["alternative_failed"] = True
        if metrics.get("selected_engine"):
            aggregate["selected_engine"] = "mixed-scene-engines"
        if metrics.get("subtitle_policy"):
            aggregate.setdefault("scene_policies", []).append({
                "scene": index, "from_frame": start, "to_frame": end,
                **metrics["subtitle_policy"],
            })
        if metrics.get("subtitle_finish"):
            aggregate.setdefault("scene_finishes", []).append({
                "scene": index, "from_frame": start, "to_frame": end,
                **metrics["subtitle_finish"],
            })
        parts.append(str(result))
    merged = concat_videos(parts, str(scene_root / "merged.mp4"), str(scene_root))
    mux_audio(merged, input_path, output_path, info.has_audio)
    return segments, aggregate, info.frames
