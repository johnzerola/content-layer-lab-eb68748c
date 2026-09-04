"""Protect Area — o que o motor NÃO pode tocar.

Rosto, boca, logo do próprio cliente, placar de um jogo, mão sobre o objeto:
sempre que a máscara de remoção invade uma dessas áreas, o inpainting inventa
pixel em cima do sujeito e o resultado "derrete". A Protect Area resolve isso
por subtração: a máscara final é `remoção - proteção`.

Regiões são declaradas em percentual do frame (independem de resolução) e
podem ter janela de tempo:

    {"shape": "rect",    "x": .1, "y": .6, "w": .3, "h": .2}
    {"shape": "ellipse", "x": .4, "y": .1, "w": .2, "h": .25, "from": 0, "to": 4.5}
    {"shape": "poly",    "points": [[.1,.1],[.4,.2],[.2,.5]]}

Além das regiões manuais, existe a proteção automática de pessoa/rosto, que
reaproveita o detector já usado pelo motor de legendas.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Sequence

import cv2
import numpy as np


@dataclass(frozen=True)
class ProtectRegion:
    shape: str = "rect"
    x: float = 0.0
    y: float = 0.0
    w: float = 0.0
    h: float = 0.0
    points: tuple = ()
    start: float = 0.0            # segundos; 0 = desde o início
    end: float = float("inf")     # segundos; inf = até o fim

    def active_at(self, seconds: float) -> bool:
        return self.start <= seconds <= self.end

    def draw(self, canvas: np.ndarray) -> None:
        height, width = canvas.shape[:2]
        if self.shape == "poly" and self.points:
            pts = np.asarray(
                [[int(round(px * width)), int(round(py * height))] for px, py in self.points],
                np.int32,
            )
            if len(pts) >= 3:
                cv2.fillPoly(canvas, [pts], 255)
            return
        x = int(round(self.x * width))
        y = int(round(self.y * height))
        w = max(1, int(round(self.w * width)))
        h = max(1, int(round(self.h * height)))
        if self.shape == "ellipse":
            cv2.ellipse(canvas, (x + w // 2, y + h // 2), (max(1, w // 2), max(1, h // 2)),
                        0, 0, 360, 255, -1)
        else:
            cv2.rectangle(canvas, (x, y), (x + w, y + h), 255, -1)


def parse_region(raw) -> Optional[ProtectRegion]:
    """Aceita dict do app ou string da CLI (`x,y,w,h[,inicio,fim]`)."""
    if isinstance(raw, ProtectRegion):
        return raw
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        shape = "rect"
        if parts and parts[0] in ("rect", "ellipse"):
            shape = parts.pop(0)
        try:
            values = [float(p) for p in parts]
        except ValueError:
            return None
        if len(values) < 4:
            return None
        start = values[4] if len(values) > 4 else 0.0
        end = values[5] if len(values) > 5 else float("inf")
        return ProtectRegion(shape, values[0], values[1], values[2], values[3], (), start, end)
    if isinstance(raw, dict):
        points = tuple(tuple(float(v) for v in p) for p in raw.get("points", ()) or ())
        return ProtectRegion(
            shape=str(raw.get("shape", "rect")),
            x=float(raw.get("x", 0.0)),
            y=float(raw.get("y", 0.0)),
            w=float(raw.get("w", 0.0)),
            h=float(raw.get("h", 0.0)),
            points=points,
            start=float(raw.get("from", raw.get("start", 0.0)) or 0.0),
            end=float(raw.get("to", raw.get("end", float("inf"))) or float("inf")),
        )
    return None


@dataclass
class ProtectMap:
    """Conjunto de áreas protegidas de um job."""

    regions: List[ProtectRegion] = field(default_factory=list)
    protect_person: bool = False
    feather_px: int = 9

    @classmethod
    def build(cls, raw_regions: Sequence, protect_person: bool = False, feather_px: int = 9) -> "ProtectMap":
        regions = [r for r in (parse_region(item) for item in (raw_regions or [])) if r is not None]
        return cls(regions, bool(protect_person), max(0, int(feather_px)))

    @property
    def active(self) -> bool:
        return bool(self.regions) or self.protect_person

    def frame_mask(self, width: int, height: int, seconds: float) -> np.ndarray:
        """Máscara de proteção manual, em pixels do frame inteiro."""
        canvas = np.zeros((height, width), np.uint8)
        for region in self.regions:
            if region.active_at(seconds):
                region.draw(canvas)
        return canvas

    def person_mask(self, frames: Sequence[np.ndarray], step: int = 6) -> Optional[np.ndarray]:
        """Proteção automática de pessoa/rosto para uma janela de frames."""
        if not self.protect_person or not len(frames):
            return None
        from ..services.protect import sampled_protect_mask

        return sampled_protect_mask(list(frames), step=step)

    def subtract(self, mask: np.ndarray, protection: Optional[np.ndarray]) -> np.ndarray:
        """Remove da máscara de limpeza tudo que está protegido, com borda suave.

        A borda suave importa: corte duro na fronteira deixa um degrau visível
        entre o pixel reconstruído e o pixel preservado.
        """
        if protection is None or protection.max() == 0 or mask.max() == 0:
            return mask
        if protection.shape[:2] != mask.shape[:2]:
            protection = cv2.resize(protection, (mask.shape[1], mask.shape[0]),
                                    interpolation=cv2.INTER_NEAREST)
        soft = protection.astype(np.float32) / 255.0
        if self.feather_px > 0:
            soft = cv2.GaussianBlur(soft, (0, 0), max(1.0, self.feather_px / 2.0))
        keep = np.clip(1.0 - soft, 0.0, 1.0)
        return (mask.astype(np.float32) * keep).astype(np.uint8)

    def as_dict(self) -> dict:
        return {
            "regions": [
                {
                    "shape": r.shape, "x": r.x, "y": r.y, "w": r.w, "h": r.h,
                    "points": [list(p) for p in r.points],
                    "from": r.start, "to": None if r.end == float("inf") else r.end,
                }
                for r in self.regions
            ],
            "protect_person": self.protect_person,
            "feather_px": self.feather_px,
        }
