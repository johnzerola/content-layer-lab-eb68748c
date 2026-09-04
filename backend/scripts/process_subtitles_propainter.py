"""Remove burned-in spoken subtitles with a resumable ProPainter GPU pipeline."""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.engines.diffueraser_official import (
    DiffuEraserUnavailable,
    diffueraser_status,
    run_diffueraser,
)
from app.services.text_detect import frame_text_mask


def run(command: list[str], *, cwd: Path | None = None) -> None:
    printable = " ".join(f'"{part}"' if " " in part else part for part in command)
    print(f"\n> {printable}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def probe(path: Path) -> tuple[float, int, float]:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_read_frames,r_frame_rate",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(completed.stdout)
    stream = payload["streams"][0]
    numerator, denominator = map(int, stream["r_frame_rate"].split("/"))
    fps = numerator / denominator
    return float(payload["format"]["duration"]), int(stream["nb_read_frames"]), fps


def extract_chunk(
    source: Path,
    target: Path,
    start: float,
    frame_count: int,
    fps: int,
    width: int,
    height: int,
) -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{start:.6f}",
            "-i",
            str(source),
            "-an",
            "-vf",
            f"fps={fps},scale={width}:{height}:flags=lanczos",
            "-frames:v",
            str(frame_count),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "12",
            "-pix_fmt",
            "yuv420p",
            str(target),
        ]
    )


def create_masks(video: Path, mask_dir: Path, expected_frames: int) -> None:
    mask_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(video))
    frame_index = 0
    while frame_index < expected_frames:
        ok, frame = capture.read()
        if not ok:
            break
        height, width = frame.shape[:2]
        roi = np.zeros((height, width), dtype=np.uint8)
        roi[int(height * 0.70) : int(height * 0.81), :] = 255
        mask = frame_text_mask(frame, roi=roi, subtitle_only=True)
        cv2.imwrite(str(mask_dir / f"{frame_index:05d}.png"), mask)
        frame_index += 1
        if frame_index % 60 == 0:
            print(f"  mascaras: {frame_index}/{expected_frames}", flush=True)
    capture.release()
    if frame_index != expected_frames:
        raise RuntimeError(
            f"O bloco deveria ter {expected_frames} quadros, mas foram lidos {frame_index}."
        )


def create_mask_video(mask_dir: Path, target: Path, fps: int, expected_frames: int) -> None:
    frames = sorted(mask_dir.glob("*.png"))
    if len(frames) != expected_frames:
        raise RuntimeError(
            f"A mascara deveria ter {expected_frames} quadros, mas tem {len(frames)}."
        )
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-framerate",
            str(fps),
            "-i",
            str(mask_dir / "%05d.png"),
            "-frames:v",
            str(expected_frames),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "0",
            "-pix_fmt",
            "yuv420p",
            str(target),
        ]
    )


def propainter(
    video: Path,
    masks: Path,
    result_root: Path,
    runtime: Path,
    width: int,
    height: int,
    fps: int,
) -> Path:
    project = runtime / "ProPainter"
    python = runtime / "propainter-env" / "Scripts" / "python.exe"
    run(
        [
            str(python),
            str(project / "inference_propainter.py"),
            "--video",
            str(video),
            "--mask",
            str(masks),
            "--output",
            str(result_root),
            "--width",
            str(width),
            "--height",
            str(height),
            "--save_fps",
            str(fps),
            "--subvideo_length",
            "20",
            "--neighbor_length",
            "10",
            "--ref_stride",
            "10",
            "--raft_iter",
            "10",
            "--mask_dilation",
            "1",
            "--fp16",
        ],
        cwd=project,
    )
    output = result_root / video.stem / "inpaint_out.mp4"
    if not output.exists():
        raise RuntimeError(f"O ProPainter nao gerou o arquivo esperado: {output}")
    return output


def valid_result(path: Path, expected_frames: int) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        _, frames, _ = probe(path)
    except (subprocess.SubprocessError, KeyError, ValueError):
        return False
    return frames == expected_frames


def concatenate(parts: list[Path], target: Path, work: Path) -> None:
    work.mkdir(parents=True, exist_ok=True)
    manifest = work / "concat.txt"
    manifest.write_text(
        "".join(f"file '{part.as_posix()}'\n" for part in parts), encoding="utf-8"
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(manifest),
            "-c",
            "copy",
            str(target),
        ]
    )


def maybe_diffueraser(
    clean_video: Path,
    mask_video: Path,
    work: Path,
    duration: float,
    mode: str,
) -> Path:
    if mode == "off":
        return clean_video

    status = diffueraser_status()
    if not status.ready:
        message = "DiffuEraser pulado; indisponivel: " + ", ".join(status.missing)
        if mode == "required":
            raise DiffuEraserUnavailable(message)
        print(message, flush=True)
        return clean_video

    return Path(
        run_diffueraser(
            str(clean_video),
            str(mask_video),
            str(work / "diffueraser"),
            duration,
            on_stage=lambda stage: print(stage, flush=True),
        )
    )


