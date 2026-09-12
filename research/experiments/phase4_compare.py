"""Build Phase 4 motion comparators and a change-map video."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from phase23_compare import build


def main() -> None:
    p23 = Path("G:/dowloand/teste/phase-2-3-20260910")
    p4 = Path("G:/dowloand/teste/phase-4-v3-20260910")
    out = p4 / "comparators"
    out.mkdir(parents=True, exist_ok=True)
    base = p23 / "candidates/B2-real-donors-clipped-C2/master.mp4"
    current = p4 / "current/master.mp4"
    luma = p4 / "luma-local/master.mp4"
    optional = p4 / "film-optional/master.mp4"
    vmake = Path("G:/dowloand/teste/VMAKE.IA.mp4")
    report = {"alignment": {"source_family_start": 3, "vmake_start": 0, "offset": -3,
                            "vmake_role": "perceptual reference only"}, "videos": []}
    report["videos"].append(build(
        [base, current, luma, vmake],
        ["B2 / finish off", "current finish", "local Y finish", "VMAKE reference"],
        out / "b2-current-luma-vmake.mp4", [3, 3, 3, 0], 144))
    report["videos"].append(build(
        [base, current, luma, vmake],
        ["B2 / finish off", "current finish", "local Y finish", "VMAKE reference"],
        out / "b2-current-luma-vmake-sweater.mp4", [3, 3, 3, 0], 144,
        crop=(180, 1340, 900, 1545)))
    report["videos"].append(build(
        [base, current, luma, optional],
        ["B2 / finish off", "current finish", "local Y finish", "optional film Y"],
        out / "phase4-ablation-sweater.mp4", [104, 104, 104, 104], 43,
        crop=(180, 1340, 900, 1545)))
    map_video = out / "luma-local-change-map.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-framerate", "30", "-start_number", "0",
        "-i", str(p4 / "luma-local/change-maps/%06d.png"), "-frames:v", "147",
        "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p",
        str(map_video)
    ], check=True)
    report["change_map"] = str(map_video)
    (out / "comparison-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "comparators": 3, "change_map": str(map_video)}))


if __name__ == "__main__":
    main()
