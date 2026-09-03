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

## Opção 2 — RunPod Serverless (ainda não implementada)

O modelo serverless da RunPod não é drop-in para este worker:

- O handler serverless é **request/response** com limite de execução por
  requisição; nosso pipeline é um job longo com callbacks de progresso —
  exigiria um handler `runpod.serverless.start()` que delegue ao Celery ou
  processe síncrono com `job_scale`/`executionTimeout` altos.
- Storage é **efêmero por worker**; seria preciso mover `input.mp4`,
  `output.mp4` e máscaras para um volume de rede ou storage de objetos (S3),
  mudando `storage_dir` e os endpoints `/result` e `/preview`.
- Modelos (ProPainter/DiffuEraser) precisam vir embutidos na imagem ou em
  network volume para não pagar download a cada cold start.

Custo estimado serverless: ~US$ 0,10–0,40 por minuto de vídeo, conforme GPU
(4090 ~US$ 0,00034/s; A100 ~US$ 0,0011/s).

**Recomendação:** comece com o GPU Pod persistente. Quando o volume de jobs
justificar pagamento por uso, migre para serverless com storage S3.
