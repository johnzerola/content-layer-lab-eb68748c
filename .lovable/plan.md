# Processamento mais rápido e em segundo plano (sem servidor)

Objetivo: o lote continuar rodando a toda velocidade mesmo com a aba minimizada, em outra janela, ou enquanto você usa o PC normalmente — e os vídeos prontos aparecerem sozinhos na Biblioteca, com notificação ao terminar.

Nota importante e honesta: sem servidor, a aba do site precisa continuar **existindo** (pode estar em segundo plano, minimizada, atrás do YouTube). Se você fechar a aba/navegador, o lote pausa e retoma de onde parou quando você voltar — nada é perdido.

## O que muda

### 1. Render fora da thread da tela (fim da lentidão)
Hoje o desenho, a decodificação e a codificação disputam a mesma thread da interface, e o navegador estrangula tudo quando a aba não está visível. Vou mover o pipeline inteiro para Web Workers com OffscreenCanvas:
- interface sempre fluida (você navega no app enquanto processa);
- o navegador não reduz a velocidade quando a aba fica em segundo plano;
- 2 a 4 vídeos em paralelo, ajustado automaticamente pelo número de núcleos da máquina.

### 2. Velocidade real
- Codificação por hardware (WebCodecs) com fallback automático.
- Leitura de frames sem depender do relógio de reprodução (sem "tempo real"): usa decodificação direta, o que costuma dar ganho grande em vídeos longos.
- Reaproveitar trabalho entre variações do mesmo vídeo (transcrição, placa anti-legenda, detecção de silêncio e enquadramento são calculados uma vez só).
- Pular etapas caras quando o resultado já está em cache no IndexedDB.

### 3. Continuar sem ficar olhando
- Fila persistente: cada item tem estado (pendente / rodando / pronto / erro) salvo no IndexedDB, retomando sozinho ao reabrir.
- Resultados vão direto para a Biblioteca na nuvem conforme ficam prontos (não espera o lote inteiro).
- Notificação do sistema ("Lote concluído — 42 vídeos") + badge no app quando você voltar.
- Aviso ao tentar fechar a aba com lote em andamento.
- Botão "Baixar todos" na Biblioteca (ZIP) para quando você voltar.

### 4. Dock de progresso melhor
- Tempo restante estimado, velocidade (vídeos/min), item atual, erros separados com "tentar de novo".
- Pausar / retomar / cancelar de qualquer tela.

## Detalhes técnicos

- Novo `src/workers/render.worker.ts`: recebe o arquivo, template e opções; usa `OffscreenCanvas` + `VideoDecoder`/`VideoEncoder` + `mp4-muxer`; devolve o MP4 por transferência.
- `src/lib/encode.ts` refatorado em núcleo puro (sem DOM) reutilizado pelo worker; o caminho atual em `<video>`/canvas fica apenas como fallback para navegadores sem WebCodecs.
- `src/lib/batch-runtime.ts` vira um scheduler real: fila persistida (IndexedDB via `src/lib/session.ts`), pool de workers com concorrência dinâmica, retomada automática, retry com backoff.
- Upload incremental do resultado para a Biblioteca; `Notification.requestPermission()` na primeira execução do lote.
- Sem mudanças de backend nem de custos; nenhuma dependência nova pesada.

## Fora do escopo agora
Render no servidor (VPS) — se depois quiser fechar o navegador de verdade, é o próximo passo natural e reaproveita a mesma fila.
