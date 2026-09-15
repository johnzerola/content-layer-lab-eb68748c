# MCP activation policy

| Classification | MCPs | Rule |
| --- | --- | --- |
| ALWAYS_AVAILABLE | Serena | Symbol retrieval before broad file reads when appropriate. |
| ON_DEMAND | Playwright, Chrome DevTools, Cleaner research, Editor research | Configure project-wide, invoke only for a matching task. |
| BLOCKED | Context7, GitHub MCP | Not configured; require credentials, least-privilege review and smoke test. |
| DISABLED | unreviewed MCPs | No configuration or tool schema. |

An MCP must have a purpose, owner, version/source, least privilege, rollback path, and benchmark evidence before promotion. Tool schemas are not enabled merely for future convenience.

Repomix is an on-demand CLI, not an MCP. Cleaner-specific categories and routing are recorded in [MCP-INVENTORY.md](../cleaner-engineering/MCP-INVENTORY.md).
