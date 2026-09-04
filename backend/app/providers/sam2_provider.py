"""Segmentação de objetos — SAM2 (ONNX) com fallback CPU sem modelo.

O motor de limpeza precisa de uma máscara do objeto que o usuário apontou:
clicou num logo, num microfone, num transeunte. Isso é segmentação promptável,
não OCR — por isso entra como `SegmentationProvider` no registry.

Camadas, nesta ordem:

1. SAM2 exportado para ONNX (encoder + decoder). Licença Apache 2.0, roda em
   onnxruntime CPU; é o caminho de qualidade.
2. Fallback GrabCut: a partir da mesma caixa/ponto, separa objeto e fundo por
   modelo de cor + corte de grafo. Não é SAM, mas é honesto, roda em qualquer
   máquina e mantém a ferramenta utilizável sem baixar 400 MB de pesos.

Nunca devolvemos retângulo cheio como "máscara do objeto": o retângulo é
prompt, a máscara é o recorte real do objeto.
"""
from __future__ import annotations

import os
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np

Box = Tuple[int, int, int, int]
Point = Tuple[int, int, int]  # x, y, label (1 = objeto, 0 = fundo)

_ENCODER_ENV = "CLEANER_SAM2_ENCODER"
_DECODER_ENV = "CLEANER_SAM2_DECODER"


