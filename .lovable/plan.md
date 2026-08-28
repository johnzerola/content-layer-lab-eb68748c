# Barra de progresso confiável + render mais rápido

Na captura, o lote mostra "0/1 · 1%", "0.0 vídeos/min" e "restam ~5h58m" depois de 108s. Duas coisas diferentes estão acontecendo: a barra mede errado e o render está mesmo lento.

## O que está errado na barra

- O tempo do lote começa a contar antes do render (download/leitura do arquivo, decodificação do áudio, detecção de áreas, reconstrução de fundo). Nessas fases o progresso fica preso em 0,5%, então a conta "progresso ÷ tempo" dá quase zero e o ETA explode para horas.
- O ETA é calculado com um único ponto de medida. Com 1 vídeo no lote, qualquer segundo lento vira uma estimativa absurda.
- "0.0 vídeos/min" aparece porque a velocidade é arredondada em 1 casa; um vídeo longo sempre mostra 0.0.
- As etapas de preparo não têm peso nenhum na barra: o usuário vê 1% mesmo quando metade do trabalho de preparo já foi feito.

## O que vai mudar na barra

- Cada vídeo passa a ter fases com peso (preparo ~15%, render ~80%, finalização ~5%), então a barra anda desde o início em vez de ficar em 1%.
- ETA por média móvel dos últimos quadros/itens, e só exibido depois de amostra suficiente; antes disso mostra "calculando…" em vez de um número errado.
- Velocidade mostrada como "min/vídeo" quando for menor que 1 vídeo/min, e também quadros/s do item atual — número que o usuário consegue interpretar.
- Rótulo da fase atual no dock (ex.: "lendo áudio", "renderizando 320/1800 quadros").

## Por que está lento e o que fazer

O render tenta primeiro o caminho turbo (decodificação direta via WebCodecs) e, se ele falhar, cai para reprodução em tempo real — nesse fallback um vídeo de 1 minuto leva pelo menos 1 minuto, mais o custo de desenhar cada quadro. O plano:

1. Instrumentar e registrar qual caminho foi usado em cada item (turbo, reprodução, busca precisa) e a taxa de quadros/s, exibindo no painel Diagnóstico. Sem isso qualquer otimização é chute.
2. Corrigir as causas mais prováveis de queda para o caminho lento: arquivos vindos de URL sem `File` real, codecs não suportados pelo demuxer próprio e falha silenciosa na abertura do leitor de quadros.
3. Reduzir custo por quadro: reaproveitar o canvas e os gradientes/medidas de texto entre quadros, evitar recomputar layout de legenda a cada quadro, e liberar a thread com menos frequência quando a fila do codificador está vazia.
4. Usar o pool de workers com OffscreenCanvas para o modo paralelo quando o caminho turbo estiver ativo, em vez de renderizar tudo na thread principal.

## Detalhes técnicos

- `src/lib/batch-runtime.ts`: adicionar fases com peso, média móvel de velocidade e estado "medindo" explícito; `batchStats` passa a usar janela deslizante.
- `src/components/BatchProgressDock.tsx`: novo formato de velocidade/ETA e rótulo de fase.
- `src/routes/index.tsx`: reportar as fases de preparo (áudio, detecção, plate) em `updateBatchProgress`, não só o render.
- `src/lib/encode.ts`: retornar qual caminho foi usado + fps efetivo; corrigir quedas indevidas para o caminho de reprodução; micro-otimizações no laço de emissão.
- `src/lib/draw.ts`: cache de medidas de texto e gradientes por template/tamanho.
- Sem mudanças de banco, de template ou de saída de arquivo — o vídeo exportado continua idêntico.
