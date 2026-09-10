"""Compare lightweight finishing on verified cached ProPainter scenes, no GPU.

Usage: python backend/scripts/validate_subtitle_finish.py V3_DIRECTORY NEW_OUTPUT
Only a <=5 second sample is accepted. Sources and previous results stay intact.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import html
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.chunking import concat_videos
from app.services.subtitle_finishing import finish_subtitle_video
from app.utils.video import ffmpeg_filter, mux_audio, probe, read_frames


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("v3_directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--strength", type=float, default=0.3)
    args = parser.parse_args(argv)
    source_dir = args.v3_directory.resolve(strict=True)
    old = json.loads((source_dir / "manifest.json").read_text(encoding="utf-8"))
    source = source_dir / "input.mp4"
    baseline = source_dir / "output.mp4"
    info = probe(str(source))
    if not 0 < info.duration <= 5.001 or old.get("pipeline_revision") != "scene-roi-v3":
        raise ValueError("expected a bounded scene-roi-v3 sample")
    if sha256(source) != old["source_sha256"] or sha256(baseline) != old["output"]["sha256"]:
        raise ValueError("source or baseline checksum differs from reviewed manifest")
    parts = old["parts"]
    if len(parts) != len(old["scene_spans"]):
        raise ValueError("incomplete cached scene manifest")
    cache = []
    expected_start = 0
    for part, (start, end) in zip(parts, old["scene_spans"]):
        output = Path(part["path"])
        if sha256(output) != part["sha256"] or start != expected_start:
            raise ValueError("cached output mismatch or scene gap")
        native, original = output.parent / "propainter-native.mp4", output.parent / "input.mp4"
        masks = output.parent / "subtitle-policy/composite-masks"
        part_info = probe(str(original))
        native_info = probe(str(native))
        if ((part_info.width, part_info.height, part_info.fps, part_info.frames)
                != (info.width, info.height, info.fps, end - start)
                or (native_info.width, native_info.height, native_info.fps, native_info.frames)
                != (part_info.width, part_info.height, part_info.fps, part_info.frames)):
            raise ValueError("cached scene geometry mismatch")
        cache.append((original, native, masks, part_info))
        expected_start = end
    if expected_start != info.frames:
        raise ValueError("cached scenes do not cover input")

    # Exact decoded-pixel correspondence; do not infer alignment from duration.
    import numpy as np
    complete = read_frames(str(source))
    try:
        for original, _, _, _ in cache:
            scene = read_frames(str(original))
            try:
                for frame in scene:
                    if not np.array_equal(next(complete), frame):
                        raise ValueError("cached original pixels differ from v3 source")
            finally:
                scene.close()
        if next(complete, None) is not None:
            raise ValueError("source contains extra frames")
    finally:
        complete.close()

    target = args.output.resolve()
    target.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    report = {"status": "running", "source_sha256": sha256(source),
              "baseline_sha256": sha256(baseline), "strength": args.strength,
              "scope": "finishing only on identical cached inference, no new GPU/model run",
              "scene_spans": old["scene_spans"], "scenes": []}
    try:
        finished = []
        for index, (original, native, masks, part_info) in enumerate(cache):
            print(f"Finishing scene {index + 1}/{len(cache)} ({part_info.frames} frames)", flush=True)
            output = target / "scenes" / f"{index:04d}" / "subtitle-finished.mp4"
            stats = finish_subtitle_video(str(original), str(native), str(masks), str(output), part_info,
                                          strength=args.strength)
            report["scenes"].append({"input": str(original), "native": str(native),
                                     "masks": str(masks), "native_sha256": sha256(native), **stats})
            finished.append(str(output))
            print(json.dumps(stats), flush=True)
        merged = concat_videos(finished, str(target / "joined.mp4"), str(target))
        delivery = ffmpeg_filter(merged, str(target / "delivery.mp4"), "null", crf=16)
        output = target / "output.mp4"
        mux_audio(delivery, str(source), str(output), info.has_audio)
        final = probe(str(output))
        if asdict(final) != asdict(info):
            raise ValueError("finishing changed media geometry, time or audio presence")
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", os.devnull], check=True)
        report.update(status="completed_candidate", output={**asdict(final), "sha256": sha256(output)},
                      finishing_seconds=round(time.monotonic() - started, 3))
        reference = source_dir / "reference.mp4"
        if not reference.exists():
            reference = source_dir.parent / "VMAKE.IA.mp4"
        cards = []
        for label, video in (("Versão v3 anterior", baseline), ("Acabamento leve (candidato)", output),
                             ("Referência Vmake", reference)):
            relative = Path(os.path.relpath(video, target)).as_posix()
            cards.append(f'<figure><figcaption>{html.escape(label)}</figcaption><video controls muted playsinline preload="metadata" src="{html.escape(relative, quote=True)}"></video></figure>')
        document = '''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acabamento leve da remoção</title><style>body{font:16px system-ui;margin:24px;background:#161819;color:#eee}main{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;flex:1;min-width:260px}video{width:100%;max-height:72vh}button{padding:12px;margin:12px 8px 16px 0}a{color:#b8dbff}</style>
<h1>Acabamento leve da remoção</h1><p>Mesma reconstrução ProPainter, com correção localizada e referências do original. A referência Vmake tem diferenças de tempo e aparência. Confira as bordas, a fivela e o tecido também em movimento.</p><button id="play">Reproduzir juntos</button><button id="pause">Pausar</button><button id="reset">Voltar ao início</button><main>''' + "".join(cards) + '''</main><p><a href="manifest.json">Relatório desta comparação</a></p><script>const v=[...document.querySelectorAll('video')];document.querySelector('#play').onclick=()=>{v.slice(1).forEach(x=>x.currentTime=v[0].currentTime);v.forEach(x=>x.play().catch(()=>{}))};document.querySelector('#pause').onclick=()=>v.forEach(x=>x.pause());document.querySelector('#reset').onclick=()=>v.forEach(x=>{x.pause();x.currentTime=0});v[0].addEventListener('seeked',()=>v.slice(1).forEach(x=>{if(Math.abs(x.currentTime-v[0].currentTime)>.08)x.currentTime=v[0].currentTime}));</script></html>'''
        (target / "comparison.html").write_text(document, encoding="utf-8")
    except Exception as error:
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
        raise
    finally:
        (target / "manifest.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
