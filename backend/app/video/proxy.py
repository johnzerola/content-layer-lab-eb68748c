"""Master preservado + proxy de análise.

Regra do motor: o arquivo original NUNCA é sobrescrito. Toda a detecção cara
(OCR, varredura de zona de legenda, estatística temporal) roda num proxy leve,
e a máscara resultante é remapeada para o master em resolução total antes da
reconstrução. Assim o usuário recebe 1080p de verdade, sem o ciclo
"reduzir tudo -> processar tudo -> ampliar tudo" que destrói detalhe.
"""
from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass

import cv2
import numpy as np

from ..utils.video import Probe, probe

DEFAULT_PROXY_WIDTH = 540


@dataclass
class Proxy:
    """Cópia reduzida usada só para análise."""

    path: str
    width: int
    height: int
    scale: float  # proxy / master
    master: Probe

    @property
    def is_passthrough(self) -> bool:
        return self.scale >= 0.999


def build_proxy(
    source: str,
    workdir: str,
    target_width: int = DEFAULT_PROXY_WIDTH,
    master: Probe | None = None,
) -> Proxy:
    """Gera (ou reaproveita) o proxy de análise ao lado do master."""
    info = master or probe(source)
    os.makedirs(workdir, exist_ok=True)

    if info.width <= target_width:
        return Proxy(source, info.width, info.height, 1.0, info)

    scale = target_width / float(info.width)
    width = target_width - (target_width % 2)
    height = int(round(info.height * scale))
    height -= height % 2
    dest = os.path.join(workdir, f"proxy_{width}x{height}.mp4")

    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-i", source,
                "-an", "-vf", f"scale={width}:{height}:flags=area",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-pix_fmt", "yuv420p", dest,
            ],
            check=True,
        )
    return Proxy(dest, width, height, width / float(info.width), info)


def mask_to_master(mask: np.ndarray, master_width: int, master_height: int) -> np.ndarray:
    """Sobe uma máscara do espaço do proxy para o master sem perder cobertura.

    Interpolação linear + limiar baixo faz a máscara crescer meio pixel em vez
    de encolher — encolher deixaria borda de legenda para trás.
    """
    if mask.shape[0] == master_height and mask.shape[1] == master_width:
        return mask
    up = cv2.resize(mask, (master_width, master_height), interpolation=cv2.INTER_LINEAR)
    return np.where(up > 24, 255, 0).astype(np.uint8)


def box_to_master(box: tuple[int, int, int, int], scale: float) -> tuple[int, int, int, int]:
    """Converte (x, y, w, h) do proxy para o master."""
    factor = 1.0 / max(scale, 1e-6)
    x, y, w, h = box
    return (
        int(round(x * factor)),
        int(round(y * factor)),
        int(round(w * factor)),
        int(round(h * factor)),
    )
