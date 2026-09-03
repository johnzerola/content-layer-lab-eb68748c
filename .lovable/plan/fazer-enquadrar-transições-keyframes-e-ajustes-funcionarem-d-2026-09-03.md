# Fazer Enquadrar, Transições, Keyframes e Ajustes funcionarem de verdade

## O que está acontecendo hoje

A prévia central do editor profissional é a tag de vídeo original com as camadas de texto por cima. Ela ignora completamente as configurações de recorte, giro, espelho, keyframes de zoom, transições e correção de cor — esses valores ficam guardados no projeto e só são aplicados na hora de exportar o MP4.

Resultado: você mexe nos painéis e nada muda na tela, então parece que nada funciona.

Além disso, na exportação:
- recorte, keyframes de zoom, correção de cor e transições **são** aplicados;
- giro (90/180/270), espelho horizontal/vertical e o fundo do layout (desfoque/cor) **não são** aplicados — ou seja, esses três realmente não funcionam nem no vídeo final.

## O que será feito

### 1. Prévia igual ao vídeo final
Trocar a prévia por um palco desenhado quadro a quadro com o mesmo motor usado na exportação. O vídeo passa a ser desenhado com recorte, zoom por keyframes, giro, espelho, fundo (desfoque/cor), correção de cor, efeitos e transições aplicados ao vivo. As camadas de texto/stickers continuam editáveis por cima, com seleção e arraste como hoje.

### 2. Enquadrar realmente funcional
- Presets de proporção passam a mudar a prévia na hora.
- Giro e espelho passam a valer na prévia **e** no MP4 exportado.
- Retângulo de recorte manipulável direto no palco: arrastar para mover, alças para redimensionar, botão de restaurar.

### 3. Transições visíveis
- Entrada, saída e emendas entre trechos aparecem animadas na prévia.
- Botão "Prévia" reproduz o trecho da transição em vez de só pular o cursor.
- Ao clicar na marca de emenda na timeline, o painel abre já naquela emenda selecionada.

### 4. Keyframes com feedback real
- O zoom/posição interpolado entre keyframes aparece na prévia enquanto o vídeo roda.
- Marcadores da timeline ficam clicáveis (ir para o keyframe) e removíveis.
- Indicação do keyframe ativo no momento do cursor.

### 5. Ajustes (cor) ao vivo
- Presets e sliders de brilho, contraste, saturação, matiz, temperatura, vinheta, granulado e desfoque passam a alterar a imagem na prévia imediatamente.
- "Restaurar ajustes" volta tudo ao original.

### 6. Conferência final
Renderizar um clipe curto com recorte + giro + espelho + keyframe + transição + ajuste de cor e comparar com a prévia, para garantir que o que aparece na tela é o que sai no arquivo.

## Detalhes técnicos

- Novo componente de palco (canvas 9:16) que reutiliza `cropRect`, `cropAt`, `preEditFilter`, `transitionAt`, `segmentTransitionAt`, `composeTransitions` de `src/lib/preedit.ts` e `drawTemplateFrame` de `src/lib/editor/render-template.ts`, mantendo o vídeo em elemento oculto como fonte.
- `src/routes/projects.$projectId.editor.$videoId.tsx`: substituir a tag de vídeo visível pelo novo palco, mantendo `EditorCanvas` como camada de interação (fundo transparente).
- `src/lib/editor/render-template.ts`: aplicar `pre.rotate` (via `rect.quarter`), `pre.flipH`/`pre.flipV` e o fundo do layout no desenho do frame, alinhando com `src/lib/draw.ts`.
- Overlay de recorte interativo escrevendo em `pre.crop` (e no keyframe ativo, quando houver) via `patchPre`, com debounce para não poluir o histórico.
- Sem mudanças de schema, rotas ou APIs; nenhuma alteração no fluxo de publicação.