def finish_video(clean_video: Path, original: Path, output: Path) -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(clean_video),
            "-i",
            str(original),
            "-filter_complex",
            "[0:v]scale=1080:1920:flags=lanczos,unsharp=5:5:0.35:3:3:0.15[v]",
            "-map",
            "[v]",
            "-map",
            "1:a?",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "14",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-shortest",
            "-movflags",
            "+faststart",
            str(output),
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--runtime", type=Path, default=Path(r"G:\cleaneria-runtime"))
    parser.add_argument("--chunk-seconds", type=int, default=10)
    parser.add_argument("--width", type=int, default=360)
    parser.add_argument("--height", type=int, default=640)
    parser.add_argument("--seed-first-result", type=Path)
    parser.add_argument(
        "--diffueraser",
        choices=("auto", "off", "required"),
        default="auto",
        help="auto usa DiffuEraser quando modelos+CUDA estiverem prontos; required falha se nao estiver.",
    )
    args = parser.parse_args()

    source = args.input.resolve()
    output = args.output.resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    duration, total_frames, source_fps = probe(source)
    fps = round(source_fps)
    if abs(source_fps - fps) > 0.01:
        raise RuntimeError(f"FPS nao suportado neste processamento: {source_fps}")

    work = args.runtime / "jobs" / source.stem
    work.mkdir(parents=True, exist_ok=True)
    chunk_frames = args.chunk_seconds * fps
    usable_frames = total_frames
    if total_frames > chunk_frames and total_frames % chunk_frames < max(2, fps // 2):
        usable_frames = total_frames - (total_frames % chunk_frames)
    chunk_count = math.ceil(usable_frames / chunk_frames)
    print(
        f"Video: {duration:.2f}s, {total_frames} quadros, {fps} fps, {chunk_count} blocos",
        flush=True,
    )

    parts: list[Path] = []
    mask_parts: list[Path] = []
    for index in range(chunk_count):
        start_frame = index * chunk_frames
        expected = min(chunk_frames, usable_frames - start_frame)
        if expected < max(2, fps // 2):
            print(f"[{index + 1}/{chunk_count}] sobra muito curta ignorada ({expected} quadros)", flush=True)
            break
        block = work / f"chunk-{index:03d}"
        video = block / f"chunk-{index:03d}.mp4"
        masks = block / "masks"
        mask_video = block / "mask.mp4"
        result_root = block / "result"
        result = result_root / video.stem / "inpaint_out.mp4"
        block.mkdir(parents=True, exist_ok=True)

        if index == 0 and args.seed_first_result and not result.exists():
            result.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(args.seed_first_result, result)

        if valid_result(result, expected):
            print(f"[{index + 1}/{chunk_count}] bloco pronto, reutilizando", flush=True)
            if not valid_result(mask_video, expected):
                create_mask_video(masks, mask_video, fps, expected)
            parts.append(result)
            mask_parts.append(mask_video)
            continue

        print(f"[{index + 1}/{chunk_count}] preparando {expected} quadros", flush=True)
        if video.exists():
            video.unlink()
        if masks.exists():
            shutil.rmtree(masks)
        if result_root.exists():
            shutil.rmtree(result_root)
        extract_chunk(
            source,
            video,
            start_frame / fps,
            expected,
            fps,
            args.width,
            args.height,
        )
        create_masks(video, masks, expected)
        result = propainter(
            video,
            masks,
            result_root,
            args.runtime,
            args.width,
            args.height,
            fps,
        )
        if not valid_result(result, expected):
            raise RuntimeError(f"Bloco {index} incompleto: {result}")
        create_mask_video(masks, mask_video, fps, expected)
        parts.append(result)
        mask_parts.append(mask_video)

    merged = work / "clean-low-resolution.mp4"
    merged_mask = work / "mask-low-resolution.mp4"
    concatenate(parts, merged, work)
    concatenate(mask_parts, merged_mask, work / "masks-concat")
    refined = maybe_diffueraser(
        merged,
        merged_mask,
        work,
        usable_frames / fps,
        args.diffueraser,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    finish_video(refined, source, output)
    _, final_frames, _ = probe(output)
    if abs(final_frames - usable_frames) > 1:
        raise RuntimeError(
            f"Resultado tem {final_frames} quadros; alvo tem {usable_frames}."
        )
    print(f"\nConcluido: {output}", flush=True)


if __name__ == "__main__":
    main()
