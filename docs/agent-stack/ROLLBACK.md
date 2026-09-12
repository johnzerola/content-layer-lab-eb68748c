# Rollback

## Serena

1. Remove the `[mcp_servers.serena]` block from `.codex/config.toml`, or restore `.codex/config.toml.pre-agent-efficiency-stack-20260911.bak`.
2. Restart Codex and confirm `codex mcp list` no longer shows `serena`.
3. Optional user-level removal: `python -m uv tool uninstall serena-agent`.
4. Optional local cleanup: remove ignored `.serena/` only after confirming no useful local memories need to be preserved.

## Repomix

No project installation was made. Stop using the pinned `npx` command. Delete any intentionally generated bundle through normal review procedures.

## Deferred integrations

Context7 and GitHub MCP have no configuration or credentials to roll back.
