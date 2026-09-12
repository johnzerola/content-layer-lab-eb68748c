# Editor V2 — pesquisa e arquitetura

Data: 2026-09-11  
Status: pesquisa concluída; implementação ainda não iniciada.

Este diretório registra a investigação para evoluir o editor de vídeo sem quebrar o fluxo existente. O escopo é deliberadamente separado do Cleaner IA e da Fase 6 de preservação de pixels.

## Decisões de escopo

- Não substituir o editor atual nesta fase.
- Não alterar o contrato de renderização ou separação de áudio.
- Não copiar código, assets, identidade ou comportamento proprietário de produtos comerciais.
- Validar cada mudança em fixture, undo/redo, salvar/carregar, preview e exportação antes de promovê-la.

## Documentos

1. [Repositórios e referências](01-repositories.md)
2. [Matriz de licenças](02-license-matrix.md)
3. [Comparação de UX](03-ux-comparison.md)
4. [Arquitetura de timeline](04-timeline-architecture.md)
5. [Preview e render](05-preview-rendering.md)
6. [Transições e keyframes](06-transitions-keyframes.md)
7. [Sistema de legendas](07-caption-system.md)
8. [Sistema de áudio](08-audio-system.md)
9. [Performance](09-performance.md)
10. [Proposta Editor V2](10-proposed-editor-v2.md)

## Evidência local

- `editor-research/EDITOR_CURRENT_ARCHITECTURE.md` — auditoria estática do fluxo atual.
- `editor-research/state-graph.json` — grafo atual de estado e lacunas.
- `docs/design-research/DESIGN_INFRA_CURRENT_STATE.md` — tokens, stack e infraestrutura de validação.
- `docs/design-research/patterns/editor-v2-research.md` — cartões de padrões transferíveis.

Esta documentação não afirma comportamento de produção que não tenha sido observado em runtime.
