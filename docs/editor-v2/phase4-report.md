# Editor V2 — relatório da Fase 4

Data: 13/09/2026

Estado: **IMPLEMENTED_AND_VALIDATED_BEHIND_FEATURE_FLAG**

## Entrega

- registry de templates com `TemplateDoc` tipado e validação de preview;
- quatro templates originais com previews derivados das camadas reais;
- aplicação multicalmada em um comando com undo/redo atômico;
- oito presets de legenda com estilos, posições, modos line/word/karaoke e motion;
- cues e palavras temporizadas persistidos no projeto;
- destaque da palavra ativa no canvas;
- aplicação de preset sobre a legenda selecionada sem duplicá-la;
- edição textual sincronizada com cue e palavras;
- captions e templates incluídos no manifesto compartilhado de renderização;
- suporte a `prefers-reduced-motion` nos movimentos de legenda.

## Evidência

- TypeScript: aprovado;
- ESLint no escopo Editor V2: aprovado;
- testes direcionados: 31 aprovados;
- suíte principal de `src/lib`, excluindo worktrees auxiliares: 45 arquivos e 298 testes aprovados;
- build de produção: aprovado;
- Playwright desktop/mobile: aprovado, sem erros de console;
- inspeção visual das três capturas: aprovada.

Capturas em `output/playwright/editor-v2-phase4/`.

A tentativa inicial sem exclusão também coletou uma worktree histórica em `.codex/worktrees/cleaneria-scene-v3`: 563 testes passaram e dois testes antigos do ciclo RunPod falharam por expectativa `scene-roi-v3` diante da revisão atual `scene-roi-v4`; houve ainda erro TLS em teste de publicação. A repetição limitada ao código principal passou integralmente. Esses resultados externos foram preservados e não foram tratados como regressão do Editor V2.

## Limites honestos

O encoder final continua reservado à Fase 6. Transcrição automática, importação SRT/VTT, ajuste manual de cada palavra e tradução não fazem parte deste incremento. A Fase 4 entrega o documento e as interações necessárias para essas integrações sem criar um segundo estado paralelo.
