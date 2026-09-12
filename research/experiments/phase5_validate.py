"""Validate a phase-5 dataset and aggregate reproducible review evidence."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


REQUIRED_CATEGORIES = {
    "cloth", "straight-lines", "skin-face", "hair", "motion", "low-light",
    "simple-subtitle", "neon", "shadow", "transition",
}
SCORE_FIELDS = ("residual", "blur", "flicker", "ghosting", "texture", "geometry", "preservation")


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format",
        "-of", "json", str(path)], text=True, timeout=120))


def video_contract(data):
    video = next(item for item in data["streams"] if item["codec_type"] == "video")
    audio = [item for item in data["streams"] if item["codec_type"] == "audio"]
    return {
        "width": video["width"], "height": video["height"],
        "fps": video["avg_frame_rate"], "frames": video.get("nb_read_frames"),
        "duration": round(float(data["format"]["duration"]), 6),
        "audio": bool(audio),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = json.loads(args.manifest.read_text(encoding="utf-8"))
    base = args.manifest.parent
    cases, errors, covered, independent = [], [], set(), set()
    for raw in source.get("cases", []):
        case_id = str(raw.get("id", ""))
        categories = set(raw.get("categories", []))
        covered |= categories
        independent.add(str(raw.get("source_group", "")))
        item = {"id": case_id, "categories": sorted(categories), "status": "valid"}
        paths = {}
        for role in ("input", "baseline", "candidate"):
            value = raw.get(role)
            if not value:
                if role == "candidate":
                    item["status"] = "candidate_missing"
                    continue
                errors.append(f"{case_id}: missing {role}")
                item["status"] = "invalid"
                continue
            path = (base / value).resolve() if not Path(value).is_absolute() else Path(value)
            if not path.is_file():
                errors.append(f"{case_id}: {role} file missing")
                item["status"] = "invalid"
                continue
            paths[role] = path
            item[role] = {"path": str(path), "sha256": sha256(path), "contract": video_contract(probe(path))}
        if "input" in paths and "baseline" in paths:
            expected = item["input"]["contract"]
            for role in ("baseline", "candidate"):
                if role in item and item[role]["contract"] != expected:
                    errors.append(f"{case_id}: {role} delivery contract differs from input")
                    item["status"] = "invalid"
        review = raw.get("review")
        if review is not None:
            if set(review) != set(SCORE_FIELDS) or any(not isinstance(v, int) or not 0 <= v <= 4 for v in review.values()):
                errors.append(f"{case_id}: review must contain seven integer scores 0..4")
                item["status"] = "invalid"
            else:
                item["review"] = review
        cases.append(item)
    missing = sorted(REQUIRED_CATEGORIES - covered)
    independent.discard("")
    candidates_complete = all(item["status"] == "valid" and "candidate" in item for item in cases)
    ready = (not errors and not missing and candidates_complete
             and len(independent) >= 10 and len(cases) >= 10)
    report = {
        "schema": "cleaneria-phase5-v1", "status": "ready_for_blind_review" if ready else "incomplete",
        "requirements": {"minimum_cases": 10, "minimum_independent_source_groups": 10,
                         "required_categories": sorted(REQUIRED_CATEGORIES)},
        "coverage": {"cases": len(cases), "independent_source_groups": len(independent),
                     "categories": sorted(covered), "missing_categories": missing,
                     "candidates_complete": candidates_complete},
        "errors": errors, "cases": cases,
        "limitations": [
            "Encoded commercial references are not pixel ground truth unless independently aligned.",
            "Multiple clips from one source count as one independent source group.",
            "Automatic contract checks do not replace blind real-time visual review.",
            "Three-minute cost remains null until an accepted short candidate is measured on GPU.",
        ],
        "three_minute_cost_usd": None,
        "promotion_allowed": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": report["status"], "coverage": report["coverage"], "errors": len(errors)}))
    return 0 if ready else 2


if __name__ == "__main__":
    raise SystemExit(main())
