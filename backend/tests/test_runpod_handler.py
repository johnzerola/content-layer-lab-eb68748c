from app.services.chunking import localize_masks


def test_localize_masks_filters_and_offsets_timed_regions():
    masks = [
        {"id": "before", "from": 0, "to": 10},
        {"id": "active", "from": 14, "to": 18},
        {"id": "always", "kind": "rect"},
        {"id": "after", "from": 40, "to": 50},
    ]
    result = localize_masks(masks, offset=14.4, duration=16.2)

    assert [item["id"] for item in result] == ["active", "always"]
    assert result[0]["from"] == 0
    assert abs(result[0]["to"] - 3.6) < 1e-9
    assert "from" not in result[1]
