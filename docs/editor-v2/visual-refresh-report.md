# Editor V2 — atualização visual e de interação

Data: 13/09/2026

## Resultado

O shell do Editor V2 recebeu uma linguagem visual mais viva e própria do VaiViral, mantendo a composição e os comandos existentes. O vídeo continua sendo o foco principal; biblioteca, inspector e timeline ganharam separação de profundidade e estados mais fáceis de reconhecer.

## Mudanças

- fundo grafite com aurora violeta e ciano concentrada no palco de prévia;
- cabeçalho e barra de status translúcidos, com contraste e contorno definidos;
- cards da biblioteca com elevação curta, borda luminosa e seleção persistente;
- botões principais com gradiente da marca, resposta ao hover, clique e teclado;
- tabs com marcador ativo e brilho localizado;
- canvas com halo de foco e grade funcional para posicionamento;
- timeline com superfície própria, trilhas destacadas no hover e cores por papel: vídeo, legenda, voz e música;
- campos com feedback imediato de foco;
- animações curtas respeitando `prefers-reduced-motion`.

## Validação

- TypeScript: passou com `npx tsc --noEmit`;
- editor: 39 testes passaram;
- ESLint: passou;
- build de produção: passou;
- fluxo criativo automatizado: passou, sem erro de console;
- QA visual em 1440×1000 e 430×900: passou, sem overflow global e com foco visível por teclado;
- detector Impeccable: os avisos de texto em gradiente e bounce pertencem a estilos anteriores; a grade detectada nesta alteração está restrita ao canvas de posicionamento.

## Duplicação, animações e looks rápidos

- `Duplicar` posiciona a cópia imediatamente após a seleção, evitando a sobreposição anterior de 0,2 s;
- a nova cópia fica selecionada, a agulha avança para seu início e toda a operação continua reversível por undo/redo;
- legendas duplicadas recebem novos cues, novos IDs de palavras e tempos deslocados em conjunto;
- o painel de animação usa cartões visuais para Entrada, Saída e Loop, com indicador de etapa ativa e controles de duração/intensidade;
- o painel Ajuste oferece Natural, Vibrante, Retrato, Cinema, Neon, Dourado, Urbano e P&B;
- os 13 controles manuais permanecem disponíveis em uma seção recolhível.

Validação desta ampliação: 41 testes do Editor V2, TypeScript, lint dos arquivos alterados, fluxo Playwright e build de produção passaram. O lint global permanece bloqueado por `prefer-const` em `src/integrations/supabase/previewAuthStorage.ts`, uma falha externa a esta alteração.

## Evidências

- `output/playwright/editor-v2-visual-refresh/desktop-1440x1000.png`
- `output/playwright/editor-v2-visual-refresh/narrow-430x900.png`
- `output/playwright/editor-v2-visual-refresh/narrow-430x900-library.png`
- `output/playwright/editor-v2-creative/duplicate-adjacent.png`
- `output/playwright/editor-v2-creative/animation-presets.png`
- `output/playwright/editor-v2-creative/adjustment-presets.png`

O botão de exportação continua desabilitado conforme o estágio funcional atual do Editor V2. Esta atualização não altera Cleaner, render worker, banco de produção nem Editor V1.
