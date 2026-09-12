import importlib.util
from pathlib import Path

MODULE = Path(__file__).parents[1] / "experiments" / "phase5_validate.py"
spec = importlib.util.spec_from_file_location("phase5_validate", MODULE)
phase5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(phase5)


def test_required_categories_are_the_ten_quality_cases():
    assert phase5.REQUIRED_CATEGORIES == {
        "cloth", "straight-lines", "skin-face", "hair", "motion", "low-light",
        "simple-subtitle", "neon", "shadow", "transition",
    }


def test_review_contract_has_all_quality_failures():
    assert phase5.SCORE_FIELDS == (
        "residual", "blur", "flicker", "ghosting", "texture", "geometry", "preservation"
    )


def test_required_categories_count_independent_failures_once():
    assert len(phase5.REQUIRED_CATEGORIES) == 10
    assert len(set(phase5.SCORE_FIELDS)) == 7
