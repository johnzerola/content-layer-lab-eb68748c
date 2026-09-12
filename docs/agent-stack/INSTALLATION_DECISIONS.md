# Installation decisions

## Accepted: Serena 1.7.0 — always available

- Source: [oraios/serena](https://github.com/oraios/serena), MIT.
- Installed through the user-level `uv` tool environment, pinned to `serena-agent==1.7.0`; it does not modify project Python dependencies.
- Codex MCP entry is project-local and starts Serena in `codex` context with the current Git project auto-detected.
- Smoke result: MCP initialization succeeded; `tools/list` exposed 23 scoped tools including `find_symbol`, `find_referencing_symbols`, `find_implementations`, `get_symbols_overview`, and diagnostics. Redundant file and shell tools were excluded.
- Security adjustment: Serena dashboard is disabled globally and binds nowhere in the active configuration. Its generated `.serena/` project data is ignored by Git.

## Accepted: Repomix 1.18.0 — on demand only

- Source: [yamadashy/repomix](https://github.com/yamadashy/repomix), MIT.
- Validated with `npx -y repomix@1.18.0 --version`; no package was added to the project.
- Use only for handoff, audit, or bounded external review. Never generate a full dump automatically; use explicit include/exclude paths and a token budget.

## Deferred: Context7

- Source: [upstash/context7](https://github.com/upstash/context7).
- The official MCP command requires `CONTEXT7_API_KEY`; it was absent. No inert MCP entry or placeholder secret was created.
- Re-evaluate only when a credential is supplied through the user environment and a documentation-retrieval benchmark exists.

## Deferred: GitHub MCP

- Source: [github/github-mcp-server](https://github.com/github/github-mcp-server).
- Read-only operation still requires a token for authenticated/private repository work. `GITHUB_TOKEN` and `GH_TOKEN` were absent.
- Do not add it until a read-only token with least privilege is supplied.

## Rejected for this phase

- Full Aider installation: its repo-map approach is useful evidence, but adding a complete coding agent duplicates the active harness.
- LLMLingua: experimental only after loss-aware benchmarks on logs/reports; never source, diffs, contracts, SQL, or critical JSON.
- LiteLLM, Langfuse, Phoenix, code-context RAG: not justified without an API execution path, telemetry requirements, and a measured baseline.