def _session(path: str):
    import onnxruntime as ort  # import tardio: ambiente sem ORT ainda usa fallback

    options = ort.SessionOptions()
    options.intra_op_num_threads = max(1, (os.cpu_count() or 4) // 2)
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(path, options, providers=["CPUExecutionProvider"])


class Sam2Provider:
    """SegmentationProvider: `segment(frame, hint) -> máscara uint8 0/255`.

    `hint` aceita:
        {"boxes": [(x, y, w, h), ...], "points": [(x, y, label), ...]}
    em pixels do frame recebido.
    """

    name = "sam2"

    def __init__(self, encoder: Optional[str] = None, decoder: Optional[str] = None) -> None:
        self.encoder_path = encoder or os.environ.get(_ENCODER_ENV) or ""
        self.decoder_path = decoder or os.environ.get(_DECODER_ENV) or ""
        self._encoder = None
        self._decoder = None
        self._tried = False
        self._input_size = 1024
        self.last_engine = "grabcut"

    # ------------------------------------------------------------------ setup
    def _load(self) -> bool:
        if self._tried:
            return self._decoder is not None
        self._tried = True
        if not (self.encoder_path and self.decoder_path):
            return False
        if not (os.path.exists(self.encoder_path) and os.path.exists(self.decoder_path)):
            print("[sam2] pesos ONNX não encontrados; usando fallback GrabCut")
            return False
        try:
            self._encoder = _session(self.encoder_path)
            self._decoder = _session(self.decoder_path)
            shape = self._encoder.get_inputs()[0].shape
            if isinstance(shape[-1], int) and shape[-1] > 0:
                self._input_size = int(shape[-1])
        except Exception as exc:  # pragma: no cover - depende do ambiente
            print(f"[sam2] falha ao carregar ONNX ({exc}); usando fallback GrabCut")
            self._encoder = self._decoder = None
            return False
        return True

    def available(self) -> bool:
        """Sempre disponível: com modelo (SAM2) ou sem modelo (GrabCut)."""
        return True

    def has_model(self) -> bool:
        return self._load()

    def status(self) -> dict:
        return {
            "engine": "sam2-onnx" if self.has_model() else "grabcut",
            "encoder": self.encoder_path or None,
            "decoder": self.decoder_path or None,
            "ready": True,
        }

    # ---------------------------------------------------------------- inferência
    def segment(self, frame: np.ndarray, hint: dict) -> np.ndarray:
        boxes = [tuple(int(v) for v in b) for b in (hint.get("boxes") or [])]
        points = [tuple(int(v) for v in p) for p in (hint.get("points") or [])]
        if not boxes and not points:
            return np.zeros(frame.shape[:2], np.uint8)

        if self._load():
            try:
                mask = self._segment_sam2(frame, boxes, points)  # type: ignore[arg-type]
                if mask is not None and mask.max() > 0:
                    self.last_engine = "sam2-onnx"
                    return mask
            except Exception as exc:  # pragma: no cover - depende do export
                print(f"[sam2] inferência falhou ({exc}); caindo para GrabCut")

        self.last_engine = "grabcut"
        return self._segment_grabcut(frame, boxes, points)  # type: ignore[arg-type]

    def _segment_sam2(
        self, frame: np.ndarray, boxes: Sequence[Box], points: Sequence[Point]
    ) -> Optional[np.ndarray]:
        assert self._encoder is not None and self._decoder is not None
        h, w = frame.shape[:2]
        size = self._input_size
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_LINEAR)
        tensor = resized.astype(np.float32) / 255.0
        tensor = (tensor - np.array([0.485, 0.456, 0.406], np.float32)) / np.array(
            [0.229, 0.224, 0.225], np.float32
        )
        tensor = np.transpose(tensor, (2, 0, 1))[None, ...].astype(np.float32)

        enc_name = self._encoder.get_inputs()[0].name
        embeddings = self._encoder.run(None, {enc_name: tensor})
        embed = embeddings[0]

        scale_x, scale_y = size / float(w), size / float(h)
        coords: List[List[float]] = []
        labels: List[float] = []
        for (x, y, bw, bh) in boxes:
            coords.append([x * scale_x, y * scale_y])
            labels.append(2.0)  # canto superior esquerdo da caixa
            coords.append([(x + bw) * scale_x, (y + bh) * scale_y])
            labels.append(3.0)  # canto inferior direito
        for (x, y, label) in points:
            coords.append([x * scale_x, y * scale_y])
            labels.append(float(label))
        if not coords:
            return None

        feed = {
            "image_embeddings": embed.astype(np.float32),
            "point_coords": np.asarray([coords], np.float32),
            "point_labels": np.asarray([labels], np.float32),
            "mask_input": np.zeros((1, 1, 256, 256), np.float32),
            "has_mask_input": np.zeros(1, np.float32),
            "orig_im_size": np.asarray([h, w], np.float32),
        }
        # Exports variam: mantemos só o que o decoder realmente declara e
        # acrescentamos as features intermediárias quando ele pedir.
        expected = {i.name for i in self._decoder.get_inputs()}
        for idx, extra in enumerate(embeddings[1:], start=0):
            for candidate in (f"high_res_feats_{idx}", f"feats_{idx}"):
                if candidate in expected:
                    feed[candidate] = extra.astype(np.float32)
        feed = {k: v for k, v in feed.items() if k in expected}
        if "image_embeddings" not in feed and "image_embed" in expected:
            feed["image_embed"] = embed.astype(np.float32)

        outputs = self._decoder.run(None, feed)
        logits = outputs[0]
        scores = outputs[1] if len(outputs) > 1 else None
        arr = np.asarray(logits)
        while arr.ndim > 3:
            if scores is not None and arr.shape[1] > 1:
                best = int(np.argmax(np.asarray(scores).reshape(-1)))
                arr = arr[:, best]
            else:
                arr = arr[0]
        low = arr[0] if arr.ndim == 3 else arr
        if low.shape[:2] != (h, w):
            low = cv2.resize(low.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
        return (low > 0).astype(np.uint8) * 255

    # ------------------------------------------------------------------ fallback
    def _segment_grabcut(
        self, frame: np.ndarray, boxes: Sequence[Box], points: Sequence[Point]
    ) -> np.ndarray:
        h, w = frame.shape[:2]
        rects = list(boxes)
        if not rects and points:
            span = int(max(w, h) * 0.12)
            for (x, y, label) in points:
                if label <= 0:
                    continue
                rects.append((max(0, x - span), max(0, y - span), span * 2, span * 2))
        if not rects:
            return np.zeros((h, w), np.uint8)

        out = np.zeros((h, w), np.uint8)
        for (x, y, bw, bh) in rects:
            x = max(0, min(x, w - 2))
            y = max(0, min(y, h - 2))
            bw = max(4, min(bw, w - x))
            bh = max(4, min(bh, h - y))
            gc = np.full((h, w), cv2.GC_BGD, np.uint8)
            gc[y:y + bh, x:x + bw] = cv2.GC_PR_FGD
            inner_x, inner_y = x + bw // 4, y + bh // 4
            gc[inner_y:y + bh - bh // 4, inner_x:x + bw - bw // 4] = cv2.GC_FGD
            for (px, py, label) in points:
                if 0 <= px < w and 0 <= py < h:
                    cv2.circle(gc, (px, py), max(3, min(w, h) // 90),
                               int(cv2.GC_FGD if label > 0 else cv2.GC_BGD), -1)
            try:
                bgd = np.zeros((1, 65), np.float64)
                fgd = np.zeros((1, 65), np.float64)
                cv2.grabCut(frame, gc, None, bgd, fgd, 3, cv2.GC_INIT_WITH_MASK)
                part = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
            except Exception:
                part = np.zeros((h, w), np.uint8)
                part[y:y + bh, x:x + bw] = 255
            out = np.maximum(out, part)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, kernel)
        return cv2.morphologyEx(out, cv2.MORPH_OPEN, kernel)
