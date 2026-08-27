# Editor de vídeo estilo CapCut: UX mais leve e fácil

Foco: deixar o editor (VideoStudio) rápido de entender e de usar, com corte simples, transições prontas entre os cortes e um fluxo guiado. O editor hoje tem 10 abas de ferramentas e muitos controles soltos; a proposta reorganiza em vez de reescrever.

## O que muda para quem usa

### 1. Barra de ferramentas enxuta
As 10 abas atuais (Corte, Layout, Recorte, Câmera, Keys, Transição, Cor, Legendas, Texto, Áudio) viram 5 grupos claros:
- **Cortar** (corte, segmentos, remover silêncio)
- **Enquadrar** (layout, recorte, câmera dinâmica, keyframes)
- **Estilo** (cor, presets, transições)
- **Texto** (legendas + texto livre)
- **Áudio** (volume, música, separação de voz)

Grupos avançados (keyframes, câmera) ficam recolhidos dentro do grupo, não competindo com o básico.

### 2. Modo Simples vs. Modo Avançado
Um interruptor no topo. No **Simples** aparecem só: cortar, escolher formato, um preset de estilo, legenda automática e exportar. No **Avançado** aparece tudo. O padrão para quem entra pela primeira vez é Simples.

### 3. Transições prontas entre cortes
Hoje só existe transição de abertura e de saída do clipe. Passa a existir transição **entre segmentos** do corte multi-trecho:
- Na timeline, entre dois segmentos aparece um botão redondo "+"; clicando, abre uma galeria de transições prontas (Fade, Zoom, Subir, Deslizar, Whip, Corte seco) com miniatura animada e duração ajustável (0,2s / 0,4s / 0,8s).
- "Aplicar em todos os cortes" com um clique.
- A prévia e a exportação respeitam a transição escolhida.

### 4. Timeline mais direta
- Arrastar as bordas de um segmento para aparar, arrastar o meio para mover.
- Botão de dividir no cursor (tecla S), apagar segmento (Delete), duplicar.
- Zoom da timeline e snap nas bordas/cursor.
- Régua de tempo legível e cabeçalho de trilhas (vídeo / áudio / legenda).

### 5. Onboarding e ajuda
- Primeira visita: 4 dicas curtas em balões ("corte aqui", "escolha o formato", "gere legendas", "exportar").
- Painel "Atalhos" (tecla ?) com a lista: espaço = play, S = dividir, Delete = apagar, ⌘Z / ⌘⇧Z = desfazer/refazer, ←/→ = quadro a quadro.
- Cada ferramenta ganha uma linha de explicação em linguagem simples.

### 6. Leveza
- A prévia deixa de redesenhar em todo frame quando está pausada; volta a animar só ao tocar ou arrastar.
- Controles pesados (sliders de cor, câmera) só montam quando o grupo está aberto.
- Debounce nos sliders para não recalcular o canvas a cada pixel arrastado.

## Detalhes técnicos

- `src/lib/preedit.ts`: adicionar `transitions: Transition[]` associado às junções entre `segments` (índice i = junção entre segmento i e i+1) e uma função `segmentTransitionAt(pre, t)` que devolve alpha/scale/dx/dy nas bordas dos cortes, reutilizando o `apply()` já existente.
- `src/lib/draw.ts` (`drawFrame`): compor o resultado de `transitionAt` com o de `segmentTransitionAt`, mesmo contrato de retorno, sem mudar assinatura pública.
- `src/lib/encode.ts` e `src/lib/render.ts`: já chamam `drawFrame` por frame, então herdam as transições sem mudança de pipeline; só ajustar o mapeamento tempo de saída → tempo de origem para incluir o overlap da transição.
- `src/components/VideoStudio.tsx`: reorganizar `TOOL_GROUPS`/`Tab` nos 5 grupos, adicionar estado `mode: "simples" | "avancado"` persistido em `localStorage`, extrair os painéis grandes (cor, câmera, áudio) em subcomponentes com carregamento preguiçoso.
- `src/components/EditorTimeline.tsx`: handles de aparo, split/delete/duplicar, zoom, snap e o botão de transição entre segmentos.
- Novo `src/components/editor/TransitionPicker.tsx` para a galeria de transições.
- Testes em `src/lib/__tests__/pure.test.ts` para `segmentTransitionAt` (curva, duração, borda sem transição).

## Fora deste plano

Os pedidos anteriores sobre Facebook/Instagram (listar Páginas, escolher Página ativa, tela "Minhas contas" com múltiplas contas, publicação real na Page) ficam para um plano seguinte, para não misturar frentes.
