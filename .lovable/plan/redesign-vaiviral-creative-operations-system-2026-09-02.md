# Redesign VaiViral — Creative Operations System

Auditoria feita sobre o código atual. Nada de backend, rotas, hooks ou regras muda: o trabalho é de apresentação.

## 1. Arquitetura visual atual

- TanStack Start + Tailwind v4 (tokens em `src/styles.css`) + shadcn/ui completo (46 primitivas, Lucide como única família de ícones).
- Shell único: `src/components/AppShell.tsx` (sidebar 264px/72px, header sticky, hero de ferramenta, conteúdo em `max-w-6xl`).
- Docks globais montados no `__root.tsx`: `ActivityDock`, `BatchProgressDock`, `CommandPalette` (⌘K já existe), `Toaster` (sonner).
- Estúdios pesados como componentes: `VideoStudio` (1781), `ClipStudio` (1233), `CleanerIAStudio` (1145), `TemplateEditor` (1017), `EditorTimeline`, `CaptionWorkbench`, `FramingStudio`.
- Rotas: `/` (3762 linhas, orquestra todos os modos), `/live`, `/biblioteca`, `/agenda`, `/perfis`, `/integracoes`, `/armazenamento`, `/metricas`, `/fotos`, `/limpar-ia`, `/checkout`, `/conta`, `/admin`, `/vendas`, callbacks OAuth.

## 2. Problemas de UX encontrados

- **Hero de ferramenta** ocupa a dobra inteira em toda página: parece landing, não software. Empurra o trabalho real para baixo.
- **Sem command center**: a home entra direto na ferramenta; não há visão de pipeline, tarefas em andamento ou próximas publicações.
- **Sidebar mistura conceitos**: "Ferramentas" (estado interno) e links de rota na mesma lista, sem grupos Criar/Produção/Distribuição/Workspace, sem tooltips reais no modo recolhido.
- **Detecção de rota via `window.location.pathname`** dentro do render — frágil e causa mismatch de SSR.
- **Densidade inconsistente**: `max-w-6xl` limita telas operacionais (agenda, perfis, biblioteca) em monitores grandes; paddings variam por página.
- **Feedback**: nem toda ação longa tem estado de botão (loading → sucesso); alguns fluxos dependem só de toast.
- **Perfis e biblioteca** usam cards grandes onde uma tabela densa comunicaria melhor status/token/próxima publicação.
- **Vazios e carregamentos** genéricos em várias listas.

## 3. Inconsistências de UI

- Radius grande demais (`--radius: 0.9rem`) aplicado a tudo; muitos elementos viram cápsula.
- Glow (`--shadow-glow`) e vidro usados em superfícies não elevadas; aurora de fundo fica visível demais.
- Fonte mono usada como rótulo em excesso (hints, badges, contadores) — vira ruído.
- Pesos 700/800 em títulos de painel; escala tipográfica não padronizada.
- Z-index ad-hoc (`z-30`, `z-50`) sem escala.

## 4. Componentes reutilizáveis como estão

Toda `src/components/ui/*`, `PlanGate`, `AuthGate`, `RequireAuth`, `EmptyState`, `PlatformUIOverlay`, `BeforeAfterSlider`, `useEditorHistory`, hooks e libs (`src/lib/*`).

## 5. Componentes que só precisam de skin

`button`, `card`, `input`, `select`, `tabs`, `badge`, `table`, `tooltip`, `dropdown-menu`, `popover`, `dialog`, `drawer`, `sonner`, `progress`, `skeleton`, `EmptyState`, `ActivityDock`, `BatchProgressDock`, `ResultLibrary`, `TemplateLibrary`, `ViralLibrary`, `CloudPanel`, `ImportPanel`.

## 6. Maior risco de regressão

1. `src/routes/index.tsx` (3762 linhas) — orquestra modos, filas e render. Alterar só JSX de layout/classes, em blocos pequenos.
2. `VideoStudio` / `EditorTimeline` / `FramingStudio` — drag, refs e canvas. Não mexer em handlers nem em geometria calculada.
3. `CleanerIAStudio` e `ClipStudio` — polling e estados de job.
4. `AppShell` — muda `count`, `counts`, `onMode`, `onLibrary`, `onCloud`: assinatura preservada 100%.
5. `draw.ts` / render workers — intocados.

## 7. Plano de redesign

