"""Pure limits shared by the ChatScene voice worker and its tests."""

import re


def speech_token_limit(text: str) -> int:
    """Return a text-proportional cap for the 25 Hz S3 speech tokenizer."""
    words = max(1, len(re.findall(r"\w+", text, flags=re.UNICODE)))
    pauses = len(re.findall(r"[,.!?;:]", text))
    expected_seconds = max(1.2, words / 2.3 + pauses * 0.25)
    maximum_seconds = min(29.0, max(6.0, expected_seconds * 2.4 + 2.0))
    return max(100, min(725, round(maximum_seconds * 25)))
