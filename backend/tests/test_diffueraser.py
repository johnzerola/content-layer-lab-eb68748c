from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
import json
import sys
from types import SimpleNamespace
from unittest.mock import patch

from app.engines.diffueraser_official import (
    build_diffueraser_command,
    diffueraser_status,
    run_diffueraser,
)


class DiffuEraserAdapterTests(unittest.TestCase):
    def test_status_is_not_ready_without_code_models_and_cuda(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {"DIFFUERASER_ROOT": directory, "DIFFUERASER_MODELS_ROOT": directory},
            clear=False,
        ), patch("app.engines.diffueraser_official.cuda_available", return_value=False):
            status = diffueraser_status()
            self.assertFalse(status.ready)
            self.assertIn("cuda", status.missing)
            self.assertIn("run_diffueraser.py", status.missing)

    def test_command_uses_official_cli_and_explicit_model_paths(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {
                "DIFFUERASER_ROOT": directory,
                "DIFFUERASER_MODELS_ROOT": directory,
                "DIFFUERASER_MAX_SIDE": "720",
            },
            clear=False,
        ):
            command = build_diffueraser_command(
                "input.mp4", "mask.mp4", "output", duration=10.2
            )
            self.assertTrue(command[1].endswith("run_diffueraser.py"))
            self.assertEqual(command[command.index("--video_length") + 1], "11")
            self.assertEqual(command[command.index("--max_img_size") + 1], "720")
            self.assertIn("--diffueraser_path", command)
            self.assertIn("--propainter_model_dir", command)

    def test_process_telemetry_persists_stdout_stderr_exit_and_output(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "run"
            script = (
                "from pathlib import Path; import sys; "
                f"Path(r'{target / 'diffueraser_result.mp4'}').write_bytes(b'x'*2048); "
                "print('model loaded'); print('diagnostic stderr', file=sys.stderr)"
            )
            status = SimpleNamespace(ready=True, root=directory, models_root=directory, missing=())
            with patch("app.engines.diffueraser_official.diffueraser_status", return_value=status), \
                 patch("app.engines.diffueraser_official._link_model_tree"), \
                 patch("app.engines.diffueraser_official.build_diffueraser_command",
                       return_value=[sys.executable, "-c", script]):
                output = run_diffueraser("input.mp4", "mask.mp4", str(target), 1)
            self.assertEqual(output, str(target / "diffueraser_result.mp4"))
            report = json.loads((target / "diffueraser.report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["exit_code"], 0)
            self.assertTrue(report["process_started"])
            self.assertTrue(report["inference_finished"])
            self.assertEqual(report["output_bytes"], 2048)
            self.assertIn("model loaded", (target / "diffueraser.stdout.log").read_text())
            self.assertIn("diagnostic stderr", (target / "diffueraser.stderr.log").read_text())


if __name__ == "__main__":
    unittest.main()
