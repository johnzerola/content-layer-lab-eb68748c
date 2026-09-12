# Token-efficiency architecture

This is a local development-control layer, not a product service.

```text
task classification -> context/tool choice -> model/reasoning recommendation
        -> execution -> test/quality gate -> telemetry -> reviewed promotion
```

The classifier is advisory until the baseline and A/B benchmark satisfy the quality gates in `TOKEN_OBSERVABILITY_SPEC.md`. It must never silently switch a model, enable an MCP, or rewrite project instructions.

## Current implementation boundary

- Serena is the validated symbol-navigation source for internal code.
- Repomix is an explicit, on-demand repository snapshot mechanism.
- Current external documentation, GitHub retrieval, compression, RAG, cost routing and automatic compaction are not enabled.
- Project facts stay in their source of truth; a context pack links to facts rather than copying a whole subsystem.
