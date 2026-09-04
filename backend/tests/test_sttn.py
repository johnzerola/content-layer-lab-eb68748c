import numpy as np

from app.providers.sttn_provider import SttnProvider


def test_sem_pesos_nao_quebra():
    provider = SttnProvider(model_path="")
    assert provider.available() is False
    status = provider.status()
    assert status["ready"] is False


def test_passthrough_quando_indisponivel():
    provider = SttnProvider(model_path="")
    frames = np.zeros((6, 64, 64, 3), np.uint8)
    masks = np.zeros((6, 64, 64), np.uint8)
    masks[:, 10:20, 10:40] = 255
    out = provider.reconstruct(frames, masks)
    assert np.array_equal(out, frames)


def test_mascara_vazia_retorna_original():
    provider = SttnProvider(model_path="")
    frames = np.full((3, 32, 32, 3), 7, np.uint8)
    masks = np.zeros((3, 32, 32), np.uint8)
    assert np.array_equal(provider.reconstruct(frames, masks), frames)
