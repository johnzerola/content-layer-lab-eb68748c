"""Pós-passe de harmonização: grão e nitidez da área reconstruída.

O inpainting (TBE ou LaMa) devolve um trecho *limpo demais*: sem grão de
sensor, sem ruído de compressão e mais liso que a vizinhança. Isso é
exatamente o que o olho lê como "mancha", mesmo sem texto residual.

Este módulo não reconstrói nada — apenas aproxima três estatísticas locais
da área tratada às do anel de fundo ao redor dela:

1. **luminância/cor**: casa média e desvio por canal (corrige clareamento);
2. **nitidez**: unsharp proporcional ao déficit de detalhe medido;
3. **grão**: ruído gaussiano correlacionado ao nível de ruído do anel.

Tudo aplicado só dentro da máscara suavizada, então fora dela o pixel
original permanece intocado. Roda em CPU, custo de poucos ms por frame.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Sequence

import cv2
import numpy as np


@dataclass
class HarmonizeStats:
    frames: int = 0
    applied: int = 0
    detail_gain: float = 0.0
    grain_added: float = 0.0

    def as_dict(self) -> Dict[str, float]:
        n = max(1, self.applied)
        return {
            "harmonize_frames": self.applied,
            "harmonize_detail_gain": round(self.detail_gain / n, 4),
            "harmonize_grain": round(self.grain_added / n, 4),
        }


def _ring(mask: np.ndarray, width: int) -> np.ndarray:
    """Anel de fundo real ao redor da máscara (referência estatística)."""
    k = max(3, width | 1)
    outer = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    inner = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    return cv2.subtract(outer, inner)


def _detail(gray: np.ndarray, sel: np.ndarray) -> float:
    if not sel.any():
        return 0.0
    lap = cv2.Laplacian(gray, cv2.CV_32F, ksize=3)
    return float(np.sqrt(np.mean(lap[sel] ** 2)))


def _noise(gray: np.ndarray, sel: np.ndarray) -> float:
    """Nível de ruído de alta frequência (grão), isolado da estrutura."""
    if not sel.any():
        return 0.0
    hp = gray.astype(np.float32) - cv2.GaussianBlur(gray.astype(np.float32), (0, 0), 1.1)
    return float(np.std(hp[sel]))


def harmonize_frame(
    frame: np.ndarray,
    mask: np.ndarray,
    *,
    ring_px: int = 41,
    max_sharpen: float = 0.9,
    grain: bool = True,
    rng: np.random.Generator | None = None,
    stats: HarmonizeStats | None = None,
) -> np.ndarray:
    """Aproxima estatísticas locais da área mascarada às do anel externo."""
    if mask is None or mask.max() == 0:
        return frame
    ring = _ring(mask, ring_px)
    sel_in = mask > 0
    sel_ring = ring > 0
    if not sel_ring.any() or int(sel_in.sum()) < 32:
        return frame

    out = frame.astype(np.float32)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # 1) cor/luminância — corrige o clareamento típico do preenchimento.
    for c in range(3):
        ch = out[..., c]
        m_in, s_in = float(ch[sel_in].mean()), float(ch[sel_in].std()) + 1e-3
        m_rg, s_rg = float(ch[sel_ring].mean()), float(ch[sel_ring].std()) + 1e-3
        gain = float(np.clip(s_rg / s_in, 0.85, 1.18))
        shift = float(np.clip(m_rg - m_in, -10.0, 10.0)) * 0.6
        ch[sel_in] = (ch[sel_in] - m_in) * gain + m_in + shift

    # 2) nitidez — unsharp proporcional ao déficit medido de detalhe.
    d_in = _detail(gray, sel_in)
    d_rg = _detail(gray, sel_ring)
    amount = 0.0
    if d_rg > 1e-3 and d_in < d_rg:
        amount = float(np.clip((d_rg / max(d_in, 1e-3)) - 1.0, 0.0, max_sharpen))
    if amount > 0.02:
        blur = cv2.GaussianBlur(out, (0, 0), 1.0)
        sharp = cv2.addWeighted(out, 1.0 + amount, blur, -amount, 0.0)
        out[sel_in] = sharp[sel_in]

    # 3) grão — ruído casado ao do anel, sem ultrapassá-lo.
    added = 0.0
    if grain:
        n_in = _noise(gray, sel_in)
        n_rg = _noise(gray, sel_ring)
        deficit = float(np.clip(n_rg - n_in, 0.0, 6.0))
        if deficit > 0.4:
            gen = rng or np.random.default_rng(1234)
            noise = gen.normal(0.0, deficit * 1.7, size=out.shape[:2]).astype(np.float32)
            noise = cv2.GaussianBlur(noise, (0, 0), 0.4)
            out[sel_in] += noise[sel_in][..., None] if out.ndim == 3 else noise[sel_in]
            added = deficit

    if stats is not None:
        stats.applied += 1
        stats.detail_gain += amount
        stats.grain_added += added

    # Borda suave: a transição para o fundo real não pode ter degrau.
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), 1.6)[..., None]
    soft = np.clip(soft, 0.0, 1.0)
    blended = out * soft + frame.astype(np.float32) * (1.0 - soft)
    return np.clip(blended, 0, 255).astype(np.uint8)


def harmonize_sequence(
    frames: Sequence[np.ndarray],
    masks: Sequence[np.ndarray],
    *,
    ring_px: int = 41,
    grain: bool = True,
    seed: int = 1234,
) -> tuple[List[np.ndarray], HarmonizeStats]:
    """Aplica a harmonização em todos os frames de um chunk."""
    stats = HarmonizeStats(frames=len(frames))
    rng = np.random.default_rng(seed)
    out: List[np.ndarray] = []
    for i, frame in enumerate(frames):
        mask = np.asarray(masks[i]) if i < len(masks) else None
        out.append(
            harmonize_frame(
                np.asarray(frame),
                mask,
                ring_px=ring_px,
                grain=grain,
                rng=rng,
                stats=stats,
            )
        )
    return out, stats
