import importlib.util
import copy
from pathlib import Path

import numpy as np
import pytest

spec=importlib.util.spec_from_file_location('phase4_restore',Path(__file__).parents[1]/'experiments/phase4_restore.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_restoration_keeps_layout_and_bounds_colour_change():
    rng=np.random.default_rng(9)
    source=rng.integers(0,256,(64,80,3),dtype=np.uint8)
    before=source.copy()
    candidate=np.full((32,40,3),255,dtype=np.uint8)
    out=module.mix_roi(source,candidate,(20,16,40,32),.5)
    outside=np.ones((64,80),bool);outside[16:48,20:60]=False
    assert np.array_equal(out[outside],source[outside])
    assert np.array_equal(source,before)
    assert np.abs(out.astype(int)-source.astype(int)).max()<=12
    assert np.array_equal(out[16,20:60],source[16,20:60])
    assert np.any(out[24:40,28:52]!=source[24:40,28:52])


def test_identical_candidate_introduces_no_texture():
    source=np.full((48,48,3),77,np.uint8)
    assert np.array_equal(module.mix_roi(source,source[8:40,8:40],(8,8,32,32)),source)


def test_geometry_rejected_instead_of_resizing_silently():
    with pytest.raises(ValueError):
        module.mix_roi(np.zeros((64,64,3),np.uint8),np.zeros((31,32,3),np.uint8),(8,8,32,32))


def delivery_probe():
    return {'streams': [
        {'codec_type': 'video', 'width': 1080, 'height': 1920,
         'nb_read_frames': '43', 'avg_frame_rate': '30/1', 'duration': '1.433333'},
        {'codec_type': 'audio', 'codec_name': 'aac', 'sample_rate': '48000', 'channels': 2}]}


@pytest.mark.parametrize('field,value', [('width', 720), ('nb_read_frames', '42'),
    ('avg_frame_rate', '25/1'), ('duration', '1.4')])
def test_delivery_rejects_changed_timing_and_geometry(field, value):
    source = delivery_probe()
    candidate = copy.deepcopy(source)
    candidate['streams'][0][field] = value
    with pytest.raises(ValueError):
        module.validate_delivery(source, candidate)


def test_delivery_preserves_audio_and_accepts_equivalent_fps():
    source = delivery_probe()
    candidate = copy.deepcopy(source)
    candidate['streams'][0]['avg_frame_rate'] = '30000/1000'
    module.validate_delivery(source, candidate)
    candidate['streams'].pop()
    with pytest.raises(ValueError, match='audio presence'):
        module.validate_delivery(source, candidate)
