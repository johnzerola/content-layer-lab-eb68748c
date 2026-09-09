import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location("roi_sample", Path(__file__).parents[1] / "scripts/validate_local_roi_sample.py")
sample = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sample)


@pytest.mark.parametrize("value", ["0", "-1", "5.1", "nan", "inf"])
def test_sample_duration_cannot_escape_bound(value):
    with pytest.raises(Exception):
        sample.bounded_seconds(value)


def test_regions_outside_frame_are_rejected(tmp_path):
    path = tmp_path / "regions.json"
    path.write_text(json.dumps([{"x": .8, "y": .3, "w": .4, "h": .2}]))
    with pytest.raises(ValueError, match="fit inside"):
        sample.read_regions(path)


def test_output_missing_audio_is_not_a_success():
    source = SimpleNamespace(width=1080, height=1920, frames=147, fps=30, has_audio=True)
    output = SimpleNamespace(**{**vars(source), "has_audio": False})
    with pytest.raises(RuntimeError, match="audio"):
        sample.validate_sample(output, source, 147)
