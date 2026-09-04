"""Testes rápidos do Clean Engine (sem GPU, sem rede)."""
from __future__ import annotations

import numpy as np
import pytest

from app.quality.scoring import quality_score
from app.video.roi import Roi
from app.providers.temporal_provider import TemporalProvider


def _frame(color: int = 120) -> np.ndarray:
    img = np.full((256, 256, 3), color, np.uint8)
    img[:, ::8] = 200  # textura
    return img


def test_score_perfeito_sem_mascara() -> None:
    frames = [_frame() for _ in range(6)]
    masks = np.zeros((6, 256, 256), np.uint8)
    report = quality_score(frames, masks)
    assert report.score == 100.0
    assert report.route == "done"


def test_score_penaliza_texto_residual() -> None:
    frames = []
    masks = np.zeros((6, 256, 256), np.uint8)
    masks[:, 100:140, 60:200] = 255
    for _ in range(6):
        f = _frame()
        for x in range(70, 190, 6):  # traços finos: assinatura de texto residual
            f[110:130, x:x + 3] = 255
        frames.append(f)
    report = quality_score(frames, masks)
    assert report.score < 100.0, report.metrics
    assert report.metrics["texture_gap"] > 0.0


def test_roi_crop_e_paste_preservam_fora_da_area() -> None:
    roi = Roi(26, 154, 204, 51)
    frame = _frame()
    crop = roi.crop(frame)
    assert crop.shape[0] > 0 and crop.shape[1] > 0
    merged = roi.paste(frame.copy(), np.zeros_like(crop), feather=0)
    assert np.array_equal(merged[:10], frame[:10])


def test_temporal_reconstroi_apenas_sob_a_mascara() -> None:
    frames = np.stack([_frame() for _ in range(8)])
    masks = np.zeros((8, 256, 256), np.uint8)
    masks[:, 100:120, 60:200] = 255
    frames[:, 100:120, 60:200] = 255
    out = TemporalProvider(8, 3).reconstruct(frames, masks)
    assert np.asarray(out).shape == frames.shape
    assert np.abs(np.asarray(out)[0, :50].astype(int) - frames[0, :50].astype(int)).max() <= 2


def test_protect_area_preserva_o_que_esta_protegido() -> None:
    from app.video.protect import ProtectMap

    protect = ProtectMap.build(["0.0,0.5,1.0,0.5"], feather_px=0)
    assert protect.active
    guard = protect.frame_mask(200, 200, seconds=0.0)
    mask = np.full((200, 200), 255, np.uint8)
    out = protect.subtract(mask, guard)
    assert out[:90].min() == 255      # fora da proteção, remoção continua
    assert out[110:].max() == 0       # dentro da proteção, nada é tocado


def test_protect_area_respeita_janela_de_tempo() -> None:
    from app.video.protect import ProtectMap

    protect = ProtectMap.build([{"x": 0, "y": 0, "w": 1, "h": 1, "from": 2.0, "to": 4.0}])
    assert protect.frame_mask(50, 50, seconds=1.0).max() == 0
    assert protect.frame_mask(50, 50, seconds=3.0).max() == 255


def test_selecao_de_objeto_gera_roi_e_prompt_em_pixels() -> None:
    from app.pipelines.object_pipeline import Selection

    sel = Selection.from_dict({"boxes": [[0.25, 0.25, 0.2, 0.2]], "points": [[0.3, 0.3, 1]]})
    bbox = sel.bbox_percent(margin=0.05)
    assert bbox is not None and bbox[0] >= 0.0 and bbox[2] <= 1.0
    prompt = sel.to_pixels(1000, 1000, offset_x=100, offset_y=100)
    assert prompt["boxes"][0] == (150, 150, 200, 200)
    assert prompt["points"][0] == (200, 200, 1)


def test_mascara_de_objeto_cobre_o_objeto_e_nao_o_frame() -> None:
    from app.pipelines.object_pipeline import ObjectMaskStats, build_object_masks
    from app.providers.sam2_provider import Sam2Provider

    frames = []
    for _ in range(6):
        f = np.full((180, 180, 3), 40, np.uint8)
        f[60:120, 60:120] = (200, 60, 60)   # objeto
        frames.append(f)
    stats = ObjectMaskStats()
    masks = build_object_masks(
        frames, Sam2Provider(), {"boxes": [(55, 55, 70, 70)], "points": []},
        key_step=3, expand_px=2, stats=stats,
    )
    assert masks.shape == (6, 180, 180)
    assert masks[0][80, 80] == 255          # pegou o objeto
    assert masks[0][10, 10] == 0            # não pegou o frame inteiro
    assert stats.segmentations >= 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
