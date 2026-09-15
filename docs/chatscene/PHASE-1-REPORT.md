# ANALOGUE CHATSCENE — Relatório da Fase 1

## Escopo entregue

Studio isolado em `/chatscene`, sem qualquer alteração em Cleaner IA, Editor V1/V2,
Golden Cleaner, pipelines GPU, RunPod ou render do Cleaner.

- Participantes (até 12), cores, identificação de "eu", conversa direta ou grupo.
- Mensagens `text`, `emoji` e `system` (o modelo já aceita outros tipos, herdados).
- Criar, editar, duplicar, apagar e reordenar mensagens.
- Prévia temporal determinística com "digitando…", entrada e rolagem automática.
- Temas de apresentação (Mensageiro, Noite, Menta, Papel, Terminal) + modo escuro.
- Formatos 9:16, 16:9 e 1:1 com margens seguras.
- Fundos: do tema, degradês, cores sólidas e foto por endereço.
- Conversa de exemplo (grupo com 4 pessoas) no estado vazio.
- Rascunho salvo no navegador: atualizar a página não perde o trabalho.
- Modo simples e modo estúdio (ajuste fino de ritmo).

## Arquitetura

`ChatSceneProject` continua sendo a fonte única de verdade. Separação mantida:

- CONTENT — `types.ts` (participantes, mensagens, grupo).
- THEME — `theme.ts` + `background` (só apresentação, nunca tempo).
- TIMING — `clock.ts` (`buildPlan`, plano determinístico por frame).
- RENDER — `draw.ts` / `renderer.ts` (canvas, sem React).

## Arquivos tocados

- `src/lib/chatscene/types.ts` — `ChatSceneBackground`, `BACKGROUND_PRESETS`,
  `createDemoChatSceneProject`, normalização retrocompatível.
- `src/lib/chatscene/serialize.ts` (novo) — serialização versionada e rascunho local.
- `src/lib/chatscene/draw.ts` — desenho do fundo escolhido.
- `src/lib/chatscene/renderer.ts` — pré-carregamento da foto de fundo.
- `src/components/chatscene/ChatSceneStudio.tsx` — duplicar, formato, fundo,
  estado vazio com exemplo, rascunho local.
- `src/lib/chatscene/__tests__/chatscene-project.test.ts` (novo).

## Verificações

- TypeScript: `bunx tsgo --noEmit` sem erros.
- Testes: 19 passando (`chatscene-clock`, `chatscene-project`), incluindo
  serialização, retrocompatibilidade, pureza do tema e 100 mensagens < 1s.
- Build: log de build limpo.
- Navegador: `/chatscene` em 1440, 1366 e 430 px — sem estouro horizontal e sem
  erros no console; prévia renderizando com tema, formato e fundo.

## Limitações desta fase

Sem TTS/áudio, mídia avançada, IA, render em nuvem, pagamentos, API ou integração
com o Editor V2. Os controles de mídia herdados continuam na tela, mas não fazem
parte dos critérios da Fase 1.

## Backlog sugerido

Undo/redo formal via command bus, arrastar para reordenar, reabrir projetos salvos
na nuvem pela própria tela e replies/reações com tratamento visual completo.
