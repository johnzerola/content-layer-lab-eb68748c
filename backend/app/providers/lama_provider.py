"""LaMa (ONNX Runtime / OpenVINO) — reconstrução estrutural em CPU.

É o que evita o borrão: onde a exposição temporal não achou fundo real, o LaMa
recria estrutura (linhas, círculos, bordas) em vez de espalhar cor.

Entra apenas no recorte da máscara — nunca no frame inteiro — usando janelas
quadradas de contexto redimensionadas para a resolução nativa do modelo.

Modelo: big-lama exportado para ONNX (`Carve/LaMa-ONNX`, `lama_fp32.onnx`).
Caminho por `CLEANER_LAMA_ONNX`; se ausente e `CLEANER_LAMA_AUTODOWNLOAD=1`,
baixa uma vez para `CLEANER_MODELS_DIR` (padrão `~/.cache/vaiviral/models`).
Licença: Apache-2.0 (uso comercial permitido) — ver MODEL_LICENSES.md.
"""
from __future__ import annotations

import os
from typing import Optional

import cv2
import numpy as np

from . import register

_REPO = "Carve/LaMa-ONNX"
_FILE = "lama_fp32.onnx"
_DEFAULT_SIDE = 512
_CONTEXT = 2.2   # quanto de fundo limpo entra junto na janela
_STRIP_CONTEXT = 5.0  # altura mínima do tile em relação à faixa de legenda
_MAX_FILL = 0.30  # fração máxima do tile que pode ser máscara
_MAX_WINDOWS = 4  # regiões distintas por frame
_MAX_TILES = 12    # inferências por frame; acima disso o custo em CPU explode



def models_dir() -> str:
    path = os.getenv("CLEANER_MODELS_DIR") or os.path.expanduser("~/.cache/vaiviral/models")
    os.makedirs(path, exist_ok=True)
    return path


def resolve_model_path() -> str:
    explicit = os.getenv("CLEANER_LAMA_ONNX", "")
    if explicit:
        return explicit
    local = os.path.join(models_dir(), _FILE)
    if os.path.exists(local):
        return local
    if os.getenv("CLEANER_LAMA_AUTODOWNLOAD", "0") != "1":
        return ""
    try:
        from huggingface_hub import hf_hub_download  # type: ignore

        return hf_hub_download(_REPO, _FILE, local_dir=models_dir())
    except Exception as exc:  # pragma: no cover
        print(f"[lama] download automático falhou ({exc})")
        return ""


