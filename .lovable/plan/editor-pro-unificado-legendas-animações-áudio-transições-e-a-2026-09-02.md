# Editor Pro unificado — legendas, animações, áudio, transições e a UI do estúdio

Objetivo: o editor profissional (`/projects/:id/editor/:videoId`) passa a ser o único editor, absorvendo todas as funções do Estúdio de edição atual (corte, enquadrar, layout, ajustes de cor, IA Motion, mixagem, títulos, keyframes, cortar pausas) e ganhando o que falta: biblioteca grande de legendas, animações controláveis, trilha de áudio com narração e acervo de transições — com a mesma linguagem visual (ícones, botões, cores, tipografia) já usada hoje.

## O que muda na tela

```text
┌──────────────────────────────────────────────────────────────────────┐
│ VaiViral · nome · desfazer/refazer · salvo · 9:16 · Aplicar em lote  │
├────────────┬───────────────────────────────────┬─────────────────────┤
│ FERRAMENTAS│                                   │  Painel contextual  │
│ Corte      │                                   │  (muda com a        │
│ Enquadrar  │            PALCO                  │   ferramenta ativa) │
│ Transições │        (preview fixo)             │                     │
│ ─ DESIGN ─ │                                   │  Templates · Texto  │
│ Layout     │                                   │  Formas · IA        │
│ Ajustes    │                                   │  Filtros · Brand Kit│
│ IA Motion  │                                   │  Animação           │
│ ─ ÁUDIO ─  │                                   │                     │
│ Legendas   ├───────────────────────────────────┴─────────────────────┤
│ Mixagem    │ agulha ▏ régua/zoom ▏ tesoura ▏ keyframe                │
│ Títulos    │ ▪ vídeo  ▪ legenda  ▪ texto  ▪ forma  ▪ áudio (coloridas)│
└────────────┴─────────────────────────────────────────────────────────┘
```

Barra de ferramentas à esquerda igual à do estúdio atual (mesmos ícones, mesmos grupos: Ferramentas / Design / Áudio & Texto), palco central fixo, painel contextual à direita e timeline colorida embaixo ocupando a largura toda.

## Entregas, na ordem

1. **Shell unificado** — barra de ferramentas lateral, abas Texto/Estilos, painel direito contextual e rodapé de timeline, reaproveitando os componentes de UI já existentes (botões, tabs deslizantes, tooltips, glass, motion Aurora). Nada de tela nova "parecida": os mesmos componentes base.
2. **Funções migradas do estúdio** — Corte (início/fim, ir para início/fim, cortar pausas com sensibilidade e pausa mínima), Enquadrar (proporção, terços, área segura, comparar), Layout, Ajustes de cor + estilos de edição (Cinemático, VHS, Noir…), IA Motion, Títulos e keyframes. Cada uma vira um painel contextual do editor pro, chamando as mesmas funções já existentes (`preedit.ts`, `looks.ts`, `draw.ts`) — sem reescrever a lógica de vídeo.
3. **Legendas: 73 estilos já prontos + workbench** — painel de Estilos com busca, filtros por categoria e prévia animada (já implementado) integrado ao editor pro, mais a aba Texto com a transcrição editável, corretor, localizar/substituir e "cortar vídeo ao remover palavra".
4. **Timeline estilo CapCut** — trilhas coloridas por tipo com nome, olho, cadeado e mudo; arrastar e redimensionar clipes (já feito), snap na agulha, tesoura (S) dividindo no playhead, régua com zoom e time-code, marcadores de entrada/saída de animação arrastáveis.
5. **Animações** — painel de animação por camada com efeito, início, fim, duração, velocidade, direção, curva e prévia no palco (já feito no editor de template) trazido para o editor pro, e refletido no render.
6. **Áudio** — nova trilha no documento do projeto: música de fundo (upload), volume, fade in/out, ducking sob a fala, silenciar/substituir o áudio original, gravação pelo microfone e narração por IA em pt-BR. Clipes de áudio aparecem na timeline como qualquer outra camada.
7. **Transições** — 14 tipos já implementados, agrupados por categoria com prévia e duração ajustável, aplicáveis no ponto de corte entre clipes direto na timeline.
8. **Templates e Brand Kit** — galeria de templates e Brand Kit (logo, cores, tipografia) disponíveis no painel direito do editor pro, aplicando marca nas camadas.

## Notas técnicas

- `EditorProjectDoc` ganha `audio: { tracks: AudioClip[]; originalMuted: boolean; duckUnderSpeech: boolean }` e `tools: { crop, frame, grade, keys }` — o registro já é JSONB, então **não é preciso migração de banco**.
- Ferramentas migradas reutilizam `src/lib/preedit.ts`, `src/lib/looks.ts`, `src/lib/draw.ts` e `src/lib/encode-presets.ts`; nenhuma linha de lógica de render é reescrita, apenas chamada a partir do novo shell.
- Áudio usa `src/lib/audio-track.ts` (Web Audio) para decodificar/mixar e a exportação WebCodecs/AAC existente; ducking é envelope de ganho calculado a partir das palavras da transcrição.
- Narração por IA: nova server function autenticada chamando o endpoint de fala da IA da Lovable (streaming, vozes pt-BR), áudio salvo no storage privado do usuário. Nenhuma chave no navegador.
- Fontes por `<link>` no root (já feito), nunca `@import` no CSS.
- Sem mudanças em publicação, planos, créditos, RLS ou rotas existentes. O editor antigo continua acessível até o unificado cobrir 100% das funções, e então vira um atalho para o novo.
- Validação a cada etapa: typecheck, build, a suíte de testes atual e verificação da tela em 1366×768 e mobile.
