# Editor pro: legendas, animações, áudio e transições

Objetivo: deixar o editor profissional (`/projects/:id/editor/:videoId`) no nível do editor de referência + CapCut: aba de Texto (transcrição) e aba de Estilos com biblioteca grande de legendas, animações controláveis na timeline colorida, trilha de áudio (música de fundo, troca de áudio, narração própria ou gerada por IA) e acervo de transições com corte por agulha.

## Estado atual (verificado)

- Transcrição editável já existe (`TranscriptPanel`), com palavras e cenas.
- Biblioteca de legendas tem apenas 14 presets em 10 categorias (`caption-styles.ts`).
- Transições: apenas 5 tipos (`preedit.ts` / `TransitionPicker`).
- Timeline (`TimelinePro`) mostra clipes por camada, zoom, split e seek — mas sem arrastar/redimensionar clipe, sem trilha de áudio e sem marcadores de animação.
- Tipos de template já suportam `animationIn/Out/Loop` (`AnimationSpec`), mas não há UI para configurar.
- Áudio: existe decodificação e mixagem (`audio-track.ts`), sem música de fundo nem narração. Não há TTS no projeto.

## O que será feito

### 1. Biblioteca de legendas (60+ estilos)
- Ampliar `caption-styles.ts` de 14 para 60+ presets cobrindo as categorias já existentes (impacto, viral, karaokê, podcast, notícias, gaming, minimalista, business) mais novas: "cinema", "retro", "3D/sombra dura", "neon", "manuscrito".
- Cada preset ganha animação por palavra (pop, bounce, slide, glow, typewriter, wave) e fonte real carregada por Google Fonts (Anton, Montserrat, Bebas Neue, Playfair, Luckiest Guy, Archivo Black, Inter, Poppins).
- Painel de estilos com busca, filtro por categoria e prévia animada em miniatura, como na referência.
- Base: presets próprios do VaiViral inspirados em padrões open source de legendas (estilo Captions/Submagic/CapCut), sem copiar assets nem código de terceiros.

### 2. Corretor e controle do texto
- Aba Texto: substituir/localizar já existe; adicionar "cortar vídeo ao remover palavra" e cortes por palavra ligados à timeline.

### 3. Animações com controle de tempo
- Painel de Animação por camada: entrada, saída e loop, com duração, delay, easing e prévia.
- Marcadores de entrada/saída desenhados no clipe da timeline, arrastáveis para ajustar tempo.
- Renderização respeita as animações na exportação.

### 4. Timeline estilo CapCut
- Trilhas coloridas por tipo (vídeo, legenda, texto, forma, áudio) com nome, olho (visível), cadeado e mudo.
- Arrastar clipe, redimensionar bordas, snap na playhead, agulha de corte (tecla S / botão tesoura) que divide o clipe no playhead.
- Régua com zoom, tempo total e time-code.

### 5. Áudio: música, troca e narração
- Nova trilha de áudio no documento do editor: música de fundo (upload), volume, fade in/out, ducking automático sob a fala.
- Substituir/silenciar o áudio original do vídeo.
- Narração: gravar pelo microfone no navegador ou gerar por IA (vozes em pt-BR) a partir do texto do roteiro, inserida como clipe na trilha.
- Acervo inicial de músicas livres (Creative Commons/CC0) para uso comercial, carregadas sob demanda.

### 6. Transições
- Ampliar de 5 para ~40 transições (fade, dissolve, slides, zoom in/out, whip pan, glitch, blur, wipes, spin, luma), agrupadas em categorias com prévia.
- Aplicar transição no ponto de corte entre clipes na timeline.

### 7. Templates prontos
- A galeria de templates existente ganha as novas legendas/animações; templates próprios continuam salvos em "Meus".

## Ordem de entrega

1. Biblioteca de legendas + fontes + prévia animada.
2. Timeline com arrastar/redimensionar, agulha de corte e trilhas coloridas.
3. Painel de animações com marcadores na timeline.
4. Trilha de áudio: música de fundo, troca de áudio, gravação e narração por IA.
5. Acervo de transições ampliado.

## Notas técnicas

- Legendas e animações ficam em `src/lib/editor/caption-styles.ts` e `src/lib/video-template/types.ts` (`AnimationSpec` já existente), aplicadas no canvas e no `render-template.ts`.
- Áudio usa `audio-track.ts` (Web Audio) para mixagem e a exportação WebCodecs/AAC já existente.
- Narração por IA usa a IA da Lovable (endpoint de fala) chamada por server function autenticada; nada de chave no navegador.
- Fontes carregadas por `<link>` no root, não por `@import` no CSS.
- Nada de lógica de publicação, planos ou banco é alterado; migrações apenas se a trilha de áudio precisar de campo novo no documento (é JSONB, então provavelmente nenhuma).