class LaMaProvider:
    name = "lama"

    def __init__(self, model_path: Optional[str] = None) -> None:
        self.model_path = model_path if model_path is not None else resolve_model_path()
        self._session = None
        self._tried = False
        self._names: tuple[str, str, str] | None = None
        self._side = _DEFAULT_SIDE

    def _load(self):
        if self._tried:
            return self._session
        self._tried = True
        if not self.model_path or not os.path.exists(self.model_path):
            return None
        try:
            import onnxruntime as ort  # type: ignore
        except Exception as exc:  # pragma: no cover
            print(f"[lama] onnxruntime indisponível ({exc})")
            return None
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(os.getenv("CLEANER_LAMA_THREADS", "0")) or (os.cpu_count() or 4)
        providers = ["CPUExecutionProvider"]
        if os.getenv("CLEANER_LAMA_OPENVINO", "0") == "1":
            providers.insert(0, "OpenVINOExecutionProvider")
        try:
            session = ort.InferenceSession(self.model_path, sess_options=options, providers=providers)
        except Exception as exc:  # pragma: no cover
            print(f"[lama] falha ao carregar modelo ({exc})")
            return None
        inputs = session.get_inputs()
        if len(inputs) < 2:
            print("[lama] modelo com entradas inesperadas; ignorando")
            return None
        shape = inputs[0].shape
        if isinstance(shape[-1], int) and shape[-1] > 0:
            self._side = int(shape[-1])
        self._names = (inputs[0].name, inputs[1].name, session.get_outputs()[0].name)
        self._session = session
        return session

    def available(self) -> bool:
        return self._load() is not None

    def status(self) -> dict:
        return {
            "ready": self.available(),
            "model": os.path.basename(self.model_path) if self.model_path else None,
            "input_side": self._side,
        }

    # ------------------------------------------------------------------ API
    def process(self, frame: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """Reconstrói o fundo apenas sob a máscara, janela por janela."""
        session = self._load()
        if session is None or mask is None or mask.max() == 0:
            return frame
        out = frame.copy()
        for window in self._windows(mask, frame.shape[1], frame.shape[0]):
            x0, y0, x1, y1 = window
            crop = out[y0:y1, x0:x1]
            hole = mask[y0:y1, x0:x1]
            if hole.max() == 0:
                continue
            filled = self._infer(crop, hole)
            if filled is None:
                continue
            alpha = _distance_alpha(hole)[..., None]
            out[y0:y1, x0:x1] = (
                crop.astype(np.float32) * (1.0 - alpha) + filled.astype(np.float32) * alpha
            ).astype(np.uint8)
        return out

    # -------------------------------------------------------------- interno
    def _windows(self, mask: np.ndarray, width: int, height: int) -> list[tuple[int, int, int, int]]:
        """Tiles quadrados COM contexto real de fundo ao redor da máscara.

        O bloco liso que o LaMa às vezes devolve vem de tile quase todo
        mascarado: sem fundo verdadeiro dentro da janela, o modelo não tem de
        onde tirar textura e inventa uma chapa. Por isso cada tile é dimensionado
        para que a máscara ocupe no máximo `_MAX_FILL` da sua área.
        """
        binary = (mask > 0).astype(np.uint8)
        count, _labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
        boxes: list[tuple[int, int, int, int]] = []
        for i in range(1, count):
            x, y, w, h, area = stats[i]
            if area < 12:
                continue
            boxes.append((int(x), int(y), int(x + w), int(y + h)))
        if not boxes:
            return []
        # Agrupar bastante: cada inferência custa caro, então poucas janelas grandes
        # rendem mais que muitas pequenas.
        boxes = _merge_boxes(boxes, gap=max(32, int(min(width, height) * 0.04)))
        boxes.sort(key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
        boxes = boxes[:_MAX_WINDOWS]

        limit = min(width, height)
        windows: list[tuple[int, int, int, int]] = []
        for x0, y0, x1, y1 in boxes:
            bw, bh = x1 - x0, y1 - y0
            # 1) contexto proporcional ao lado maior da região;
            side = int(max(bw, bh) * _CONTEXT)
            # 2) faixa de legenda é larga e baixa: o tile precisa ser alto o
            #    bastante para pegar fundo acima e abaixo dela, não só nas pontas;
            side = max(side, int(bh * _STRIP_CONTEXT))
            # 3) e grande o bastante para a máscara não dominar a janela.
            hole_area = float(binary[y0:y1, x0:x1].sum())
            if hole_area > 0:
                side = max(side, int(np.sqrt(hole_area / _MAX_FILL)))
            side = int(min(max(side, 160), limit))

            # Varredura horizontal/vertical com sobreposição, centrando a faixa
            # na janela para que o contexto fique dos dois lados da máscara.
            step = max(1, int(side * 0.6))
            xs = list(range(x0, max(x0, x1 - side) + 1, step)) or [x0]
            ys = list(range(y0, max(y0, y1 - side) + 1, step)) or [y0]
            for oy in ys:
                for ox in xs:
                    wx0 = int(min(max(0, ox - max(0, side - bw) // 2), max(0, width - side)))
                    wy0 = int(min(max(0, oy - max(0, side - bh) // 2), max(0, height - side)))
                    windows.append((wx0, wy0, min(width, wx0 + side), min(height, wy0 + side)))
        # Deduplica e limita o custo total por frame.
        unique = sorted(set(windows))
        if len(unique) <= _MAX_TILES:
            return unique
        # Amostra uniforme: truncar deixaria uma das pontas da faixa sem cobertura.
        idx = np.linspace(0, len(unique) - 1, _MAX_TILES).round().astype(int)
        return [unique[int(i)] for i in sorted(set(idx.tolist()))]




    def _infer(self, crop: np.ndarray, hole: np.ndarray) -> Optional[np.ndarray]:
        session, names = self._session, self._names
        if session is None or names is None:
            return None
        h, w = crop.shape[:2]
        side = self._side
        small = cv2.resize(crop, (side, side), interpolation=cv2.INTER_AREA)
        small_mask = cv2.resize((hole > 0).astype(np.uint8) * 255, (side, side), interpolation=cv2.INTER_NEAREST)
        # dilatar levemente na resolução do modelo evita halo de anti-aliasing
        small_mask = cv2.dilate(small_mask, np.ones((3, 3), np.uint8), iterations=1)
        image = cv2.cvtColor(small, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        image = np.transpose(image, (2, 0, 1))[None]
        mask_in = (small_mask > 0).astype(np.float32)[None, None]
        try:
            result = session.run([names[2]], {names[0]: image, names[1]: mask_in})[0]
        except Exception as exc:  # pragma: no cover
            print(f"[lama] inferência falhou ({exc})")
            return None
        out = np.squeeze(result)
        if out.ndim == 3 and out.shape[0] == 3:
            out = np.transpose(out, (1, 2, 0))
        out = np.clip(out if out.max() > 1.5 else out * 255.0, 0, 255).astype(np.uint8)
        out = cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
        return cv2.resize(out, (w, h), interpolation=cv2.INTER_LANCZOS4)


def _merge_boxes(boxes: list[tuple[int, int, int, int]], gap: int) -> list[tuple[int, int, int, int]]:
    merged = sorted(boxes)
    changed = True
    while changed:
        changed = False
        result: list[tuple[int, int, int, int]] = []
        for box in merged:
            placed = False
            for i, other in enumerate(result):
                if (
                    box[0] <= other[2] + gap and other[0] <= box[2] + gap
                    and box[1] <= other[3] + gap and other[1] <= box[3] + gap
                ):
                    result[i] = (
                        min(box[0], other[0]), min(box[1], other[1]),
                        max(box[2], other[2]), max(box[3], other[3]),
                    )
                    placed = True
                    changed = True
                    break
            if not placed:
                result.append(box)
        merged = result
    return merged




register("inpainting", LaMaProvider.name, LaMaProvider())
