from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    command = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration,bit_rate",
        "-show_entries", "format=duration,size,bit_rate", "-of", "json", str(path),
    ]
    return json.loads(subprocess.check_output(command, text=True, encoding="utf-8"))


def decode(path: Path) -> list[np.ndarray]:
    capture = cv2.VideoCapture(str(path))
    frames: list[np.ndarray] = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    return frames


def alignment(input_frames: list[np.ndarray], reference_frames: list[np.ndarray]) -> dict:
    def signature(frame: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Ignore the main subtitle band when estimating temporal alignment.
        gray = np.concatenate((gray[:1300], gray[1600:]), axis=0)
        return cv2.resize(gray, (54, 96), interpolation=cv2.INTER_AREA).astype(np.float32)

    left = [signature(frame) for frame in input_frames]
    right = [signature(frame) for frame in reference_frames]
    candidates = []
    for offset in range(-3, 4):
        errors = []
        for index in range(max(0, -offset), min(len(left), len(right) - offset)):
            errors.append(float(np.mean(np.abs(left[index] - right[index + offset]))))
        candidates.append({"offset_frames": offset, "mean_absolute_luma_error": round(float(np.mean(errors)), 4)})
    best = min(candidates, key=lambda item: item["mean_absolute_luma_error"])
    return {"method": "minimum luma MAE outside subtitle band", "candidates": candidates, "best": best}


def sharpness(frames: list[np.ndarray], crop: tuple[int, int, int, int]) -> float:
    x0, y0, x1, y1 = crop
    values = [cv2.Laplacian(cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() for frame in frames]
    return round(float(np.mean(values)), 3)


def detail_sheet(output: Path, frames: dict[str, list[np.ndarray]], indices: list[int], crop: tuple[int, int, int, int], offsets: dict[str, int]) -> None:
    x0, y0, x1, y1 = crop
    labels = list(frames)
    cell_width, cell_height = x1 - x0, y1 - y0
    header, row_header = 48, 34
    canvas = np.full((header + len(indices) * (row_header + cell_height), cell_width * len(labels), 3), 22, np.uint8)
    for column, label in enumerate(labels):
        cv2.putText(canvas, label, (column * cell_width + 12, 31), cv2.FONT_HERSHEY_SIMPLEX, .72, (255, 255, 255), 2, cv2.LINE_AA)
        for row, index in enumerate(indices):
            source_index = index + offsets.get(label, 0)
            top = header + row * (row_header + cell_height)
            cv2.putText(canvas, f"orig {index} | fonte {source_index}", (column * cell_width + 12, top + 23), cv2.FONT_HERSHEY_SIMPLEX, .55, (215, 215, 215), 1, cv2.LINE_AA)
            canvas[top + row_header:top + row_header + cell_height, column * cell_width:(column + 1) * cell_width] = frames[label][source_index][y0:y1, x0:x1]
    cv2.imwrite(str(output), canvas)


def make_video(ours: Path, vmake: Path, output: Path, offset: int, frame_count: int) -> None:
    ours_start = max(0, -offset)
    vmake_start = max(0, offset)
    graph = (
        f"[0:v]trim=start_frame={ours_start},setpts=N/(30*TB),scale=540:960:flags=lanczos[left];"
        f"[1:v]trim=start_frame={vmake_start},setpts=N/(30*TB),scale=540:960:flags=lanczos[right];"
        "[left][right]hstack=inputs=2[v]"
    )
    subprocess.run([
        "ffmpeg", "-y", "-v", "warning", "-i", str(ours), "-i", str(vmake),
        "-filter_complex", graph, "-map", "[v]", "-map", "0:a?", "-frames:v", str(frame_count),
        "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", str(output),
    ], check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--ours", type=Path, required=True)
    parser.add_argument("--vmake", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    paths = {"Original": args.input.resolve(), "Nosso v3": args.ours.resolve(), "Vmake": args.vmake.resolve()}
    frames = {label: decode(path) for label, path in paths.items()}
    frame_counts = {label: len(items) for label, items in frames.items()}
    if len(set(frame_counts.values())) != 1:
        raise RuntimeError(f"Frame counts differ: {frame_counts}")
    count = next(iter(frame_counts.values()))
    dimensions = {(items[0].shape[1], items[0].shape[0]) for items in frames.values()}
    if len(dimensions) != 1:
        raise RuntimeError(f"Geometry differs: {dimensions}")

    crop = (150, 1330, 930, 1560)
    groups = {"janela": [30, 50, 60, 70, 73], "fivela": [75, 85, 90, 100, 103], "tecido": [106, 115, 120, 130, 140]}
    alignment_result = alignment(frames["Original"], frames["Vmake"])
    vmake_offset = int(alignment_result["best"]["offset_frames"])
    offsets = {"Original": 0, "Nosso v3": 0, "Vmake": vmake_offset}
    for name, indices in groups.items():
        detail_sheet(args.output / f"detalhe-{name}.png", frames, indices, crop, offsets)
    aligned_count = count - abs(vmake_offset)
    make_video(paths["Nosso v3"], paths["Vmake"], args.output / "comparacao-nosso-vs-vmake.mp4", vmake_offset, aligned_count)

    report = {
        "kind": "commercial_reference_without_ground_truth",
        "created_at": "2026-09-10",
        "sources": {label: {"path": str(path), "sha256": sha256(path), "probe": probe(path)} for label, path in paths.items()},
        "decoded_contract": {"frame_count": count, "geometry": list(next(iter(dimensions))), "same_frame_count": True, "same_geometry": True},
        "alignment": alignment_result,
        "proxy_metrics": {
            "subtitle_band_laplacian_variance": {label: sharpness(items, crop) for label, items in frames.items()},
            "warning": "Sharpness is a descriptive proxy and may reward noise. Vmake is a commercial visual reference, not pixel ground truth.",
        },
        "comparison_video": {"display_scale_per_pane": [540, 960], "fps": 30, "frames": aligned_count, "vmake_offset_frames": vmake_offset, "purpose": "scene-aligned visual review only"},
        "cost_usd": None,
        "cost_reason": "Existing local outputs were compared; no new billed GPU job was executed.",
    }
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    relative = {label: Path("../") / path.relative_to(args.output.parent) for label, path in paths.items()}
    cards = "".join(f'<figure><figcaption>{label}</figcaption><video controls muted playsinline preload="metadata" data-offset="{offsets[label]}" src="{str(path).replace(chr(92), "/")}"></video></figure>' for label, path in relative.items())
    html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cleaner IA × Vmake — 147 quadros</title><style>body{{font:16px system-ui;background:#111;color:#eee;margin:24px}}h1{{margin-bottom:4px}}.note{{color:#bbb;max-width:900px}}main{{display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:14px}}figure{{margin:0}}figcaption{{font-weight:700;margin:8px 0}}video{{width:100%;max-height:72vh;background:#000}}button{{padding:10px 14px;margin:10px 8px 18px 0}}a{{color:#8ecbff}}@media(max-width:850px){{main{{grid-template-columns:1fr}}}}</style></head><body><h1>Cleaner IA × Vmake</h1><p class="note">Os três arquivos têm 147 quadros em 1080×1920. O Vmake antecipou os cortes em 3 quadros; a comparação abaixo aplica essa correção. Ele é referência comercial visual, não ground truth.</p><button id="play">Reproduzir alinhados</button><button id="pause">Pausar</button><button id="reset">Voltar</button><main>{cards}</main><p>Comparação pronta: <a href="comparacao-nosso-vs-vmake.mp4">vídeo lado a lado alinhado</a> · <a href="detalhe-janela.png">janela</a> · <a href="detalhe-fivela.png">fivela</a> · <a href="detalhe-tecido.png">tecido</a> · <a href="report.json">relatório técnico</a></p><script>const v=[...document.querySelectorAll('video')],anchor=v[0];function sync(){{v.slice(1).forEach(x=>x.currentTime=Math.max(0,anchor.currentTime+(Number(x.dataset.offset)||0)/30))}}play.onclick=()=>{{sync();v.forEach(x=>x.play().catch(()=>{{}}))}};pause.onclick=()=>v.forEach(x=>x.pause());reset.onclick=()=>v.forEach(x=>{{x.pause();x.currentTime=Math.max(0,(Number(x.dataset.offset)||0)/30)}});anchor.addEventListener('seeked',sync);</script></body></html>'''
    (args.output / "comparison.html").write_text(html, encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()), "frames": count, "report": report["alignment"]["best"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
