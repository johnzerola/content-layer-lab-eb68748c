# Redesign VaiViral — nível Apple/Airbnb, sem quebrar nada

Objetivo: renovar toda a interface (visual, usabilidade, feedback e animação) trocando apenas camada de apresentação. Nenhuma regra de negócio, rota, API, tabela ou nome de componente muda — só tokens de estilo, classes e wrappers visuais.

## Direção visual escolhida

- Paleta: azul-escuro/preto profundo com acentos vermelho, roxo e violeta — sensação de IA, tecnologia e redes sociais (Meta/TikTok).
  - Base: `#05070f` (fundo), `#0b1020` (superfície), `#141b33` (superfície 2)
  - Primário: violeta elétrico `#7c5cff`
  - Acento social: rosa/vermelho `#ff3d6e` + ciano TikTok `#25f4ee` (só em detalhes)
  - Estados: sucesso verde-menta discreto, alerta âmbar, erro vermelho
- Tipografia: Outfit (títulos) + Figtree (texto), carregadas via `<link>` no root.
- Layout: dashboard denso — sidebar de ferramentas, topo com contexto/ações, painéis modulares com densidade controlada (modo Compacto/Confortável).

## Fases

### Fase 1 — Fundação de design (base de tudo)
- Reescrever tokens em `src/styles.css`: cores em oklch, gradientes (aurora sutil), sombras em camadas, raios, elevação, foco visível acessível.
- Manter os temas por ferramenta (`.theme-lote`, etc.) mas rederivados da nova paleta, cada ferramenta com um matiz próprio dentro da família azul/roxo/vermelho.
- Escala tipográfica e de espaçamento consistente; densidade em variável CSS.
- Curvas de movimento padrão (`--ease-out-expo`, `--ease-spring`) e durações (120/200/320ms) + respeito a `prefers-reduced-motion`.

### Fase 2 — Componentes base (shadcn variants)
- Botões: estado hover/press com escala e brilho, loading com spinner interno, sucesso com check animado.
- Inputs/selects/sliders: foco com halo, validação inline animada.
- Cards/painéis: vidro sutil, borda luminosa no hover, sombra em profundidade.
- Skeletons de carregamento para listas, biblioteca, métricas e perfis.
- Toasts (sonner) restilizados com ícone animado.

### Fase 3 — Microinterações e feedback visual
- Feedback imediato em toda ação: botão muda de estado no clique, progresso otimista, confirmação animada.
- Transições de estado: item que sai da fila "voa" para a lista de prontos; vídeo importado entra com fade+scale; agendamento move-se para a agenda.
- Barra/dock de progresso do lote com anel de progresso, contagem viva e mini-preview.
- Loading em três estágios (esqueleto → conteúdo → destaque), nunca tela em branco.
- Hover states, cursores e tooltips coerentes em toda a interface.

### Fase 4 — Estrutura e usabilidade (UX/IX)
- Navegação: sidebar com ícones + rótulos, agrupada por fluxo (Criar → Processar → Publicar → Analisar), indicador de etapa atual.
- Fluxo principal em passos claros com barra de progresso do processo (Template → Importar → Ajustar → Processar → Baixar).
- Preview sempre visível (coluna fixa) no editor e no estúdio de legendas, sem rolagem para ver o vídeo.
- Estados vazios com ilustração e ação primária.
- Atalhos de teclado e paleta de comandos (⌘K) para as ações frequentes.
- Responsivo real em mobile/tablet: painéis viram abas/bottom-sheet.

### Fase 5 — Telas públicas e auth
- Página de vendas: hero com movimento suave, prova social, blocos de recursos em bento, preços com destaque, CTA fixo.
- Login/cadastro/checkout: layout centrado, botões sociais claros, feedback de erro humano.

### Fase 6 — Acessibilidade e verificação
- Contraste AA, foco por teclado, labels/ARIA, alvos de toque ≥44px.
- Rodar build + suíte de testes existente e revisar as telas principais no preview.

## Garantia de "não quebrar"

- Só mudam: `src/styles.css`, classes de `className`, variantes de componentes UI e composição visual de layout.
- Não mudam: nomes/exports de componentes, props, hooks, funções de servidor, rotas, queries, migrações, lógica de render/publicação.
- Trabalho fase a fase, com build e testes verificados ao fim de cada fase antes de seguir.

## Detalhes técnicos

- Tailwind v4: tokens em `@theme inline` + `:root`; utilitários novos com `@utility`; fontes por `<link>` em `src/routes/__root.tsx` (nunca `@import` remoto).
- Animações via CSS/`tw-animate-css` já presente; Motion só onde houver transição de layout compartilhada.
- Densidade e "reduzir animações" persistidos em localStorage nas preferências.
