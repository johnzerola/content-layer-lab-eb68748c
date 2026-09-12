import json
from pathlib import Path

from app.engines.diffueraser_official import build_diffueraser_command
from app.golden_v4 import GOLDEN_V4, golden_v4_payload_options


def test_cleaner_golden_v4_contract_is_frozen(monkeypatch, tmp_path):
    monkeypatch.setenv("DIFFUERASER_ROOT", str(tmp_path))
    monkeypatch.setenv("DIFFUERASER_MODELS_ROOT", str(tmp_path))
    monkeypatch.setenv("DIFFUERASER_MAX_SIDE", "960")
    command = build_diffueraser_command("input.mp4", "mask.mp4", "output", 5)

    assert GOLDEN_V4["pipeline_revision"] == "scene-roi-v4"
    assert GOLDEN_V4["profile_contract"] == "legacy_refined_b2_v1"
    assert GOLDEN_V4["subtitle_policy"] == "scene-local-dual-subtitle-masks-v1"
    assert GOLDEN_V4["subtitle_junctions"] == "subtitle-junctions-v1"
    assert (GOLDEN_V4["subtitle_lane_min_width"],
            GOLDEN_V4["subtitle_lane_min_height"],
            GOLDEN_V4["region_grow"]) == (0.58, 0.052, 0.008)
    assert golden_v4_payload_options() == {
        "dynamic": True, "key_step": 1, "verify": True,
        "selective_second_pass": False, "protect_subject": False,
        "enhance": False, "strategy": "inpaint",
        "quality_profile": "legacy_refined", "engine": "diffueraser",
    }
    for flag, expected in {
        "--max_img_size": "960", "--mask_dilation_iter": "4",
        "--ref_stride": "5", "--neighbor_length": "12",
        "--subvideo_length": "50",
    }.items():
        assert command[command.index(flag) + 1] == expected
    assert GOLDEN_V4["composition"]["outside_selection_source"] == "original"
    assert GOLDEN_V4["delivery"] == {
        "codec": "libx264", "crf": 16, "pixel_format": "yuv420p",
        "audio": "stream_copy_when_compatible",
    }
    assert GOLDEN_V4["code_commit"] == "5fa3a4875d525b31d871a81d0e3d6e8661fb7f86"
    assert GOLDEN_V4["docker_image"].endswith(
        "@sha256:5e7ac6bd84854b7f863714156f6f75f61ab8e0c614078c1401a354f7016c4370"
    )


def test_cleaner_golden_v4_approved_smoke_fixture():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "cleaner_golden_v4.json")
                         .read_text(encoding="utf-8"))
    assert fixture["name"] == GOLDEN_V4["name"]
    assert (fixture["width"], fixture["height"], fixture["fps"], fixture["frames"]) == (
        1080, 1920, "30/1", 150)
    assert fixture["old_neon_green_pixels"] > 0
    assert fixture["old_neon_green_frames"] > 0
    assert fixture["golden_neon_green_pixels"] == 0
    assert fixture["golden_neon_green_frames"] == 0
    assert fixture["outside_selection_altered_pixels"] == 0
    assert fixture["outside_selection_max_channel_delta"] == 0
    assert fixture["input_sha256"] == "ac3220aa3b4bcf92332a06cb42412477df1f438fbcb22127db17137deb1fe9b9"
    assert fixture["output_sha256"] == "1c43367d61626f79066c0c4f3b0088e49b69ce83edb16d8be3194241d8249f51"
