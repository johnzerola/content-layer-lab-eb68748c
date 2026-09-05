"""Pixel-accurate burned text and subtitle detection."""
from __future__ import annotations

import json
import importlib.util
import os
from typing import Any, Iterable, List, Tuple

import cv2
import numpy as np

Box = Tuple[int, int, int, int]

_detector = None
_detector_kind = "uninitialized"
_detector_tried = False


def _try_rapidocr():
    """RapidOCR (ONNXRuntime / PP-OCR models) — detection only, CPU friendly."""
    try:
        from rapidocr_onnxruntime import RapidOCR  # type: ignore
    except Exception:
        try:
            from rapidocr import RapidOCR  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dependency
            print(f"[text_detect] RapidOCR unavailable ({exc})")
            return None
    try:
        return RapidOCR()
    except Exception as exc:  # pragma: no cover
        print(f"[text_detect] RapidOCR failed to start ({exc})")
        return None


def _get_detector():
    global _detector, _detector_kind, _detector_tried
    if _detector_tried:
        return _detector
    _detector_tried = True
    configured = os.getenv("CLEANER_OCR_ENGINE", os.getenv("CLEANER_TEXT_DETECTOR", "rapidocr")).lower()
    if configured == "morphology":
        _detector = None
        _detector_kind = "morphology"
        return None
    if configured == "rapidocr":
        rapid = _try_rapidocr()
        if rapid is not None:
            _detector = rapid
            _detector_kind = "rapidocr-onnx"
            return _detector
    try:
        # PaddleOCR 3.x direct detector. Recognition is intentionally omitted:
        # masks need geometry, not the transcription.
        from paddleocr import TextDetection  # type: ignore

        _detector = TextDetection(
            model_name=os.getenv("CLEANER_TEXT_DETECTOR", "PP-OCRv5_server_det"),
            device=os.getenv("CLEANER_OCR_DEVICE", "cpu"),
        )
        _detector_kind = "pp-ocrv5"
        return _detector
    except Exception as exc:  # pragma: no cover - optional runtime dependency
        print(f"[text_detect] modern TextDetection unavailable ({exc})")
    try:
        from paddleocr import PaddleOCR  # type: ignore

        _detector = PaddleOCR(use_angle_cls=False, lang="latin", show_log=False)
        _detector_kind = "paddleocr-legacy"
    except Exception as exc:  # pragma: no cover
        print(f"[text_detect] PaddleOCR unavailable ({exc}); using morphology")
        _detector = None
        _detector_kind = "morphology"
    return _detector


def detector_status(load: bool = False) -> dict:
    if load:
        _get_detector()
    available = (
        _detector is not None
        or importlib.util.find_spec("rapidocr_onnxruntime") is not None
        or importlib.util.find_spec("rapidocr") is not None
        or importlib.util.find_spec("paddleocr") is not None
    )
    return {
        "ready": available,
        "engine": _detector_kind if _detector_tried else "not-loaded",
        "model": os.getenv("CLEANER_TEXT_DETECTOR", "PP-OCRv5_server_det"),
    }


def _boxes_rapidocr(frame: np.ndarray) -> List[Box]:
    detector = _detector
    if detector is None:
        return []
    try:
        result = detector(frame, use_det=True, use_cls=False, use_rec=False)
    except TypeError:
        result = detector(frame)
    except Exception as exc:
        print(f"[text_detect] rapidocr inference failed ({exc})")
        return []
    boxes_raw: Any = None
    if isinstance(result, tuple):
        boxes_raw = result[0]
    else:
        boxes_raw = getattr(result, "boxes", None)
        if boxes_raw is None:
            boxes_raw = result
    boxes: List[Box] = []
    for item in boxes_raw or []:
        pts = item[0] if (isinstance(item, (list, tuple)) and len(item) == 3) else item
        arr = np.asarray(pts, dtype=np.float32)
        if arr.ndim == 2 and arr.shape[0] >= 4:
            boxes.append(cv2.boundingRect(arr.astype(np.int32)))
    return boxes



def _result_payload(item: Any) -> Any:
    if isinstance(item, dict):
        return item.get("res", item)
    data = getattr(item, "json", None)
    if callable(data):
        data = data()
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError:
            data = None
    if isinstance(data, dict):
        return data.get("res", data)
    raw = getattr(item, "res", None)
    return raw if isinstance(raw, dict) else None


def _modern_polygons(result: Iterable[Any]) -> List[np.ndarray]:
    polygons: List[np.ndarray] = []
    for item in result or []:
        payload = _result_payload(item)
        if not isinstance(payload, dict):
            continue
        for poly in payload.get("dt_polys", []) or []:
            arr = np.asarray(poly, dtype=np.float32)
            if arr.ndim == 2 and arr.shape[0] >= 4:
                polygons.append(arr)
    return polygons


def _boxes_paddle(frame: np.ndarray) -> List[Box]:
    global _detector, _detector_kind
    detector = _get_detector()
    if detector is None:
        return []
    try:
        if _detector_kind == "pp-ocrv5":
            result = detector.predict(frame, batch_size=1)
            return [cv2.boundingRect(poly.astype(np.int32)) for poly in _modern_polygons(result)]
        result = detector.ocr(frame, cls=False)
    except Exception as exc:
        print(f"[text_detect] inference failed ({exc}); using morphology for this frame")
        # Do not retry a broken optional runtime for every sampled frame.
        _detector = None
        _detector_kind = "morphology"
        return []
    boxes: List[Box] = []
    for page in result or []:
        for line in page or []:
            pts = np.array(line[0], dtype=np.float32)
            boxes.append(cv2.boundingRect(pts.astype(np.int32)))
    return boxes


