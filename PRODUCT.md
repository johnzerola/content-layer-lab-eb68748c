# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Criadores, equipes de conteúdo e operadores de social media que transformam vídeos brutos em publicações curtas e variações em lote. Eles precisam editar com precisão sem aprender uma ferramenta de pós-produção complexa e acompanhar trabalhos que podem continuar no servidor.

## Product Purpose

O VaiViral reúne criação, limpeza, edição, variações em lote, renderização e distribuição de vídeos sociais. Sucesso significa chegar de uma mídia bruta a um vídeo publicável com menos operações repetitivas, mantendo controle visual, previsibilidade e possibilidade de correção.

## Positioning

O produto combina um editor visual com fluxos de produção em lote e ferramentas de IA para limpeza, recorte, legenda e áudio no mesmo projeto. O documento do editor deve produzir a mesma composição na prévia, na persistência e na exportação.

## Operating Context

O uso principal ocorre em desktop, em sessões longas de edição, com biblioteca de presets, canvas, inspector e timeline multitrack. O produto também precisa permitir consulta e operações essenciais em telas estreitas. Trabalhos de mídia podem envolver processamento local, jobs de nuvem e ativos armazenados, mas o Editor V2 entra gradualmente por feature flag enquanto o editor atual permanece disponível.

## Capabilities and Constraints

- React, TanStack Router, Tailwind, Radix e Supabase compõem a base existente.
- `EditorProjectV2` é a fonte única de verdade do novo editor; mudanças persistentes passam pelo command bus e suportam undo/redo.
- Preview e exportação devem convergir para o mesmo documento e manifest de composição.
- Cleaner IA, render worker e Editor V1 não podem ser alterados por fases apenas visuais do Editor V2.
- Integrações externas e conteúdo remoto precisam preservar licença, atribuição e uso comercial no registry de ativos.
- A migração acontece por fases e feature flag, com evidência automatizada e visual antes de ampliar o rollout.

## Brand Commitments

O nome do produto é VaiViral. A linguagem é direta, profissional e em português. A interface deve parecer uma ferramenta criativa de produção, com identidade própria; CapCut e outros editores são referências de clareza e capacidade, não identidades para copiar.

## Evidence on Hand

- Direção de produto e interface: `docs/design/DIRECTION.md`.
- Pesquisa e arquitetura do Editor V2: `docs/editor-research/`.
- Contratos e baseline do Editor V2: `docs/editor-v2/`.
- Implementação atual protegida pela feature flag: `src/lib/editor-v2/` e `src/components/editor-v2/`.

Não há depoimentos, métricas comerciais ou aprovação pública de qualidade visual que possam ser inventados em novas telas.

## Product Principles

1. O vídeo e a tarefa atual devem dominar a atenção.
2. Ações complexas precisam de estado visível, recuperação e undo/redo.
3. Automação reduz repetição sem esconder o que será aplicado.
4. Preview, timeline, persistência e exportação compartilham o mesmo contrato.
5. Novas capacidades entram gradualmente e só avançam com testes e evidência.

## Accessibility & Inclusion

Controles essenciais devem funcionar por teclado, manter foco visível, comunicar estado sem depender apenas de cor, respeitar movimento reduzido e preservar leitura e operação em zoom de navegador e viewport estreito.
