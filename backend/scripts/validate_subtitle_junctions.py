"""Phase-2 bounded A/B on the approved v3 model cache, no new GPU inference."""
import argparse
from dataclasses import asdict
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from app.services.inference_region import _write_video
from app.services.pixel_composite import composite_lossless
from app.services.subtitle_junctions import refine_subtitle_scene
from app.utils.video import probe, read_frames, ffmpeg_filter, mux_audio
from validate_pixel_preservation import compare, sha256, comparison_page


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("v3", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--regions", type=Path, required=True)
    args = parser.parse_args()
    source, baseline = args.v3 / "input.mp4", args.v3 / "output.mp4"
    old = json.loads((args.v3 / "manifest.json").read_text(encoding="utf-8"))
    regions = json.loads(args.regions.read_text(encoding="utf-8-sig"))
    info = probe(str(source))
    if old["pipeline_revision"] != "scene-roi-v3" or not 0 < info.duration <= 5.001:
        raise ValueError("expected bounded v3 source")
    if sha256(source) != old["source_sha256"] or sha256(baseline) != old["output"]["sha256"]:
        raise ValueError("reviewed source/baseline changed")
    # Exact cache identities documented in the previous validated comparison.
    native_hashes = ["386b6b445ff1704f57aed87cb7cf8a1cd0201e2bbc9128e4c28dd53ad5dec466",
                     "86270b51149b1c4b86fdab64a46089d1c8cfa6c886a325b77525e57d78ff1662",
                     "db0b7e182d5663bcd24a0bcc53c36894a741e8375f0f866cf530b905953380c8"]
    if len(old["parts"]) != 3 or len(old["scene_spans"]) != 3:
        raise ValueError("this validator uses the three reviewed scene caches")
    cache, masks, cursor = [], [], 0
    complete = read_frames(str(source))
    try:
        for index, (part, (start, end)) in enumerate(zip(old["parts"], old["scene_spans"])):
            output = Path(part["path"])
            original, native = output.parent / "input.mp4", output.parent / "propainter-native.mp4"
            if start != cursor or end <= start or sha256(output) != part["sha256"] or sha256(native) != native_hashes[index]:
                raise ValueError("scene cache/order mismatch")
            pi = probe(str(original))
            if pi.frames != end - start:
                raise ValueError("scene length mismatch")
            stream = read_frames(str(original))
            try:
                for frame in stream:
                    if not np.array_equal(next(complete, None), frame):
                        raise ValueError("scene source pixels differ from reviewed input")
            finally:
                stream.close()
            comp = output.parent / "subtitle-policy/composite-masks"
            cache.append((original, native, output.parent / "masks", comp, pi, start))
            masks.extend(comp / f"{i:06d}.png" for i in range(pi.frames))
            cursor = end
        if cursor != info.frames or next(complete, None) is not None:
            raise ValueError("incomplete scene coverage")
    finally:
        complete.close()
    target = args.output.resolve()
    target.mkdir(parents=True, exist_ok=False)
    report = {"status": "running", "source_sha256": sha256(source), "baseline_sha256": sha256(baseline),
              "scope": "phase 2 only, identical v3 model outputs; CPU optical flow and composition",
              "native_sha256": native_hashes, "regions_sha256": sha256(args.regions), "scenes": [], "exports": {}}
    root = Path(__file__).resolve().parents[1]
    report["implementation"] = {p: sha256(root / p) for p in (
        "app/video/subtitle_junctions.py", "app/services/subtitle_junctions.py", "scripts/validate_subtitle_junctions.py")}
    def save():
        (target / "manifest.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    start_time = time.monotonic()
    save()
    try:
        from app.services.chunking import localize_masks
        parts = {key: [] for key in ("control", "mask", "reference")}
        for i, (original, native, raw, comp, pi, offset) in enumerate(cache):
            print(f"Scene {i + 1}/3: verify donors, flow and masks", flush=True)
            work = target / "scenes" / f"{i:04d}"
            local = localize_masks(regions, offset / info.fps, pi.duration)
            stats = refine_subtitle_scene(original, native, raw, comp, work, pi, local,
                                          cancel_file=str(target / "cancel.flag"))
            report["scenes"].append({k: v for k, v in stats.items() if k != "frame_reports"})
            composite_lossless(original, native, comp, work / "control-master.mp4", pi)
            for name in parts:
                parts[name].append(work / f"{name}-master.mp4")
            save()
        for name, paths in parts.items():
            print(f"Export and verify {name}", flush=True)
            def frames():
                for path in paths:
                    stream = read_frames(str(path))
                    try:
                        yield from stream
                    finally:
                        stream.close()
            master = target / f"{name}-master.mp4"
            _write_video(master, info.width, info.height, info.fps, frames())
            fidelity = compare(master, source, masks)
            if fidelity["outside"]["changed_pixels"]:
                raise ValueError("pixels outside selected masks changed")
            delivery = ffmpeg_filter(str(master), str(target / "delivery.mp4"), "null", crf=14)
            output = target / f"{name}.mp4"
            mux_audio(delivery, str(source), str(output), info.has_audio)
            if asdict(probe(str(output))) != asdict(info):
                raise ValueError("phase-2 export changed geometry/timing/audio")
            report["exports"][name] = {"sha256": sha256(output), "media": asdict(probe(str(output))),
                                       "bytes": output.stat().st_size, "master_vs_source": fidelity}
            save()
        comparison_page(target, [("V3 · mesmo encode CRF14", target / "control.mp4"),
                                 ("Fase 2 · máscaras", target / "mask.mp4"),
                                 ("Fase 2 · máscaras e referências", target / "reference.mp4"),
                                 ("Vmake", args.v3 / "reference.mp4")])
        page = target / "comparison.html"
        page.write_text(page.read_text(encoding="utf-8").replace("Fase 1", "Fase 2")
                        .replace("preservar detalhes", "máscaras e referências")
                        .replace('href="master.mp4"', 'href="reference-master.mp4"'), encoding="utf-8")
        report.update(status="completed_candidate", seconds=time.monotonic() - start_time)
    except BaseException as e:
        report.update(status="failed", error=f"{type(e).__name__}: {e}")
        raise
    finally:
        save()


if __name__ == "__main__":
    main()
