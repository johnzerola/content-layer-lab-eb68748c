"""Immutable contract for the Cleaner Golden V4 candidate.

Changes to this file require a new named candidate and a new validation run.
"""

GOLDEN_V4 = {
    "name": "CLEANER_GOLDEN_V4",
    "pipeline_revision": "scene-roi-v4",
    "profile_contract": "legacy_refined_b2_v1",
    "quality_profile": "legacy_refined",
    "engine": "diffueraser",
    "selected_engine": "diffueraser-official",
    "preset": "max",
    "mode": "subtitle",
    "options": {
        "dynamic": True,
        "key_step": 1,
        "verify": True,
        "selective_second_pass": False,
        "protect_subject": False,
        "enhance": False,
        "strategy": "inpaint",
    },
    "subtitle_policy": "scene-local-dual-subtitle-masks-v1",
    "subtitle_junctions": "subtitle-junctions-v1",
    "subtitle_lane_min_width": 0.58,
    "subtitle_lane_min_height": 0.052,
    "region_grow": 0.008,
    "diffueraser": {
        "max_side": 960,
        "mask_dilation": 4,
        "ref_stride": 5,
        "neighbor_length": 12,
        "subvideo_length": 50,
    },
    "composition": {
        "selective": True,
        "outside_selection_source": "original",
        "master_codec": "libx264rgb",
        "master_crf": 0,
        "master_pixel_format": "gbrp",
    },
    "delivery": {
        "codec": "libx264",
        "crf": 16,
        "pixel_format": "yuv420p",
        "audio": "stream_copy_when_compatible",
    },
    "code_commit": "5fa3a4875d525b31d871a81d0e3d6e8661fb7f86",
    "docker_image": "docker.io/nivaldo12/leaneria-runpod@sha256:5e7ac6bd84854b7f863714156f6f75f61ab8e0c614078c1401a354f7016c4370",
}


def golden_v4_payload_options():
    """Return a fresh request options object for Golden V4."""
    return {
        **GOLDEN_V4["options"],
        "quality_profile": GOLDEN_V4["quality_profile"],
        "engine": GOLDEN_V4["engine"],
    }
