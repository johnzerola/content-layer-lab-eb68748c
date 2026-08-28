# Unificar as barras de progresso e descobrir a lentidão real do render

## O problema relatado

Na mesma tela aparecem dois indicadores com números diferentes ("Progresso do lote 0%" e o dock "ViralBatch 0/1 (14%)"), e o render fica parado em "iniciando codificador" com estimativa absurda (~6,8 min por vídeo) para um vídeo curto.

## O que já está confirmado no código

- Existem de fato dois indicadores: o painel embutido em `src/routes/index.tsx` desenha barras a partir do estado local da fila (`batchProgress`, `batchDone`, `activeItem.progress`), enquanto `BatchProgressDock` lê o store global `src/lib/batch-runtime.ts`. São duas fontes independentes, por isso os percentuais divergem.
- "iniciando codificador" é a última fase antes de entregar o job ao worker (`src/lib/render-pool.ts`), fixada em 92% da etapa de preparo. Enquanto o worker não devolve o primeiro progresso, o item fica visualmente parado nessa frase.
- O ETA por vídeo vem de extrapolação do progresso parcial; com poucos pontos ele estica muito no início.

O motivo exato da lentidão (worker rápido x fallback lento na thread principal) ainda **não está confirmado** — é a primeira coisa a medir, não a supor.

## Plano

### 1. Uma única fonte de progresso
- O painel embutido passa a ler o mesmo store do dock; o estado local deixa de calcular percentual próprio.
- O painel embutido some enquanto o dock estiver visível (ou vira apenas a lista de itens da fila, sem barra), eliminando números conflitantes.

### 2. Fase "iniciando codificador" deixa de parecer travada
- Enviar progresso indeterminado/animado enquanto o worker não devolve o primeiro frame, com texto do que está acontecendo (abrindo worker, decodificando primeiros quadros).
- Emitir progresso já a partir do primeiro frame decodificado, não só depois de N frames.

### 3. Medir a lentidão antes de otimizar
- Registrar tempos por fase (leitura, áudio, template, início do codificador, primeiro frame, frames/s médio) e mostrar no dock qual caminho está em uso: worker/WebCodecs, thread principal/WebCodecs ou gravação em tempo real.
- Se o caminho em uso for a gravação em tempo real (MediaRecorder), a exportação nunca passa de 1x — nesse caso a mensagem precisa dizer isso e o motivo do fallback deve ser logado.
- Com essa medição, atacar o gargalo real (áudio, decode ou codec) em vez de chutar.

### 4. ETA honesto
- Enquanto não houver amostra suficiente, mostrar "calculando…" em vez de "6,8 min/vídeo".
- Basear o ETA na taxa de frames observada, com média móvel, e limitar saltos.

## Detalhes técnicos

- `src/routes/index.tsx`: remover as barras locais do bloco "Progresso do lote" e consumir `batch-runtime`.
- `src/lib/batch-runtime.ts`: guardar `path` (worker/main/recorder) e marcos de tempo por fase; ETA só após a primeira amostra real.
- `src/lib/render-pool.ts` / `src/lib/render.ts`: reportar o caminho escolhido e o motivo do fallback via `onStats`/`onPhase`.
- `src/components/BatchProgressDock.tsx`: exibir caminho ativo e fps; texto "calculando…" enquanto sem amostra.
