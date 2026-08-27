# Exportação 4–5x mais rápida (decodificação direta + Web Workers)

Sim: aquela proposta continua válida e ainda não foi implementada. Hoje o app ainda exporta tocando o vídeo em um `<video>` e capturando a tela quadro a quadro na mesma thread da interface — por isso a velocidade fica presa perto do tempo real (com o limite de ~3–4x do turbo) e a aba pesa enquanto processa.

## O que vai mudar

### 1. Ler os quadros direto do arquivo (o maior ganho)
Trocar a leitura via `<video>` + `play()`/`seek` por decodificação direta com `VideoDecoder` (WebCodecs). Sem depender do relógio de reprodução, os quadros saem na velocidade que a máquina aguenta — normalmente 4–8x mais rápido em vídeos longos, e sem risco de dessincronia (cada quadro tem carimbo de tempo exato).

### 2. Render fora da thread da tela
Mover desenho + codificação para um Web Worker com `OffscreenCanvas`:
- interface sempre fluida (dá para navegar no app durante o lote);
- o navegador não estrangula a velocidade com a aba em segundo plano.

### 3. Vários vídeos ao mesmo tempo
Pool de 2–4 workers, ajustado pelo número de núcleos da máquina — o lote inteiro termina em fração do tempo atual.

### 4. Não repetir trabalho
Por vídeo, calcular uma única vez transcrição, placa anti-legenda, detecção de silêncio e enquadramento, reaproveitando entre todas as variações do mesmo arquivo (cache em IndexedDB).

### Fallback garantido
Navegador sem WebCodecs/OffscreenCanvas continua usando o caminho atual (`<video>` + canvas), já corrigido contra dessincronia. Nada quebra.

## Detalhes técnicos

- Novo `src/workers/render.worker.ts`: recebe arquivo, template, variação e opções; usa `OffscreenCanvas` + `VideoDecoder`/`VideoEncoder` + `mp4-muxer`; devolve o MP4 por transferência.
- `src/lib/encode.ts` refatorado: núcleo puro sem DOM (desenho + muxagem) reutilizado pelo worker; caminho `<video>` permanece só como fallback.
- `src/lib/draw.ts` precisa aceitar `OffscreenCanvasRenderingContext2D` e fontes já carregadas via `FontFace` no worker.
- `src/lib/batch-runtime.ts` vira scheduler com pool de workers, concorrência dinâmica (`navigator.hardwareConcurrency`), retomada e retry.
- Demuxagem do MP4 de entrada para alimentar o `VideoDecoder` (parser leve de MP4, sem dependência pesada nova).
- Áudio continua pelo `OfflineAudioContext` na thread principal (rápido e já correto), enviado ao worker para muxagem.
- Sem mudança de backend e sem custo extra.

## Fora do escopo agora
Render no servidor (VPS) para poder fechar o navegador de vez — próximo passo natural, reaproveita a mesma fila.
