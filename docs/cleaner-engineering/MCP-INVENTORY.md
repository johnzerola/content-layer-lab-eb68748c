# Cleaner MCP inventory and policy

Audited on 2026-09-12 against `.codex/config.toml`, `mcp/MCP_REGISTRY.json`, and live server listings. Project MCP configuration contains five servers; runtime-provided tools and the Lovable product MCP are separate.

| MCP | Class | Status | Cleaner use |
| --- | --- | --- | --- |
| Serena `1.7.0` | Code navigation | Configured; prior smoke passed | Symbols, callers, references, and focused architecture mapping before broad reads |
| `cleaner-research` | Upstream research; bounded execution | Configured; 21 tools listed | Curated project inspection, knowledge, public repositories/papers/models, licenses, experiment records, CPU controls |
| Playwright `0.0.80` | UI testing | Configured, headless/isolated | Deterministic local comparison-page and authorized browser-flow checks |
| Chrome DevTools `1.9.0` | UI testing / browser profiling | Configured, headless/isolated | Console, network, media-page, and frontend performance diagnostics |
| `editor-development` | Other | Configured; 39 tools listed | Editor research only; not a Cleaner reconstruction authority |

`Context7` and `GitHub` appear only as blocked recommendations in the internal registry; they are not configured project MCPs. Shell and filesystem are native capabilities, not MCPs. Repomix is an on-demand CLI, not an MCP. The Lovable OAuth manifest is product-facing and must remain separate from engineering research.

## Invocation policy

- **Code:** use Serena or `cleaner-research.inspect_component`/`inspect_project` at symbol scope before broad file reads.
- **Documentation:** retrieve only the pinned version and relevant API sections.
- **GitHub/public upstream:** inspect exact repositories, commits, files, issues, releases, or licenses. Do not clone many projects speculatively.
- **Shell:** use hashes, tests, FFmpeg/ffprobe, profiling, and small controlled experiments. Never trigger paid cloud work implicitly.
- **Browser:** use only for a matching local QA or authorized external black-box task; keep external access boundaries explicit.
- Search internal knowledge before repeating research and record durable findings with evidence labels.

Configuration risk: `.codex/config.toml` currently uses absolute Windows paths for the two local Python servers and Serena. It works on this machine but is not portable to another checkout without path changes.
