# Cleaner IA na RunPod

O worker do Cleaner IA (`backend/`) é uma API FastAPI + fila Celery que roda em
Docker. Existem duas formas de hospedá-lo na RunPod:

## Opção 1 — GPU Pod persistente (recomendado hoje)

A imagem atual funciona **sem alteração de código** num GPU Pod persistente:

1. Crie um Pod com GPU (RTX 4090 ou A5000, 24 GB) e volume de rede
   (`/data/storage`, 100 GB+).
2. Faça o build/push da imagem `backend/Dockerfile` para um registry
   (GHCR/Docker Hub) ou use o template "RunPod Pytorch" e clone o repo.
3. Suba os serviços:

   ```bash
   docker compose up -d worker api redis
   ```

4. Exponha a porta `8100` (HTTP público do Pod) e configure no app:

   - `CLEANER_WORKER_URL` → `https://<pod-id>-8100.proxy.runpod.net`
   - `CLEANER_WORKER_SECRET` → mesmo segredo configurado no worker
   - Opcional: `CLEANER_WORKER_PUBLIC_URL` se o callback deve passar por um
     domínio estável (ex.: Cloudflare Tunnel/Worker na frente).

Custo típico: ~US$ 300–500/mês por GPU dedicada 24/7, sem limite de fila.

## Opção 2 — RunPod Serverless (implementada)

O handler serverless já existe: `backend/runpod_handler.py` processa **um chunk
por invocação**, usando a mesma pipeline do worker (`run_pipeline`). A imagem
é o `backend/Dockerfile.runpod` e o app já possui a orquestração de chunks com
overlap + concat final (CleanerIA v3).

### Build e push da imagem (na VPS da Hostear)

```bash
cd backend
REGISTRY_USER=seu_usuario_dockerhub ./scripts/build-push-runpod.sh
```

O script instala o Docker se necessário, faz login, builda
`Dockerfile.runpod` e envia para o registry (Docker Hub por padrão; use
`REGISTRY=ghcr.io` para GHCR).

### Criar o endpoint na RunPod

1. **Serverless → New Endpoint → Deploy from a Docker image**
2. Container image: `<usuario>/cleaneria-runpod:latest`
3. GPU: RTX 4090 (24 GB); min workers `0`, max workers `3` (escala de zero)
4. Anexe um **Network Volume** montado em `/runpod-volume` com os pesos:
   - ProPainter → `/runpod-volume/models`
   - DiffuEraser → `/runpod-volume/max-models`
5. Env var do endpoint: `CLEANER_WORKER_SECRET=<mesmo segredo do app>`
6. Copie o **Endpoint ID** e configure os secrets no app:
   `RUNPOD_API_KEY` e `RUNPOD_ENDPOINT_ID`

### Fluxo de dados

O handler baixa o chunk pela `source_url` (URL assinada do storage do app),
processa e devolve via `upload_url` (PUT assinado) — portanto o storage
efêmero do worker não é problema. A VPS da Hostear continua como worker CPU
(prévia rápida + fallback) e como máquina de build da imagem.

Custo estimado serverless: ~US$ 0,10–0,40 por minuto de vídeo, conforme GPU
(4090 ~US$ 0,00034/s; A100 ~US$ 0,0011/s). Sem jobs, custo zero (min workers 0).

**Recomendação:** comece com o GPU Pod persistente. Quando o volume de jobs
justificar pagamento por uso, migre para serverless com storage S3.

## Opção 3 — Serverless Load Balancer (HTTP direto, implantada)

Neste modo o RunPod expõe a API FastAPI do worker diretamente em
`https://<endpoint-id>.api.runpod.ai` (sem fila `/run` + `/status`).

1. Crie o endpoint em **Serverless → Deploy from a Docker image** usando a
   imagem do `backend/Dockerfile` (API FastAPI), não o `Dockerfile.runpod`.
2. GPU RTX 4090, min workers `0`, max conforme demanda; Network Volume com os
   pesos em `/runpod-volume` (mesmos caminhos da Opção 2).
3. Env vars: `CLEANER_WORKER_SECRET`, `PORT=8000` (o worker já respeita PORT).
4. O RunPod usa `GET /ping` como health check — rota leve que não carrega
   status de GPU (já incluída no worker).
5. No app, configure `CLEANER_WORKER_URL` e `CLEANER_WORKER_PUBLIC_URL` com a
   URL do endpoint. O app trata o endpoint como worker remoto normal
   (upload → detect → process → resultado), sem precisar de `RUNPOD_*`.

**Atenção:** vídeos grandes não devem atravessar o gateway do Load Balancer —
prefira URLs assinadas de storage para entrada/saída. Nunca exponha a API key
do RunPod no navegador.
