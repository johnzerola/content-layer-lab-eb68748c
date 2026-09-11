from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import pytest

from app.services.inference_region import _write_video
from app.services.subtitle_junctions import refine_subtitle_scene
from app.utils.video import probe, read_frames
from tests.test_subtitle_references import scene


def fixture(tmp_path):
    clean, original, rebuilt, mask = scene()
    raw, composite = tmp_path / 'raw', tmp_path / 'composite'
    raw.mkdir()
    composite.mkdir()
    for i in range(3):
        cv2.imwrite(str(raw / f'{i:06d}.png'), mask)
        cv2.imwrite(str(composite / f'{i:06d}.png'), mask)
    source, native = tmp_path / 'source.mp4', tmp_path / 'native.mp4'
    _write_video(source, 360, 256, 24000 / 1001, [original] * 3)
    _write_video(native, 360, 256, 24000 / 1001, [rebuilt] * 3)
    return source, native, raw, composite, mask


def test_scene_wrapper_preserves_timing_and_protection_and_cleans_temporary_files(tmp_path):
    source, native, raw, composite, mask = fixture(tmp_path)
    regions = [{'kind': 'rect', 'x': 0, 'y': 0, 'w': 1, 'h': 1, 'role': 'remove'},
               {'kind': 'rect', 'x': .4, 'y': .4, 'w': .1, 'h': .1, 'role': 'protect', 'to': .05}]
    with patch('app.services.subtitle_junctions.frame_text_mask', return_value=mask):
        report = refine_subtitle_scene(source, native, raw, composite, tmp_path / 'result', probe(str(source)), regions)
    assert len(report['frame_reports']) == 3
    for name in ('mask-master.mp4', 'reference-master.mp4'):
        p = tmp_path / 'result' / name
        assert probe(str(p)) == probe(str(source))
        for i, (a, b) in enumerate(zip(read_frames(str(source)), read_frames(str(p)))):
            np.testing.assert_array_equal(a[mask == 0], b[mask == 0])
            if i == 0:
                np.testing.assert_array_equal(a[105:120, 148:172], b[105:120, 148:172])
    assert not list((tmp_path / 'result').glob('junctions-*'))


def test_cancelled_or_incomplete_scene_never_writes_successful_master(tmp_path):
    source, native, raw, composite, _ = fixture(tmp_path)
    flag = tmp_path / 'cancel'
    flag.touch()
    regions = [{'x': 0, 'y': 0, 'w': 1, 'h': 1}]
    with pytest.raises(RuntimeError, match='cancelado'):
        refine_subtitle_scene(source, native, raw, composite, tmp_path / 'cancelled', probe(str(source)), regions, cancel_file=str(flag))
    assert not list((tmp_path / 'cancelled').glob('*.mp4'))
    (raw / '000001.png').unlink()
    with pytest.raises(ValueError, match='sequence'):
        refine_subtitle_scene(source, native, raw, composite, tmp_path / 'missing', probe(str(source)), regions)
    assert not list((tmp_path / 'missing').glob('*.mp4'))
