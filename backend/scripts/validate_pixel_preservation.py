"""Bounded phase-1 A/B using identical v3 inputs/masks; local GPU only.

The existing sample already has extraction compression. Reusing it deliberately
isolates model I/O from that earlier loss. No restoration/sharpening is applied.
"""
from dataclasses import asdict
import argparse
import hashlib
import html
from itertools import zip_longest
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2
import numpy as np

from app.engines.propainter_official import run_propainter
from app.services.inference_region import prepare_inference_region, restore_inference_region, _write_video
from app.services.pixel_composite import composite_lossless
from app.utils.video import probe, read_frames, ffmpeg_filter, mux_audio
from validate_local_roi_sample import implementation_fingerprint, sha256


def mask_digest(directory):
    digest = hashlib.sha256()
    for p in sorted(directory.glob("*.png")):
        digest.update(p.name.encode())
        digest.update(p.read_bytes())
    return digest.hexdigest()


def compare(a_path, b_path, masks):
    """Decoded BGR error by region, for encoding fidelity, not AI quality."""
    totals = {key: {"sse": 0., "samples": 0, "changed_pixels": 0, "max_delta": 0}
              for key in ("inside", "outside")}
    streams = read_frames(str(a_path)), read_frames(str(b_path))
    count = 0
    try:
        for i, (a, b) in enumerate(zip_longest(*streams)):
            if a is None or b is None or a.shape != b.shape or i >= len(masks):
                raise ValueError("comparison frame count or geometry mismatch")
            mask = cv2.imread(str(masks[i]), 0)
            if mask is None or mask.shape != a.shape[:2]:
                raise ValueError("comparison mask mismatch")
            delta = a.astype(np.int16) - b.astype(np.int16)
            for key, region in (("inside", mask > 0), ("outside", mask == 0)):
                d = delta[region]
                if d.size:
                    t = totals[key]
                    t["sse"] += float(np.square(d.astype(np.float64)).sum())
                    t["samples"] += d.size
                    t["changed_pixels"] += int(np.any(d != 0, axis=1).sum())
                    t["max_delta"] = max(t["max_delta"], int(np.abs(d).max()))
            count += 1
    finally:
        for stream in streams:
            stream.close()
    if count != len(masks):
        raise ValueError("incomplete comparison")
    for t in totals.values():
        mse = t.pop("sse") / max(1, t["samples"])
        t["mse"] = mse
        t["psnr_db"] = 10 * math.log10(255**2 / mse) if mse else None
    return totals


