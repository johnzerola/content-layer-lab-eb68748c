# Token Efficiency — Existing-State Audit

Date: 2026-09-11
Checkpoint: `51870c8d3408e7a5bf7eb289df0afa825d832368`
Scope: development infrastructure only. No Cleaner engine, production pipeline,
neural baseline, frontend behavior, or database configuration was changed.

## Decision summary

The repository already has useful domain-specific retrieval and durable research
memory. It does **not** yet have an efficiency routing layer, a token telemetry
record, context packs, or a compact general repository map. The V1 should reuse
the existing domain MCPs and records, add a local/read-only routing policy and
measurement schema, and evaluate external tools one at a time. No new MCP or
dependency is promoted by this audit.

The large `research/benchmarks` tree (377 files, about 103 MiB) and the
experiment tree (139 files, about 1.25 MiB) are the clearest immediate reasons
to avoid broad repository reads and automatic repository dumps.

## Inventory

| Component | Purpose | Overlap / token cost | Value | Disposition |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | Global repository guardrails and UI-skill routing | 819 B; concise; no subsystem content | High | **KEEP**; already slim |
| Nested instruction files | None found outside root `AGENTS.md` | No hidden per-folder prompt tax | High | **KEEP**; add only scoped context packs later |
| `.agents/skills/` | 32 installed project skills across Cleaner, editor, UX and QA | Some role overlap, especially UI design; loading all is expensive | High | **KEEP / ON_DEMAND**; route by task, do not merge blindly |
| `.agents/skills/impeccable` | Visual-product design workflow and references | Largest skill payload; irrelevant to non-UI tasks | Medium-high | **ON_DEMAND** only for UI work |
| `.codex/config.toml` | Project-local MCP configuration | Four schemas can increase selection noise if all are surfaced | High | **KEEP**; classify by activation policy |
| `playwright` MCP | Isolated browser interaction and screenshots | Duplicates some DevTools browser control; unique end-to-end flow coverage | High for UI validation | **ON_DEMAND** |
| `chrome-devtools` MCP | Isolated browser diagnostics, console, network and traces | Partial overlap with Playwright; distinct diagnostic depth | High for perf/debug | **ON_DEMAND** |
| `cleaner-research` MCP | AST/source inspection, curated pipeline graph, knowledge search, experiments, licenses and CPU controls | Closest internal equivalent to proposed symbol/research navigation for Cleaner | Very high | **KEEP / ALWAYS_AVAILABLE for Cleaner tasks** |
| `editor-development` MCP | Editor-specific research and state/context retrieval | No duplication with Cleaner server | High | **KEEP / ALWAYS_AVAILABLE for Editor tasks** |
| `.lovable/mcp/manifest.json` | Product-facing read-only MCP contract | Not an agent-development retrieval tool | Medium | **RARE**; retain, do not mix with dev routing |
| `research/MCP_TOOLS.md` | Contracts for 18 bounded Cleaner research tools | Prevents tool rediscovery and broad reads | High | **KEEP** as source of truth |
| `editor-research/EDITOR_MCP_TOOLS.md` | Editor research tool contract | Compact domain guide | High | **KEEP** as source of truth |
| `research/` knowledge base | Papers, projects, licenses, failures, learning cards, current-system records | Durable memory is present but not surfaced by a cross-domain router | Very high | **KEEP**; consult `search_knowledge` before external research |
| `research/architecture-decisions/` | ADR record | One small ADR today | Medium | **KEEP**; expand only for actual decisions |
| `research/failures/` | Persistent failure memory | Five records; prevents repeating known failures | High | **KEEP**; route Cleaner investigations here first |
| `research/experiments/` | Experiment registry and reports | Rich evidence, but large enough to make blind reads wasteful | Very high | **KEEP / QUERY FIRST** |
| `research/benchmarks/` | Benchmark manifests, results and media | About 103 MiB; high accidental-context cost | Very high | **KEEP / STRICTLY ON_DEMAND** |
| `research/algorithms/graph.json` | Cleaner engineering/pipeline graph | Compact global structure for Cleaner | High | **KEEP**; candidate source for Cleaner context pack |
| `editor-research/state-graph.json` | Compact Editor state graph | Compact global structure for Editor | High | **KEEP**; candidate source for Editor context pack |
| `docs/design-research/MCP_MATRIX.md` | Existing design-MCP assessment | Already evaluates Playwright and DevTools as configured, others as uninstalled | High | **KEEP**; avoid parallel re-research for design tools |
| `docs/design-research/SKILLS_MAP.md` | Existing design skill map | Documents complementary rather than duplicated responsibilities | High | **KEEP** |
| `research/research_loop.py` and runs | Finite, resumable source collection with cache/state | Domain-specific compaction and failure handling, not general token telemetry | High | **KEEP**; do not replace |
| Package/tool manifests | Node frontend plus separate Python backend/research environments | No central development-router configuration | Medium | **KEEP**; do not add a service before measured need |

