# Tool Research Matrix — Preliminary

Status: research only. No candidate below is installed or promoted.

| Candidate | Measured gap it may fill | Existing overlap | License / execution | Initial risk | Provisional disposition |
| --- | --- | --- | --- | --- | --- |
| Serena | Cross-language symbol lookup, references and symbol-scoped edits | Cleaner AST inspector already covers bounded Cleaner inspection; Editor server covers Editor research | Official repository reports an MCP/LSP-based toolkit; license and dependency licenses require pinned-revision verification | Local language servers, filesystem scope and a large tool schema | **Prototype only** after TypeScript/Python retrieval baseline |
| Context7 | Current, version-targeted external library documentation | Official documentation search already exists; no project-local equivalent for dependency snippets | Remote service/API; API guide requires key for direct API access | Sends query/context to third party; schema and key management | **Prototype only**, external docs route only |
| Aider repo map | Budgeted global structural view | Existing Cleaner and Editor graphs are domain-specific rather than full-repo map | Aider documents graph-ranked maps with `--map-tokens`; broader coding-agent install is unnecessary | Full codebase indexing and potential accidental agent behavior | **Do not install Aider**; evaluate its map algorithm/format against a local read-only prototype |
| Repomix | On-demand handoff/audit bundle with token counting | No equivalent general packer | MIT reported by upstream | Repository content aggregation; large outputs can worsen context | **On demand only** after a redaction/ignore test |
| Superpowers | Selected quality workflow patterns | Strong overlap with existing 32 project skills | Must be audited per selected skill | Skill bloat / competing instructions | **No install** until a specific gap is demonstrated |
| LLMLingua family | Compression of long textual logs/reports | Current research records already summarize evidence manually | Model/dependency/license validation pending | Loss of code/config/log details; possible local inference burden | **Research only**; never automatic for source/diff/contracts |

## Evidence consulted

- [Serena official repository](https://github.com/alyadins/serena): MCP-oriented
  semantic retrieval/editing built on language-server integrations. Repository
  identity and license must be rechecked at the pinned revision before use.
- [Context7 API guide](https://context7.com/docs/api-guide): library search and
  focused context retrieval are API operations; direct use requires an API key.
- [Aider repository map documentation](https://github.com/Aider-AI/aider/blob/main/aider/website/docs/repomap.md):
  graph-ranked symbols are constrained by `--map-tokens`, but Aider itself is a
  full coding agent rather than a minimal map library.
- [Repomix upstream README](https://github.com/yamadashy/repomix/blob/main/README.md):
  reports MIT licensing and token-counting/bundling capabilities.

## Required proof before promotion

For every candidate: pinned repository revision, license plus material dependency
licenses, activity/issue review, Windows/Codex compatibility, local/cloud and
telemetry behavior, access scope, uninstall steps, and one before/after cohort.
No candidate may be added to the default MCP set merely because it is useful in
another coding environment.
