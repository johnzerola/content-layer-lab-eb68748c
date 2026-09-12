# Baseline do editor — Phase 0

Data: 2026-09-11. Fonte: inspeção estática local, testes existentes e fixture determinística. Produção não foi alterada.

## Funcionalidades observadas

- launcher de projeto, upload para storage e reabertura por projeto;
- preview com proxy/original;
- preedit com segmentos, velocidade, crop, layout, cor e transições;
- timeline com layers, segmentos, seleção aditiva, trim, split, zoom e waveform;
- captions, templates, keyframes, efeitos e áudio em painéis especializados;
- persistência do documento V1 na coluna JSON de `projects`;
- render por canvas/worker e mixagem de áudio.

## Limitações estruturais

- `preedit`, `composition`, `audio`, captions e seleção não compartilham uma única fronteira de histórico;
- `useEditorHistory` cobre superfícies específicas, não uma transação completa;
- tempo da fonte e tempo compacto dos segmentos têm helpers, mas não um `CompositionClock` comum;
- stems podem ser persistidos como data URL, aumentando o documento;
- preview, save e export possuem contratos relacionados, porém ainda não há revisão única comprovando que renderizaram o mesmo estado.

## Baseline comportamental

| Fluxo | Evidência atual | Estado |
|---|---|---|
| save/load | `EditorProjectDoc` é salvo integralmente em `projects.data` | inspecionado; fluxo autenticado pendente |
| playback | HTML video + mapeamento `srcTimeAt`/`outputTimeAtSrc` | inspecionado |
| split/trim | helpers V1 e callbacks da timeline | testes V2 adicionados; V1 não alterado |
| undo/redo | histórico local existente | inspecionado; fronteira limitada |
| export | worker/render-template e manifest atual | testes existentes; MP4 não reproduzido nesta fase |

## Divergências e bugs conhecidos

- risco de legenda/canvas usar revisão diferente do projeto salvo;
- remoção de intervalos depende de todos os consumidores adotarem o mesmo time map;
- waveform faz fetch/decode por URL no cliente e precisa cache durável;
- data URLs de áudio podem exceder o tamanho prático do JSON;
- falha de salvamento já foi observada na interface fornecida pelo usuário; causa de produção não foi reexecutada aqui.

## Performance

Não há medição reproduzível de produção nesta fase. O baseline não inventa números. A Phase 1 deve medir abrir projeto, seek, drag, save e primeiro preview com cache frio/quente.

## Fixtures e artefatos

- `editor-research/benchmarks/fixtures/editor-v2-project.json`;
- `editor-research/benchmarks/fixtures/editor-v2-reference-manifest.json`;
- screenshots locais da Library são gerados após o build em `output/playwright/editor-v2-phase0/`.

O manifesto é explicitamente `CONTRACT_ONLY_NO_MEDIA_EXPORT`. Nenhum MP4 foi apresentado como export validado sem uma fixture licenciada e execução autenticada.
