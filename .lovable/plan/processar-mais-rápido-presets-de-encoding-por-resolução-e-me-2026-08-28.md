# Processar mais rápido: presets de encoding por resolução e menos trabalho repetido

Auditoria do caminho de "Processar" (fila em `src/routes/index.tsx` → `src/lib/render.ts` → `src/lib/render-pool.ts` → `src/workers/render.worker.ts` / `src/lib/encode-core.ts` / `src/lib/encode.ts`). O que foi confirmado lendo o código:

- O bitrate padrão é fixo em 10 Mbps para qualquer resolução (`render.ts`, `encode.ts`, `encode-core.ts`, `render-pool.ts`). Um 720x1280 é codificado com o mesmo bitrate de um 1080x1920 — tempo e tamanho de arquivo desperdiçados sem ganho visual.
- O codificador é configurado com `latencyMode: "quality"` e sem pedir aceleração de hardware, nos dois codificadores.
- A lógica de escolher codec de vídeo, escolher codec de áudio e muxar está duplicada quase linha a linha em `src/lib/encode.ts` e `src/lib/encode-core.ts`. Duas cópias que já divergiram (o encode.ts tem telemetria e caminho de fallback; o core tem a verificação nova de quadro preto).
- Cada plataforma e cada variação é renderizada em série (`for (const plat of outs) { for (let k...) { await renderVideo(...) } }`), então o pool de workers quase nunca é usado em paralelo dentro do mesmo vídeo.
- O pool cria 1 worker a cada 4 núcleos, no máximo 4 (`poolSize()`): numa máquina de 8 núcleos são só 2 workers.
- Preparo pesado já é reaproveitado em parte (áudio decodificado com cache, bitmaps do template com `analysisCache`), mas o `plate` vira `ImageBitmap` de novo a cada render e as etapas de preparo rodam inteiras por variação.

## O que vai mudar

### 1. Presets de encoding por resolução (núcleo do pedido)
Uma tabela única de qualidade, escolhida pela resolução real de saída e pelo modo (qualidade / equilibrado / turbo). Referência para vídeo social em H.264, 30 fps:

| Saída | Alta qualidade | Equilibrado (padrão) | Turbo |
|---|---|---|---|
| 1080x1920 / 1080x1080 | 9 Mbps | 6,5 Mbps | 4,5 Mbps |
| 720x1280 | 5 Mbps | 3,5 Mbps | 2,5 Mbps |
| 1920x1080 | 10 Mbps | 7 Mbps | 5 Mbps |
| menor que 720p | 3 Mbps | 2,2 Mbps | 1,6 Mbps |

Ajuste automático proporcional ao fps (24 fps usa ~85% do valor, 60 fps ~1,4x) e piso/teto para nunca sair borrado nem gigante. O controle manual de bitrate continua existindo para quem quiser forçar.

Efeito esperado: menos bits para o codificador comprimir e escrever, arquivos menores e download mais rápido, sem perda perceptível — hoje 10 Mbps em 720p é desperdício puro.

### 2. Codificador configurado para velocidade
- `hardwareAcceleration: "prefer-hardware"` quando suportado, com volta automática para software.
- `latencyMode: "realtime"` nos modos equilibrado/turbo (encoder trabalha em pipeline em vez de segurar quadros); "quality" fica só no modo alta qualidade.
- Keyframe a cada 2 s mantido (exigência das plataformas).

### 3. Uma só implementação de encoding
Extrair para um módulo compartilhado a escolha de codec de vídeo/áudio, os presets e a montagem do muxer, usados tanto pelo caminho em worker quanto pelo caminho na tela. Fim das duas cópias que divergem.

### 4. Paralelizar plataformas e variações do mesmo vídeo
Em vez de renderizar uma variação por vez, disparar as combinações plataforma x variação no pool respeitando o limite de workers. Um vídeo com 2 plataformas e 3 variações passa a usar a máquina inteira em vez de um worker só.

### 5. Pool com tamanho realista
`poolSize()` passa a ser metade dos núcleos (mínimo 1, máximo 4). Máquina de 8 núcleos ganha 4 workers em vez de 2.

### 6. Preparo calculado uma vez por vídeo
Plate, bitmaps do template, PCM de áudio e envelope passam a ser preparados uma vez por vídeo e reaproveitados por todas as variações/plataformas, em vez de refeitos a cada render.

## Detalhes técnicos

- Novo `src/lib/encode-presets.ts`: `pickBitrate({ width, height, fps, tier })`, tabela acima, ajuste por fps e clamps; `pickVideoCodec`/`pickAudioCodec` movidos para cá com o parâmetro `tier` controlando `latencyMode` e `hardwareAcceleration`.
- `src/lib/encode.ts` e `src/lib/encode-core.ts` passam a importar esse módulo; as funções duplicadas são removidas.
- `src/routes/index.tsx`: o cálculo atual (`safe ? 4_000_000 : turbo ? 5_000_000 : ...`) vira `pickBitrate` com o tier derivado de `safe`/`turbo`/`autoBitrate`; o slider manual continua sobrescrevendo.
- `src/lib/render-pool.ts`: `poolSize()` para `cores/2`; preparo (áudio, bitmaps, plate) extraído para uma função por vídeo com cache por `file` + variação, com o `ImageBitmap` do plate reaproveitado via clone.
- Fila em `src/routes/index.tsx`: o laço plataforma x variação vira uma lista de tarefas executada com limite igual a `poolSize()`, mantendo progresso, cancelamento e ordem de resultados atuais.
- Nada de backend novo, nenhum custo adicional.

## Validação

- Renderizar o mesmo vídeo antes e depois em 1080x1920 e 720x1280: comparar tempo total, tamanho e inspeção visual.
- Suíte existente (`bunx vitest run`) mais testes novos para a tabela de presets (limites, ajuste por fps, clamps).
