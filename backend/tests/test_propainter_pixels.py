from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import os

import cv2
import numpy as np

from app.engines.propainter_pixels import pixel_geometry, prepare_pixels, pack_pixels
from app.engines.propainter_official import run_propainter, ProPainterStatus, _invoke
import time
from unittest.mock import MagicMock
from app.services.inference_region import _write_video
from app.services.pixel_composite import composite_lossless
from app.utils.video import probe, read_frames


class PixelPreservationTests(unittest.TestCase):
    def test_padding_keeps_native_crops_and_explicit_scale_has_no_floor_stretch(self):
        for w, padded in ((762, 768), (678, 680), (820, 824)):
            g = pixel_geometry(w, 294, 960)
            self.assertEqual((g.content_width, g.content_height), (w, 294))
            self.assertEqual((g.padded_width, g.padded_height), (padded, 296))
        g = pixel_geometry(1080, 1920, 960)
        self.assertEqual((g.content_width, g.content_height), (540, 960))
        self.assertEqual(g.padded_width, 544)

    def fixture(self, root):
        rng = np.random.default_rng(123)
        frames = [rng.integers(0, 256, (30, 46, 3), dtype=np.uint8) for _ in range(3)]
        source, masks = root / "source.mp4", root / "masks"
        masks.mkdir()
        for i in range(3):
            mask = np.zeros((30, 46), np.uint8)
            if i:
                mask[12:22, 20:] = 255  # Text reaching the right edge.
            cv2.imwrite(str(masks / f"{i:06d}.png"), mask)
        _write_video(source, 46, 30, 30000 / 1001, frames)
        return source, masks, frames

    def test_png_padding_crop_color_and_fractional_fps_roundtrip_is_exact(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, masks, frames = self.fixture(root)
            scratch = root / "scratch"
            scratch.mkdir()
            g = pixel_geometry(46, 30, 960)
            count = prepare_pixels(str(source), str(masks), scratch, g)
            results = root / "results"
            results.mkdir()
            for i, frame in enumerate(frames):
                padded = cv2.imread(str(scratch / "input" / f"{i:06d}.png"))
                np.testing.assert_array_equal(padded[:30, :46], frame)
                np.testing.assert_array_equal(padded[:30, 46], frame[:, -1])
                mask = cv2.imread(str(scratch / "masks" / f"{i:06d}.png"), 0)
                np.testing.assert_array_equal(mask[:, 46], mask[:, 45])
                if i == 0:
                    self.assertFalse(mask.any())
                cv2.imwrite(str(results / f"{i:04d}.png"), padded)
            output = pack_pixels(results, root / "output.mp4", g, count, 30000 / 1001)
            for a, b in zip(read_frames(output), frames):
                np.testing.assert_array_equal(a, b)
            self.assertEqual(probe(output).frames, 3)
            self.assertAlmostEqual(probe(output).fps, 30000 / 1001, places=5)

    def test_known_clean_background_under_synthetic_subtitles_is_preserved(self):
        # This tests I/O + composition against known truth, not AI accuracy.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            clean, masks, frames = self.fixture(root)
            overlaid = []
            for i, frame in enumerate(frames):
                f = frame.copy()
                m = cv2.imread(str(masks / f"{i:06d}.png"), 0)
                overlay = np.zeros_like(f)
                cv2.putText(overlay, "OI", (22, 20), cv2.FONT_HERSHEY_SIMPLEX,
                            .25, (15, 240, 250), 1, cv2.LINE_AA)
                lettering = np.any(overlay != 0, axis=2) & (m > 0)
                f[lettering] = overlay[lettering]
                overlaid.append(f)
            source = root / "subtitles.mp4"
            _write_video(source, 46, 30, 30000 / 1001, overlaid)
            output = composite_lossless(source, clean, masks, root / "composite.mp4", probe(str(source)))
            actual = list(read_frames(output))
            self.assertEqual(len(actual), len(frames))
            for a, b in zip(actual, frames):
                np.testing.assert_array_equal(a, b)

    def test_invalid_sequence_and_cancel_fail_without_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, masks, _ = self.fixture(root)
            g = pixel_geometry(46, 30, 960)
            scratch = root / "scratch"
            scratch.mkdir()
            with self.assertRaisesRegex(RuntimeError, "budget"):
                prepare_pixels(str(source), str(masks), scratch, g, max_bytes=1)
            cancel = root / "cancel"
            cancel.touch()
            with self.assertRaisesRegex(RuntimeError, "cancelado"):
                prepare_pixels(str(source), str(masks), scratch, g, cancel_file=str(cancel))
            with self.assertRaisesRegex(ValueError, "incomplete"):
                pack_pixels(root / "missing", root / "output.mp4", g, 3, 30)
            self.assertFalse((root / "output.mp4").exists())

    def test_adapter_requires_png_and_cleans_attempt_on_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, masks, _ = self.fixture(root)
            status = ProPainterStatus(True, str(root), True, ())
            target = root / "run"
            with patch.dict(os.environ, {"PROPAINTER_PRESERVE_PIXELS": "1"}), \
                 patch("app.engines.propainter_official.propainter_status", return_value=status), \
                 patch("app.engines.propainter_official._propainter_cuda_available", return_value=True), \
                 patch("app.engines.propainter_official._invoke", return_value=0):
                with self.assertRaisesRegex(ValueError, "incomplete"):
                    run_propainter(str(source), str(masks), str(target), 46, 30, 30, "max")
            self.assertEqual(list(target.iterdir()), [])
            self.assertTrue(source.exists())

    def test_adapter_packs_upstream_png_and_cleans_success_and_oom_attempt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, masks, frames = self.fixture(root)
            status = ProPainterStatus(True, str(root), True, ())
            target = root / "run"
            calls = []
            def upstream(command, cwd, env, log, deadline, cancel, stage):
                calls.append(command.copy())
                if len(calls) == 1:
                    log.write_text("CUDA out of memory")
                    return 1
                self.assertIn("--save_frames", command)
                output = Path(command[command.index("--output") + 1]) / "input/frames"
                output.mkdir(parents=True)
                input_dir = Path(command[command.index("--video") + 1])
                for i, p in enumerate(sorted(input_dir.glob("*.png"))):
                    cv2.imwrite(str(output / f"{i:04d}.png"), cv2.imread(str(p)))
                log.write_text("success")
                return 0
            with patch.dict(os.environ, {"PROPAINTER_PRESERVE_PIXELS": "1"}), \
                 patch("app.engines.propainter_official.propainter_status", return_value=status), \
                 patch("app.engines.propainter_official._propainter_cuda_available", return_value=True), \
                 patch("app.engines.propainter_official._invoke", side_effect=upstream):
                output = run_propainter(str(source), str(masks), str(target), 46, 30, 30000 / 1001, "quality")
            for a, b in zip(read_frames(output), frames):
                np.testing.assert_array_equal(a, b)
            self.assertEqual(len(calls), 2)
            self.assertFalse(list(target.glob("pixels-*")))
            self.assertTrue((target / "pixels.json").is_file())

    def test_unexpected_polling_failure_kills_gpu_process(self):
        with tempfile.TemporaryDirectory() as temp:
            process = MagicMock()
            process.poll.return_value = None
            with patch("app.engines.propainter_official.subprocess.Popen", return_value=process), \
                 patch("app.engines.propainter_official.time.sleep", side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):
                    _invoke(["runner"], Path(temp), {}, Path(temp) / "log", time.monotonic() + 30, None, None)
            process.kill.assert_called_once()
            process.wait.assert_called_once_with(timeout=10)


if __name__ == "__main__":
    unittest.main()
