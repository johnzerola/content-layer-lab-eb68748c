"""Local, read-only media analysis; writes only derived transcripts to --output.

Run in an isolated environment with faster-whisper==1.2.1 (MIT).
ASR is evidence to review, not a claim of verbatim transcription or speaker age.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time
import ssl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--models", type=Path, required=True)
    args = parser.parse_args()
    # Trust the OS certificate store (including managed Windows roots), never disable TLS.
    import httpx
    from huggingface_hub import set_client_factory
    set_client_factory(lambda: httpx.Client(verify=ssl.create_default_context(), follow_redirects=True))
    from faster_whisper import WhisperModel

    args.output.mkdir(parents=True, exist_ok=True)
    print("Loading small / CPU int8 (analysis only)", flush=True)
    model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4,
                         download_root=str(args.models))
    for source in sorted(args.source.iterdir()):
        if source.suffix.lower() not in {".mp4", ".mp3", ".wav", ".m4a"}:
            continue
        target = args.output / (source.stem + ".transcript.json")
        if target.exists():
            print(f"Already analyzed: {source.name}", flush=True)
            continue
        started = time.monotonic()
        print(f"Transcribing: {source.name}", flush=True)
        segments, info = model.transcribe(str(source), language="pt", beam_size=5,
                                          word_timestamps=True, vad_filter=True)
        rows = []
        for segment in segments:
            row = {"start": segment.start, "end": segment.end, "text": segment.text.strip(),
                   "words": [{"start": w.start, "end": w.end, "text": w.word,
                              "probability": w.probability} for w in segment.words or []]}
            rows.append(row)
            print(f"{segment.start:6.2f}-{segment.end:6.2f} {segment.text}", flush=True)
        word_count = sum(len(row["words"]) for row in rows)
        result = {"source": source.name, "sha256": hashlib.file_digest(source.open("rb"), "sha256").hexdigest(),
                  "tool": "faster-whisper 1.2.1 / Systran small / CPU int8", "language": info.language,
                  "duration_sec": info.duration, "word_count": word_count,
                  "words_per_video_minute": round(word_count / info.duration * 60, 1),
                  "analysis_sec": round(time.monotonic() - started, 1), "segments": rows,
                  "warning": "Automatic transcript: review names, slang, overlaps and SFX manually."}
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved {target.name}: {result['words_per_video_minute']} words/min", flush=True)


if __name__ == "__main__":
    main()