def comparison_page(target, videos):
    cards = []
    for label, path in videos:
        src = html.escape(Path(os.path.relpath(path, target)).as_posix(), quote=True)
        cards.append(f'<figure><figcaption>{html.escape(label)}</figcaption><video controls muted preload="metadata" src="{src}"></video></figure>')
    (target / "comparison.html").write_text('''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Fase 1 — preservação</title>
<style>body{background:#17191b;color:#eee;font:16px system-ui;margin:24px}main{display:flex;gap:16px;flex-wrap:wrap}figure{flex:1;min-width:240px;margin:0}video{width:100%;max-height:70vh}button{padding:12px;margin:12px 8px 20px 0}a{color:#a9d6ff}</style>
<h1>Fase 1 — preservar detalhes</h1><p>Mesmos quadros e máscaras da v3. Sem nitidez artificial ou restauração global. Compare a janela, a fivela e o tecido em movimento. O Vmake tem diferenças de tempo e aparência.</p>
<button id="play">Reproduzir juntos</button><button id="pause">Pausar</button><button id="reset">Voltar ao início</button><main>''' + ''.join(cards) + '''</main>
<p><a href="manifest.json">Medições e limitações</a> · <a href="master.mp4">Master RGB sem perdas (pode exigir VLC)</a></p>
<script>const vs=[...document.querySelectorAll('video')];play.onclick=()=>{vs.slice(1).forEach(v=>v.currentTime=vs[0].currentTime);vs.forEach(v=>v.play().catch(()=>{}))};pause.onclick=()=>vs.forEach(v=>v.pause());reset.onclick=()=>vs.forEach(v=>{v.pause();v.currentTime=0});vs[0].addEventListener('seeked',()=>vs.slice(1).forEach(v=>{if(Math.abs(v.currentTime-vs[0].currentTime)>.05)v.currentTime=vs[0].currentTime}));</script></html>''', encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("v3_directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--runtime", type=Path, default=Path("G:/cleaneria-runtime"))
    args = parser.parse_args()
    old_dir, target = args.v3_directory.resolve(strict=True), args.output.resolve()
    old = json.loads((old_dir / "manifest.json").read_text(encoding="utf-8"))
    source, baseline = old_dir / "input.mp4", old_dir / "output.mp4"
    info = probe(str(source))
    if old["pipeline_revision"] != "scene-roi-v3" or not 0 < info.duration <= 5.001:
        raise ValueError("only reviewed v3 samples up to five seconds are accepted")
    if sha256(source) != old["source_sha256"] or sha256(baseline) != old["output"]["sha256"]:
        raise ValueError("reviewed sample checksum mismatch")
    cache, masks, cursor = [], [], 0
    complete = read_frames(str(source))
    try:
        if len(old["parts"]) != len(old["scene_spans"]):
            raise ValueError("incomplete scene manifest")
        for part, (start, end) in zip(old["parts"], old["scene_spans"]):
            path = Path(part["path"])
            original = path.parent / "input.mp4"
            policy = path.parent / "subtitle-policy"
            settings = json.loads((policy / "report.json").read_text(encoding="utf-8"))
            # Earlier v3 dense-reference caches predate the explicit field;
            # the adapter capped these at 32 (temporal_window or 32).
            settings.setdefault("temporal_window", 32)
            pi = probe(str(original))
            if start != cursor or end <= start or sha256(path) != part["sha256"] or pi.frames != end - start:
                raise ValueError("scene ordering/checksum mismatch")
            scene = read_frames(str(original))
            count = 0
            try:
                for f in scene:
                    if not np.array_equal(next(complete, None), f):
                        raise ValueError("cached scene pixels do not match v3")
                    count += 1
            finally:
                scene.close()
            if count != pi.frames:
                raise ValueError("invalid cached scene")
            cache.append((original, policy, pi, settings))
            masks.extend(policy / "composite-masks" / f"{i:06d}.png" for i in range(pi.frames))
            cursor = end
        if cursor != info.frames or next(complete, None) is not None:
            raise ValueError("scenes do not cover input")
    finally:
        complete.close()
    # Process-local settings: never load cloud credentials or create a worker.
    runtime = args.runtime.resolve(strict=True)
    os.environ.update(PROPAINTER_ROOT=str(runtime / "ProPainter"),
        PROPAINTER_WEIGHTS_DIR=str(runtime / "ProPainter/weights"),
        PROPAINTER_PYTHON=str(runtime / "propainter-env/Scripts/python.exe"),
        PROPAINTER_PRESERVE_PIXELS="1", PROPAINTER_ALLOW_CPU="0", PROPAINTER_MAX_SIDE="960",
        PROPAINTER_SUBVIDEO_LENGTH="80", PROPAINTER_NEIGHBOR_LENGTH="6", PROPAINTER_REF_STRIDE="10",
        PROPAINTER_FP16="1", PROPAINTER_TIMEOUT_SECONDS="1800")
    target.mkdir(parents=True, exist_ok=False)
    cancel = target / "cancel.flag"
    report = {"status": "running", "scope": "phase 1 only; same compressed v3 input, masks and model",
              "source_sha256": sha256(source), "baseline_sha256": sha256(baseline),
              "implementation": implementation_fingerprint(runtime), "scenes": [], "exports": {},
              "limitations": ["PSNR measures encoding fidelity, not reconstruction truth or Vmake parity",
                              "Sample extraction compression predates this experiment",
                              "Experimental local route; not public site or RunPod rollout"]}
    for rel in ("app/engines/propainter_pixels.py", "app/services/pixel_composite.py", "scripts/validate_pixel_preservation.py"):
        report["implementation"]["application_files"][rel] = sha256(Path(__file__).resolve().parents[1] / rel)
    def save():
        (target / "manifest.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    started, outputs = time.monotonic(), []
    save()
    try:
        for i, (original, policy, pi, settings) in enumerate(cache):
            work = target / "scenes" / f"{i:04d}"
            work.mkdir(parents=True)
            print(f"Scene {i + 1}/{len(cache)}: {pi.frames} frames", flush=True)
            region = prepare_inference_region(str(original), str(policy / "inference-masks"), str(work), pi, cancel_file=str(cancel))
            begin = time.monotonic()
            model = run_propainter(region.source_path, region.mask_dir, str(work / "propainter-run"),
                region.width, region.height, pi.fps, "quality", on_stage=lambda s: print(s, flush=True),
                cancel_file=str(cancel), reference_stride=settings["reference_stride"], temporal_window=settings["temporal_window"])
            model_seconds = time.monotonic() - begin
            native = restore_inference_region(model, region, str(original), str(work / "native.mp4"), pi, str(cancel))
            out = composite_lossless(original, native, policy / "composite-masks", work / "master.mp4", pi, str(cancel))
            outputs.append(out)
            pixels = json.loads((work / "propainter-run/pixels.json").read_text())
            if pixels["resampled"]:
                raise RuntimeError("experiment reduced spatial detail; candidate rejected")
            report["scenes"].append({"roi": asdict(region), "model_seconds": model_seconds, "pixels": pixels,
                "source_sha256": sha256(original), "mask_sha256": {k: mask_digest(policy / k) for k in ("inference-masks", "composite-masks")},
                "reference_stride": settings["reference_stride"], "temporal_window": settings["temporal_window"]})
            save()
        def joined():
            for path in outputs:
                stream = read_frames(path)
                try:
                    yield from stream
                finally:
                    stream.close()
        master = target / "master.mp4"
        _write_video(master, info.width, info.height, info.fps, joined())
        report["master_vs_source"] = compare(master, source, masks)
        if report["master_vs_source"]["outside"]["changed_pixels"]:
            raise RuntimeError("master changed pixels outside mask")
        report["baseline_vs_source"] = compare(baseline, source, masks)
        for crf in (16, 14, 12):
            print(f"Export and measure CRF {crf}", flush=True)
            video = ffmpeg_filter(str(master), str(target / "delivery.mp4"), "null", crf=crf)
            out = target / f"output-crf{crf}.mp4"
            mux_audio(video, str(source), str(out), info.has_audio)
            if asdict(probe(str(out))) != asdict(info):
                raise ValueError("delivery changed geometry, timing or audio")
            control = target / f"control-crf{crf}.mp4"
            ffmpeg_filter(str(source), str(control), "null", crf=crf)
            report["exports"][str(crf)] = {"bytes": out.stat().st_size, "sha256": sha256(out),
                "vs_master": compare(out, master, masks), "control_vs_source": compare(control, source, masks),
                "media": asdict(probe(str(out)))}
            save()
        comparison_page(target, [("V3 aprovada", baseline), ("Fase 1 · CRF 14", target / "output-crf14.mp4"),
                                 ("Fase 1 · CRF 12", target / "output-crf12.mp4"), ("Vmake", old_dir / "reference.mp4")])
        report.update(status="completed_candidate", elapsed_seconds=time.monotonic() - started,
                      master_bytes=master.stat().st_size, master_sha256=sha256(master))
    except BaseException as e:
        report.update(status="failed", error=f"{type(e).__name__}: {e}")
        raise
    finally:
        save()


if __name__ == "__main__":
    main()
