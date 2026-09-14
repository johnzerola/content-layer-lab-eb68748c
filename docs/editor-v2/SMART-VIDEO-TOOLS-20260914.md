# Editor V2 — ferramentas inteligentes de vídeo

Data: 14/09/2026  
Estado: **IMPLEMENTADO E VALIDADO LOCALMENTE; PUBLICAÇÃO PENDENTE**

## Entrega

- câmera lenta de `0,10×` a `4×`, com atalho visual para `0,50×`;
- corte automático dos vídeos selecionados por intervalo configurável de `0,25 s` a `60 s`;
- corte automático registrado como uma única ação de undo/redo;
- reprodução visual reversa;
- espelhamento horizontal e vertical;
- badges de velocidade, reversão e espelhamento diretamente no clipe;
- cores próprias para vídeo, sobreposição, legendas, voz, música e efeitos sonoros;
- preservação do vínculo do áudio incorporado depois de dividir o vídeo;
- o áudio incorporado é silenciado em clipes revertidos, enquanto voz e música extraídas permanecem independentes;
- preview, persistência e manifest de exportação compartilham `playbackRate`, `reversed`, `flipHorizontal` e `flipVertical`.
- prévia e exportação aplicam a mesma alteração de velocidade e tom ao áudio; preservação de tom fica reservada para uma futura etapa de time-stretch com qualidade validada.

## Comportamento do corte automático

1. O usuário seleciona um ou mais vídeos.
2. Abre **Cortes automáticos** na barra da timeline.
3. Informa o intervalo ou escolhe `1 s`, `2 s`, `3 s` ou `5 s`.
4. O comando cria segmentos contínuos, sem perder intervalos da fonte.
5. `Ctrl+Z` restaura todos os clipes selecionados em uma única ação.

O comando também preserva keyframes pertencentes a cada trecho, referências de templates, transições na última borda e o grupo de áudio da mídia.

## Validação

- TypeScript: passou sem erros;
- ESLint nos arquivos alterados: passou;
- suíte completa: `49` arquivos e `330` testes passaram;
- QA no Chrome: importação, corte de `6,5 s` a cada `2 s`, undo, espelhamentos, reversão, câmera lenta e ausência de erros no console passaram;
- build de produção: passou.

Evidência visual local: `output/playwright/editor-v2-smart-tools/editor-v2-smart-video-1440x1000.png`.

## Próximos incrementos para uma timeline profissional

1. seleção por caixa, grupos e aplicação de propriedades em lote;
2. ripple em todas as trilhas vinculadas e modos inserir/sobrescrever;
3. rampas de velocidade com curvas e congelamento de quadro;
4. interpolação de câmera lenta por fluxo óptico como processamento opcional;
5. miniaturas adaptativas ao zoom e waveform por níveis de detalhe;
6. cache/proxy específico para exportação reversa longa;
7. menus contextuais, marcadores, regiões e navegação quadro a quadro;
8. atalhos configuráveis e mapa de conflitos de teclado.

Esses incrementos devem continuar sobre o mesmo documento do Editor V2 para evitar divergência entre timeline, preview e exportação.