Direção: superfícies neutras e planas, cor primária só para ação/seleção/progresso, tipografia calma, densidade de ferramenta. Nada de aurora global, glow difuso ou gradiente em botão.

- **Tokens** (`src/styles.css`): paleta neutra escura fornecida (#070A10 → #182130), bordas 0.07/0.13, primário #6D5DFB só em ação; radius 6/8/10/12; escala 12–32; motion 80/120/180/220/280ms com `cubic-bezier(0.2,0.8,0.2,1)`; escala de z-index; `glass` restrito a barra de comando, popover e modal.
- **Shell**: sidebar agrupada (Criar / Produção / Distribuição / Workspace) preservando rotas e o `onMode` atual; rota ativa via `useRouterState` em vez de `window.location`; modo compacto com tooltips; header com **Global Action Bar** (44–48px, placeholder + ⌘K) que expande na própria posição para o painel de comandos (transform/opacity, ~220ms), reaproveitando o `CommandPalette` existente com grupos Ações rápidas / Recentes / Perfis / Comandos.
- **Home**: acima da ferramenta, um bloco Command Center discreto — saudação, ação primária, pipeline com números reais já disponíveis, tarefas em andamento (dados do ActivityDock/BatchProgressDock) e próximas publicações (dados da agenda). Hero atual vira cabeçalho compacto de uma linha.
- **Importação**: dropzone grande com estados de arrasto e fila com thumbnail/status/progresso, ligada aos handlers atuais.
- **Editor**: topbar (projeto, autosave visual, undo/redo, preview, exportar) + toolbar esquerda + canvas dominante + inspector contextual + timeline; propriedades por seleção, sem inventar controles.
- **Processamento**: central com contadores concluído/rodando/fila/falha e barra única; só ações que já existem.
- **Templates / Branding / CleanerIA**: grid com thumbnail forte; CleanerIA com before/after e etapas reais do job.
- **Agenda / Perfis / Live**: modos Calendário e Fila; perfis em tabela híbrida com prioridade visual para problemas de token; Live como painel de monitoramento com indicador discreto.
- **Planos/créditos**: "273 de 500" com barra e renovação, quando os dados existirem.
- **Polimento**: hover −1px, botões com default/hover/focus/pressed/loading/success, skeletons por tipo de conteúdo, empty states que ensinam o próximo passo, `prefers-reduced-motion`, foco visível, alvos ≥44px, checagem em 1366/1440/1920/2560.

## 8. Arquivos que pretendo alterar

`src/styles.css`, `src/components/AppShell.tsx`, `src/components/CommandPalette.tsx`, `src/components/ActivityDock.tsx`, `src/components/BatchProgressDock.tsx`, `src/components/EmptyState.tsx`, `src/components/ui/*` (skin), `src/routes/index.tsx` (só JSX de layout), `agenda.tsx`, `perfis.tsx`, `biblioteca.tsx`, `armazenamento.tsx`, `metricas.tsx`, `integracoes.tsx`, `live.tsx`, `limpar-ia.tsx`, `fotos.tsx`, `checkout.tsx`, `conta.tsx`, `ImportPanel.tsx`, `ResultLibrary.tsx`, `TemplateLibrary.tsx`, `ViralLibrary.tsx`, `CleanerIAStudio.tsx`, `ClipStudio.tsx`, `VideoStudio.tsx`, `EditorTimeline.tsx`, `TemplateEditor.tsx`, `CaptionWorkbench.tsx`.

## 9. Arquivos que NÃO serão alterados

Todo `src/lib/*` de lógica (`draw.ts`, `encode-presets.ts`, `publish*.ts`, `viral-library.ts`, `zip.ts`, `handoff.ts`), `src/workers/*`, `src/services/*`, `src/integrations/*`, `src/routes/api/*`, callbacks OAuth (`integracoes_.*`), `src/server.ts`, `src/start.ts`, `supabase/*`, `backend/*`, migrações e testes.

## 10. Ordem de implementação

1. Tokens e fundação. 2. Componentes base. 3. Shell + Global Action Bar. 4. Dashboard. 5. Importação. 6. Editor. 7. Processamento. 8. Templates/Branding/CleanerIA. 9. Agenda/Publicação/Perfis/Live. 10. Planos e configurações. 11. Motion e polimento. 12. Responsividade. 13. Acessibilidade. 14. QA visual e funcional.

Ao fim de cada fase: build, typecheck e a suíte de testes existente; nenhum erro novo acumulado antes de seguir.