def _boxes_morph(frame: np.ndarray) -> List[Box]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    grad = cv2.morphologyEx(
        gray, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    )
    _, bw = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    connected = cv2.morphologyEx(
        bw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5))
    )
    contours, _ = cv2.findContours(connected, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h_img, w_img = gray.shape[:2]
    boxes: List[Box] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < w_img * 0.04 or h < h_img * 0.012:
            continue
        if h > h_img * 0.4 or w / max(h, 1) < 1.4:
            continue
        boxes.append((x, y, w, h))
    return boxes


def detect_text_boxes(frame: np.ndarray) -> List[Box]:
    _get_detector()
    boxes = _boxes_rapidocr(frame) if _detector_kind == "rapidocr-onnx" else _boxes_paddle(frame)
    return boxes if boxes else _boxes_morph(frame)



def text_pixel_mask(frame: np.ndarray, box: Box, dilate_ratio: float = 0.32) -> np.ndarray:
    """Mask glyphs, outline, shadow and glow inside a detected text box."""
    h_img, w_img = frame.shape[:2]
    x, y, w, h = box
    x, y = max(0, x), max(0, y)
    w, h = min(w_img - x, w), min(h_img - y, h)
    mask = np.zeros((h_img, w_img), dtype=np.uint8)
    if w <= 2 or h <= 2:
        return mask
    roi = frame[y:y + h, x:x + w]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 5, 40, 40)
    bright = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    dark = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    local = bright if bright.mean() < dark.mean() else dark
    local = cv2.bitwise_or(local, cv2.Canny(gray, 60, 160))
    kernel_size = max(3, int(round(h * dilate_ratio)) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    local = cv2.dilate(local, kernel)
    local = cv2.morphologyEx(local, cv2.MORPH_CLOSE, kernel)
    # Subtitle boxes: once a line is clearly covered by glyphs, clear the whole
    # band instead of glyph outlines — leftover strokes/shadows are worse than
    # rebuilding a slightly larger background plate.
    rows = np.where(local.mean(axis=1) > 20)[0]
    if rows.size:
        pad = max(2, int(round(h * 0.12)))
        top = max(0, int(rows.min()) - pad)
        bottom = min(h, int(rows.max()) + 1 + pad)
        local[top:bottom, :] = 255
    mask[y:y + h, x:x + w] = local

    return mask


def _bright_subtitle_mask(frame: np.ndarray, roi: np.ndarray) -> np.ndarray:
    """Conservative fallback for bright subtitle glyphs inside a known ROI."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    bright = cv2.inRange(gray, 185, 255)
    bright = cv2.bitwise_and(bright, roi)
    # Join letters and short words on the same subtitle line, then include
    # outline/shadow pixels without expanding into unrelated regions.
    joined = cv2.morphologyEx(
        bright,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (13, 3)),
    )
    joined = cv2.dilate(joined, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    return cv2.bitwise_and(joined, roi)


def _roi_bbox(roi: np.ndarray, margin: int = 24):
    ys, xs = np.where(roi > 0)
    if ys.size == 0:
        return None
    h_img, w_img = roi.shape[:2]
    return (
        max(0, int(ys.min()) - margin),
        min(h_img, int(ys.max()) + 1 + margin),
        max(0, int(xs.min()) - margin),
        min(w_img, int(xs.max()) + 1 + margin),
    )


def frame_text_mask(
    frame: np.ndarray,
    roi: np.ndarray | None = None,
    subtitle_only: bool = False,
) -> np.ndarray:
    h_img, w_img = frame.shape[:2]
    out = np.zeros((h_img, w_img), np.uint8)
    # Detecting inside the ROI crop instead of the whole frame keeps CPU OCR
    # roughly an order of magnitude cheaper without changing the result.
    box_area = _roi_bbox(roi) if roi is not None else None
    if box_area is not None:
        y0, y1, x0, x1 = box_area
        search = frame[y0:y1, x0:x1]
    else:
        y0, x0 = 0, 0
        search = frame
    if search.size == 0:
        return out
    for box in detect_text_boxes(search):
        x, y, w, h = box
        abs_x, abs_y = x + x0, y + y0
        if subtitle_only and (abs_y + h / 2) < h_img * 0.42:
            continue
        if roi is not None:
            sub = roi[max(0, abs_y):abs_y + h, max(0, abs_x):abs_x + w]
            if sub.size == 0 or (sub > 0).mean() < 0.15:
                continue
        local = text_pixel_mask(search, box)
        out[y0:y0 + local.shape[0], x0:x0 + local.shape[1]] = np.maximum(
            out[y0:y0 + local.shape[0], x0:x0 + local.shape[1]], local
        )
    if roi is not None:
        out = cv2.bitwise_and(out, roi)
        if subtitle_only and not np.any(out):
            out = _bright_subtitle_mask(frame, roi)
    return out

