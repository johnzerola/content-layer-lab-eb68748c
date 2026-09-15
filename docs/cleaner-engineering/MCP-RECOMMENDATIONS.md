# MCP recommendations

No additional MCP is required for the Cleaner engineering layer. Existing shell, Serena, and `cleaner-research` cover the core work.

| Missing MCP | Purpose | Expected benefit | Specialists | Requirement |
| --- | --- | --- | --- | --- |
| Context7-style documentation | Retrieve focused, version-specific library documentation | Faster checks for PyTorch, CUDA-facing APIs, FFmpeg bindings, and other pinned dependencies | Reconstruction, temporal, GPU | Optional; configure only after credential/source review and a retrieval benchmark |
| GitHub MCP | Read exact public files, commits, issues, PRs, and release metadata | Better upstream provenance and less broad cloning for engines and dependencies | Reconstruction, temporal, clean-room, license support | Optional; use least-privilege read-only access and smoke-test before enabling |

Do not add a filesystem MCP or GPU-profiler MCP now. Native filesystem/shell plus PyTorch profiler, CUDA telemetry, `nvidia-smi`, and FFmpeg are sufficient. Do not invent endpoints, install servers automatically, or expose credentials in repository configuration.
