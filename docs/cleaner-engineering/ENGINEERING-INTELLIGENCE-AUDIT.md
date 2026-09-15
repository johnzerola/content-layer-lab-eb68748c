# Cleaner engineering intelligence layer — audit and installation

Date: 2026-09-12. Scope: engineering instructions, skills, custom agents, routing, and MCP inventory only. No Golden, mask, reconstruction, worker, deployment, paid inference, or cloud job was changed.

## Repository audit

- The supported project conventions are `.agents/skills/<name>/SKILL.md`, optional skill UI metadata in `agents/openai.yaml`, standalone project agents in `.codex/agents/*.toml`, and MCP servers in `.codex/config.toml`.
- Existing Cleaner capabilities already covered architecture, masks, subtitle detection, temporal mechanics, inpainting research, benchmarks, GPU measurement, and licenses. The new five roles define ownership and decision boundaries while reusing those narrower skills.
- Current source entry points include `backend/app/workers/tasks.py::run_pipeline`, `backend/runpod_handler.py`, `src/lib/cleaner-gpu.server.ts`, and `src/lib/cleaner-chunks.server.ts`. The curated `research/current-system` snapshot predates the current HEAD, so live symbols must be verified before current-state claims.
- Current experiment truth is E1 product-open, E2 partial/gated, and E3 `RETEST_BEFORE_E4`. Earlier E3 exploratory advancement is superseded by later review/repair evidence.
- Golden V4 is an externally defined frozen oracle/fallback and lacks one canonical repository manifest. Case-specific artifact paths/hashes must be cited.

## Installed layer

Five project skills and five matching custom-agent configurations were added. Quality and clean-room agents are read-only; other agents inherit parent permissions because future authorized implementation may require writes. No agent pins a model. Shared context, routing, MCP policy/recommendations, milestone, and model/reasoning guidance live in this directory.

## Conflicts and risks

- Older Cleaner skills overlap in topic. [SPECIALIST_ROUTING.md](SPECIALIST_ROUTING.md) makes the new roles owners and keeps legacy skills as narrow helpers.
- An older token-efficiency audit says Serena was absent; active local config and the registry now show Serena. Treat the old statement as historical.
- `cleaner-research` is configured and available, but invoked on matching Cleaner work rather than every task.
- `.codex/config.toml` is untracked and contains machine-specific absolute Windows paths.
- `research/VALIDATION.md` has a stale tool count; the live Cleaner server lists 21 tools.
- Source-level risks found but intentionally not fixed here: `cleaner-gpu.server.ts` has a v3 comment while enforcing `scene-roi-v4`; callback schemas omit a `cancelled` status emitted elsewhere; GPU and ordinary routes differ on `karaoke`; current deployment equivalence is unverified.
- Open-source commercial clearance remains artifact-specific. A permissive code repository does not clear weights, training/data restrictions, dependencies, or redistribution.

## Validation results

- The official `quick_validate.py` passed for all five skills, including their UI metadata.
- `codex debug prompt-input` discovered all five skill names from the project root.
- All five custom-agent TOMLs parse and contain `name`, `description`, and `developer_instructions`; the two independent reviewers enforce `sandbox_mode = "read-only"`. Codex loads project agents from `.codex/agents/` in newly started sessions.
- `.codex/config.toml`, `skills/INDEX.json`, and `mcp/MCP_REGISTRY.json` parse successfully. `codex mcp list` reports all five configured project servers enabled.
- The link/placeholder scan found zero broken local links and no TODO placeholders in the new layer.
- A read-only `cleaner-research.inspect_component` smoke located `backend/app/video/subtitle_junctions.py::refine_junctions` and `backend/app/video/subtitle_references.py::recover_detail`. The routing matrix assigns that E2 question to `temporal-correspondence-engineer`, with quality review independent.
- No reconstruction test, video inference, RunPod job, download, deployment, or production edit ran during validation.

## Next engineering task

Create a canonical, read-only Golden V4 manifest/pointer with case artifact paths, hashes, frame/geometry contract, provenance, and allowed oracle/fallback role; separately refresh the current-system architecture hashes against current HEAD. Do not alter Golden or production behavior.
