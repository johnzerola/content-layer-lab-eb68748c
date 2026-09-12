# ChatScene — MCP / Tooling Matrix

Última verificação: 2026-09-12.

| Ferramenta | Status | Decisão | Observação |
| --- | --- | --- | --- |
| Context7 (upstash/context7) | NOT_AVAILABLE | pendente | Não aparece como conector nem como MCP de aplicativo neste workspace. Documentação externa vem de busca web + remotion-docs. Reavaliar com o aplicativo de desktop da Lovable. |
| Playwright (microsoft/playwright-mcp) | ON_DEMAND | CLI preferido | Playwright já está instalado no ambiente e é acionado por script. Menor custo de contexto que o MCP. MCP só se precisarmos de sessão persistente/exploração interativa. |
| Figma MCP | NOT_CONNECTED | opcional | Exige o aplicativo de desktop da Lovable + Dev Mode no Figma. Não bloqueia o ChatScene. |
| Lovable MCP Server | EXISTING | já no projeto | `src/lib/mcp/` expõe o servidor `video-creator-suite`. Não duplicar. |
| Sentry | NOT_AVAILABLE | pendente | Sem conector aqui; integração manual exigiria um DSN. |
| Plugins Remotion para Codex/Claude Code | NOT_APPLICABLE | — | São plugins de outros clientes de IA, não deste ambiente. O conhecimento equivalente já vem das Agent Skills oficiais. |

## Regras de uso

- `EXTERNAL_LIBRARY_DOCS` → documentação oficial / remotion-docs / busca web.
- `PROJECT_CODE` → arquivos locais e conhecimento do projeto.
- Nenhum MCP pesado fica ligado sem necessidade.
