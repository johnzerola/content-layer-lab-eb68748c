# Editor V2 — Fase 1: shell e experiência de edição

Data: 13/09/2026
Estado: **IMPLEMENTADA E VALIDADA LOCALMENTE; FEATURE FLAG MANTIDA; SEM DEPLOY**

## Resultado

A rota isolada `/editor-v2` agora apresenta uma bancada de edição completa: barra superior, Library, canvas, inspector e timeline multitrack. Os três painéis do desktop e a altura da timeline são redimensionáveis. Em viewport estreito, as quatro áreas viram superfícies alternáveis para preservar operação e leitura.

O documento `EditorProjectV2` continua sendo a fonte de verdade. Seleção, inserção, transformação, trim, movimento, split, exclusão, snapping e ripple passam pelo `EditorCommandBus`. A seleção é a mesma no canvas, timeline, Library e inspector; não há um segundo documento visual.

## Implementado

- canvas temporal para texto, legenda, forma e presets simples;
- seleção visual, handles de resize, rotação no inspector, opacidade e guias de centro/área segura;
- inserção determinística por botão ou drag/drop da Library;
- timeline com vídeo, sobreposição, legenda, voz, música e efeitos sonoros;
- ruler, playhead, playback, seek, zoom, rolagem horizontal, trim, split, delete, seleção múltipla e snapping;
- ripple para remoção, trim e mudança entre trilhas;
- inspector contextual de transformação, texto, alinhamento, cor e tempo;
- estados vazio, indisponível, erro recuperável no rodapé e ação desabilitada de exportação;
- shell responsivo e atalhos globais protegidos contra campos de texto.

## Contratos preservados

- Editor V1 e suas rotas não foram substituídos;
- Cleaner, jobs, download, providers externos, banco e render worker não foram alterados;
- a Library continua local e registra origem/licença;
- `VITE_EDITOR_V2_ENABLED` e `EDITOR_V2_ENABLED` continuam controlando acesso;
- não houve commit, push, publicação Lovable ou deploy.

## Testes

- 18 testes unitários do Editor V2: documento, relógio, comandos, ripple, seleção, undo/redo, Library, snapping, inserção e feature flag;
- automação de navegador em Chrome real: drag/drop, sincronização de seleção, inspector, undo/redo visual, trim, seleção múltipla, Delete, playback/Espaço e resize de painel;
- quatro capturas determinísticas: 1440×1000, 1920×1080, 1366×768 e 430×932;
- nenhum erro de console na execução final;
- TypeScript e lint direcionado sem erros.

## Limitações conhecidas

- mídia real, thumbnails extraídas e waveform de áudio calculada pertencem à fase de assets/performance; a waveform atual é uma indicação visual para clipes de áudio;
- os presets internos são previews programáticos reproduzíveis, ainda sem pacotes remotos;
- efeitos e transições incompatíveis informam que precisam de um clipe/contexto; a aplicação destrutiva não foi simulada;
- rotação é editável no inspector; handle de rotação no canvas é somente indicação nesta fase;
- o botão Exportar permanece desabilitado até o adaptador de manifest/exportação ser validado;
- não há persistência em nuvem nesta fase.

## Recomendação para a Fase 2

Ligar mídia real ao asset registry, gerar proxies/thumbnails/waveforms em worker, adicionar controles de trilha (mute/solo/lock), mover clipes entre trilhas com validação de compatibilidade e conectar o mesmo documento a um manifest de preview/export. Keyframes por propriedade devem entrar depois que esse manifest tiver testes de paridade.
