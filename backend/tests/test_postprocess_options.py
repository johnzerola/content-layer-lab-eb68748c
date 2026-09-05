from types import SimpleNamespace

from app.workers.tasks import _enhance_filter


def test_explicit_false_disables_enhancement():
    info = SimpleNamespace(width=1080, height=1920)
    assert _enhance_filter(info, {"enhance": False}) == ""


def test_off_mode_disables_enhancement():
    info = SimpleNamespace(width=1080, height=1920)
    assert _enhance_filter(info, {"enhance": {"mode": "off"}}) == ""


def test_hq_mode_keeps_sharpening_filter():
    info = SimpleNamespace(width=1080, height=1920)
    assert _enhance_filter(info, {"enhance": {"mode": "hq", "scale": 1}}).startswith("unsharp=")
