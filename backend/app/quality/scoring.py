"""Score único de 0 a 100 para o resultado da limpeza.

Quatro perguntas objetivas, medidas só dentro da área reconstruída:

1. sobrou texto legível? (ghost text)
2. sobrou o contorno retangular da legenda? (borda fantasma)
3. a área ficou mais lisa que a vizinhança? (borrão)
4. a área treme entre frames? (flicker)

O roteador usa o score para decidir se conclui, se reprocessa com parâmetros
mais agressivos ou se manda para GPU — é isto que segura o custo.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Sequence

import cv2
import numpy as np

from ..services.verify import blur_ratio, residual_text, temporal_score


@dataclass
class QualityReport:
    score: float
    metrics: Dict[str, float] = field(default_factory=dict)
    route: str = "done"

    def as_dict(self) -> dict:
        return {"quality_score": round(self.score, 1), "route": self.route, **self.metrics}


def ghost_edge(frame: np.ndarray, mask: np.ndarray) -> float:
    """0..1 — quanto da borda da máscara ainda tem uma aresta forte.

    Uma legenda mal removida deixa o retângulo dela visível mesmo sem texto.
    """
    if mask.max() == 0:
        return 0.0
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    border = cv2.subtract(cv2.dilate(mask, kernel), cv2.erode(mask, kernel))
    if border.max() == 0:
        return 0.0
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 70, 180)
    sel = border > 0
    on_border = float((edges[sel] > 0).mean()) if sel.any() else 0.0
    ring = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 29)))
    outside = (ring > 0) & (cv2.dilate(mask, kernel) == 0)
    baseline = float((edges[outside] > 0).mean()) if outside.any() else 0.0
    return max(0.0, on_border - baseline)


def flicker(frames: Sequence[np.ndarray], masks: np.ndarray) -> float:
    """0..1 — oscilação da área reconstruída acima do movimento natural da cena."""
    if len(frames) < 3:
        return 0.0
    inside: List[float] = []
    outside: List[float] = []
    for i in range(1, len(frames)):
        area = masks[i] > 0
        if not area.any():
            continue
        prev = frames[i - 1].astype(np.float32)
        cur = frames[i].astype(np.float32)
        diff = np.abs(cur - prev).mean(axis=2)
        inside.append(float(diff[area].mean()) / 255.0)
        rest = ~area
        if rest.any():
            outside.append(float(diff[rest].mean()) / 255.0)
    if not inside:
        return 0.0
    base = float(np.mean(outside)) if outside else 0.0
    return max(0.0, float(np.mean(inside)) - base)


def texture_gap(frame: np.ndarray, mask: np.ndarray) -> float:
    """0..1 — quanto a textura interna difere do anel externo (mancha)."""
    if mask.max() == 0:
        return 0.0
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
    inside = mask > 0
    ring = (cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0) & ~inside
    if inside.sum() < 40 or ring.sum() < 40:
        return 0.0
    sin, sout = float(gray[inside].std()), float(gray[ring].std())
    if sout <= 1e-6:
        return 0.0
    return float(min(1.0, abs(sin - sout) / sout))


def quality_score(
    frames: Sequence[np.ndarray],
    masks: np.ndarray,
    step: int = 4,
) -> QualityReport:
    """Amostra a janela processada e devolve um score de 0 a 100."""
    texts: List[float] = []
    ghosts: List[float] = []
    blurs: List[float] = []
    textures: List[float] = []
    for i in range(0, len(frames), max(1, step)):
        if i >= len(masks) or masks[i].max() == 0:
            continue
        texts.append(residual_text(frames[i], masks[i]))
        ghosts.append(ghost_edge(frames[i], masks[i]))
        blurs.append(blur_ratio(frames[i], masks[i]))
        textures.append(texture_gap(frames[i], masks[i]))

    if not texts:
        return QualityReport(100.0, {"residual_text": 0.0}, "done")

    text = float(max(texts))
    ghost = float(max(ghosts))
    sharp = float(min(blurs))
    texture = float(np.mean(textures))
    flick = flicker(frames, masks)
    temporal = temporal_score(list(frames), masks)

    # Cada penalidade é limitada para que um único sinal ruidoso não zere o score.
    penalty = 0.0
    penalty += min(45.0, text * 450.0)          # texto residual é o pior defeito
    penalty += min(20.0, ghost * 80.0)          # contorno da legenda
    penalty += min(20.0, max(0.0, 0.85 - sharp) * 40.0)   # borrão
    penalty += min(10.0, texture * 20.0)        # mancha
    penalty += min(15.0, flick * 300.0)         # tremulação
    penalty += min(10.0, max(0.0, 0.85 - temporal) * 30.0)

    score = max(0.0, 100.0 - penalty)
    metrics = {
        "residual_text": round(text, 4),
        "ghost_edge": round(ghost, 4),
        "sharpness_ratio": round(sharp, 3),
        "texture_gap": round(texture, 3),
        "flicker": round(flick, 4),
        "temporal_consistency": round(temporal, 3),
    }
    return QualityReport(score, metrics, route_for_score(score))


def route_for_score(score: float) -> str:
    """>=90 conclui · 70-89 reprocessa/LaMa · <70 pede GPU."""
    if score >= 90.0:
        return "done"
    if score >= 70.0:
        return "retry"
    return "gpu"