## Current MCP activation baseline

| MCP | Current configuration | Recommended V1 classification | Least-privilege note |
| --- | --- | --- | --- |
| `cleaner-research` | Local stdio, allowlisted source reads; does not call production/GPU | Domain-active | Prefer `inspect_component`, `trace_pipeline` and `search_knowledge` before files or web |
| `editor-development` | Local stdio; no UI/media rendering control | Domain-active | Use only for editor architecture/research tasks |
| `playwright` | `npx`, Chrome, headless, isolated output directory | On demand | Browser content can be exposed to tool; do not use personal profiles |
| `chrome-devtools` | `npx`, headless, isolated, usage statistics and CrUX disabled, network headers redacted | On demand | Use for diagnosis/performance, not ordinary code discovery |
| Product MCP manifest | OAuth user data; read-only hints | Rare | Keep separate from development/tool routing |

## Configuration and observability baseline

- Project instructions are short and intentionally universal; no `CLAUDE.md`,
  `.cursorrules`, or nested `AGENTS.md` was found.
- The project-local Codex configuration contains four MCP servers. There is no
  configured Serena, Context7, Repomix, GitHub MCP, prompt-cache setting,
  context-router setting, model-router setting, or tool telemetry sink.
- Current durable domain observations are Cleaner-oriented (`research/`) and
  Editor-oriented (`editor-research/`); there is no project-wide task ledger
  with input/output/cached tokens, tool calls, files/bytes read, retry count,
  escalation count, cost, or outcome.
- The current environment exposes the conceptual execution tiers `gpt-6-astra`,
  `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5`. This is an
  environment inventory, not a permanent model mapping or price claim.
- Official OpenAI documentation confirms that current API model guidance
  supports reasoning controls, prompt caching and compaction, but availability,
  billing and cache metrics in this Codex surface remain **NOT_AVAILABLE until
  captured in a measured task record**. Source: official OpenAI model guidance,
  consulted 2026-09-11.

## Gaps to measure, not assume

1. The token and cache counters exposed by the current Codex task surface.
2. Model availability and costs for the actual account at benchmark time.
3. Whether symbol navigation from Serena improves over the existing
   `cleaner-research` AST inspector for TypeScript and general code.
4. Whether a compact repo map reduces total successful-task cost without
   harming multi-file investigation quality.
5. Whether Context7 adds enough value beyond official source search to justify
   another MCP schema.
6. Whether Repomix or textual compression preserves the precise source/config
   details required by this project.

## Non-destructive next sequence

1. Define a task-record schema and collect a pre-change baseline on eight
   representative tasks.
2. Build read-only context packs from existing sources and a bounded local repo
   map prototype; neither requires an external install.
3. Research Serena, Context7 and one repo-map candidate using current primary
   sources, license/security review and a compatibility matrix.
4. Prototype only the candidate that fills a measured gap; compare it with the
   baseline before promotion.

## Rollback point

`51870c8` is the pre-initiative checkpoint. Reverting the later, isolated
development-infrastructure commit(s) restores the repository state without
rewriting published history. `.codex/` remains local and is intentionally not
part of the checkpoint.
