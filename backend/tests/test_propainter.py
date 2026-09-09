from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.engines.propainter_official import (
    REQUIRED_CODE,
    REQUIRED_WEIGHTS,
    build_propainter_command,
    propainter_status,
)


class ProPainterAdapterTests(unittest.TestCase):
    def test_status_lists_missing_runtime_parts(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"PROPAINTER_ROOT": directory}, clear=False
        ), patch("app.engines.propainter_official.cuda_available", return_value=False):
            status = propainter_status()
            self.assertFalse(status.ready)
            self.assertIn("cuda", status.missing)
            self.assertIn(REQUIRED_CODE[0], status.missing)
            self.assertIn(f"weights/{REQUIRED_WEIGHTS[0]}", status.missing)

    def test_command_uses_complete_upstream_runner_and_native_aspect_ratio(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {"PROPAINTER_ROOT": directory, "PROPAINTER_MAX_SIDE": "960"},
            clear=False,
        ), patch("app.engines.propainter_official.cuda_available", return_value=True):
            command = build_propainter_command(
                "input.mp4", "masks", "output", 1080, 1920, 29.97, "quality"
            )
            self.assertEqual(Path(command[1]).name, "inference_propainter.py")
            self.assertEqual(command[command.index("--width") + 1], "536")
            self.assertEqual(command[command.index("--height") + 1], "960")
            self.assertEqual(command[command.index("--save_fps") + 1], "30")
            self.assertIn("--fp16", command)

    def test_memory_retry_preserves_explicit_small_temporal_budget(self):
        with patch.dict(os.environ, {
            "PROPAINTER_SUBVIDEO_LENGTH": "24", "PROPAINTER_NEIGHBOR_LENGTH": "6",
            "PROPAINTER_REF_STRIDE": "12",
        }), patch("app.engines.propainter_official._propainter_cuda_available", return_value=True):
            for scale in (1.0, 0.72):
                command = build_propainter_command("input", "masks", "output", 720, 256,
                                                   30, "quality", scale)
                self.assertEqual(command[command.index("--subvideo_length") + 1], "24")
                self.assertEqual(command[command.index("--neighbor_length") + 1], "6")
                self.assertEqual(command[command.index("--ref_stride") + 1], "12")


if __name__ == "__main__":
    unittest.main()
