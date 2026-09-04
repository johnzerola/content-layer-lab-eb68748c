"""STTN — inpainting temporal leve (ONNX Runtime), motor rápido para faixas largas.

Onde entra: quando o TBE não fecha o chunk e a máscara é grande demais para o
LaMa (faixa de legenda cheia, karaokê), o LaMa fica caro e devolve chapa. O STTN
olha várias frames de uma vez e preenche o buraco usando atenção temporal —
mais barato que ProPainter/DiffuEraser e sem restrição de licença (Apache-2.0).

Pesos: exportação ONNX do STTN (`sttn.onnx`), caminho por `CLEANER_STTN_ONNX`
ou `CLEANER_MODELS_DIR/sttn.onnx`. Sem pesos, `available()` é False e o pipeline
segue no caminho atual — nada quebra.
"""
from __future__ import annotations

import os
from typing import Optional

import cv2
import numpy as np

from . import register

_FILE = "sttn.onnx"
_W, _H = 432, 240          # resolução nativa típica do STTN
_REF_STRIDE = 5            # espaçamento das frames de referência
_MAX_REFS = 8              # teto de referências por inferência (custo CPU)


def models_dir() -> str:
    path = os.getenv("CLEANER_MODELS_DIR") or os.path.expanduser("~/.cache/vaiviral/models")
    os.makedirs(path, exist_ok=True)
    return path


def resolve_model_path() -> str:
    explicit = os.getenv("CLEANER_STTN_ONNX", "")
    if explicit:
        return explicit
    local = os.path.join(models_dir(), _FILE)
    return local if os.path.exists(local) else ""


class SttnProvider:
    name = "sttn"

    def __init__(self, model_path: Optional[str] = None) -> None:
        self.model_path = model_path if model_path is not None else resolve_model_path()
        self._session = None
        self._tried = False
        self._names: tuple[str, str, str] | None = None

    def _load(self):
        if self._tried:
            return self._session
        self._tried = True
        if not self.model_path or not os.path.exists(self.model_path):
            return None
        try:
            import onnxruntime as ort  # type: ignore
        except Exception as exc:  # pragma: no cover
            print(f"[sttn] onnxruntime indisponível ({exc})")
            return None
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(os.getenv("CLEANER_STTN_THREADS", "0")) or (os.cpu_count() or 4)
        try:
            session = ort.InferenceSession(
                self.model_path, sess_options=options, providers=["CPUExecutionProvider"]
            )
        except Exception as exc:  # pragma: no cover
            print(f"[sttn] falha ao carregar modelo ({exc})")
            return None
        inputs = session.get_inputs()
        if len(inputs) < 2:
            print("[sttn] modelo com entradas inesperadas; ignorando")
            return None
        self._names = (inputs[0].name, inputs[1].name, session.get_outputs()[0].name)
        self._session = session
        return session

    def available(self) -> bool:
        return self._load() is not None

    def status(self) -> dict:
        return {
            "ready": self.available(),
            "model": os.path.basename(self.model_path) if self.model_path else None,
            "input": [_W, _H],
        }

    # ------------------------------------------------------------------ API
    def reconstruct(self, frames: np.ndarray, masks: np.ndarray) -> np.ndarray:
        """Preenche o buraco olhando frames vizinhas; fora da máscara não toca."""
        session = self._load()
        frames = np.asarray(frames)
        masks = np.asarray(masks)
        if session is None or len(frames) == 0 or masks.max() == 0:
            return frames
        height, width = frames.shape[1:3]
        idx = list(range(0, len(frames), _REF_STRIDE))[:_MAX_REFS] or [0]

        small = np.stack([cv2.resize(frames[i], (_W, _H)) for i in idx]).astype(np.float32)
        small_m = np.stack(
            [cv2.resize(masks[i], (_W, _H), interpolation=cv2.INTER_NEAREST) for i in idx]
        ).astype(np.float32)
        small_m = (small_m > 0).astype(np.float32)[:, None, :, :]
        tensor = (small / 127.5 - 1.0).transpose(0, 3, 1, 2)
        tensor = tensor * (1.0 - small_m)

        try:
            assert self._names is not None
            out = session.run([self._names[2]], {self._names[0]: tensor, self._names[1]: small_m})[0]
        except Exception as exc:  # pragma: no cover
            print(f"[sttn] inferência falhou ({exc})")
            return frames

        filled = ((np.clip(out.transpose(0, 2, 3, 1), -1.0, 1.0) + 1.0) * 127.5).astype(np.uint8)
        result = frames.copy()
        for slot, source in enumerate(idx):
            plate = cv2.resize(filled[slot], (width, height))
            # Cada referência cobre o intervalo até a próxima: propaga o mesmo
            # fundo reconstruído, mantendo tudo fora da máscara intacto.
            stop = idx[slot + 1] if slot + 1 < len(idx) else len(frames)
            for f in range(source, stop):
                hole = masks[f] > 0
                if not hole.any():
                    continue
                result[f][hole] = plate[hole]
        return result


register("temporal", SttnProvider.name, SttnProvider())
