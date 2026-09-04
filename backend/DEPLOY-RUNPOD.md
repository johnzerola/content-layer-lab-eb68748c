# CleanerIA no RunPod Serverless

O worker GPU roda como um endpoint **Load Balancer** do RunPod Serverless. Esse
modo preserva a API FastAPI existente (upload, detecao, processamento, status e
download); nao escolha o endpoint `Queue`, que exige um handler diferente e tem
limites de payload inadequados para video.

## 1. Publicar a imagem no Docker Hub

Em um VPS Ubuntu/Debian (por exemplo, Hostear), copie/clone o projeto e rode:

```bash
cd backend
REGISTRY_USER=seu_usuario_dockerhub ./scripts/build-push-runpod.sh
```

O script instala Docker quando necessario, pede o login do Docker Hub, constroi
`Dockerfile.gpu` para `linux/amd64` e publica
`docker.io/seu_usuario_dockerhub/cleaneria-runpod:latest`. Para automacao sem
prompt, passe `DOCKERHUB_TOKEN`; `IMAGE_NAME` e `IMAGE_TAG` tambem podem ser
sobrescritos.

## 2. Preparar os pesos

Crie um **Network Volume** na mesma regiao do endpoint. O volume fica montado em
`/runpod-volume`. Organize os pesos assim:

```text
/runpod-volume/
  models/       # ProPainter.pth, recurrent_flow_completion.pth, raft-things.pth
  max-models/   # snapshots usados pelo DiffuEraser
  storage/      # arquivos temporarios dos jobs
```

Os scripts `install_propainter.py` e `install_diffueraser.py` podem popular essas
pastas em um Pod temporario que tenha o mesmo volume montado:

```bash
python3.10 /app/scripts/install_propainter.py --weights-only \
  --weights-dir /runpod-volume/models
HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 \
python3.10 /app/scripts/install_diffueraser.py --models-only \
  --models-root /runpod-volume/max-models
```

## 3. Criar o endpoint

Em **RunPod > Serverless > New Endpoint > Import from Docker Registry**:

1. informe a imagem publicada pelo script;
2. selecione **Load Balancer**;
3. selecione **NVIDIA GeForce RTX 4090** (24 GB) e uma GPU por worker;
4. anexe o Network Volume preparado acima;
5. exponha a porta HTTP `8000`;
6. use zero worker minimo para pagar sob demanda, ou um worker minimo para
   eliminar o cold start.

Configure estas variaveis no endpoint:

```dotenv
PORT=8000
PORT_HEALTH=8000
CLEANER_ENV=production
CLEANER_DEVICE=cuda
CLEANER_WORKER_SECRET=um-segredo-aleatorio-com-ao-menos-32-caracteres
CLEANER_ALLOWED_HOSTS=*
CORS_ORIGINS=https://seu-app.example.com
CLEANER_CALLBACK_ORIGINS=https://seu-app.example.com
CLEANER_STORAGE=/runpod-volume/storage
PROPAINTER_ROOT=/opt/ProPainter
PROPAINTER_WEIGHTS_DIR=/runpod-volume/models
DIFFUERASER_ROOT=/opt/DiffuEraser
DIFFUERASER_MODELS_ROOT=/runpod-volume/max-models
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
```

O container expoe `/ping`, exigido pelo health check do Load Balancer. Durante a
inicializacao ele responde `204`; quando CUDA e ProPainter estao prontos,
responde `200`.

## 4. Conectar o app

Copie o **Endpoint ID** e crie uma API key no RunPod. Guarde ambos somente nas
variaveis server-side do app:

```dotenv
RUNPOD_API_KEY=rp_...
RUNPOD_ENDPOINT_ID=...
CLEANER_WORKER_SECRET=o-mesmo-segredo-configurado-no-endpoint
```

Nunca use prefixo `VITE_` nesses valores: isso os exporia no navegador. A URL do
Load Balancer e `https://RUNPOD_ENDPOINT_ID.api.runpod.ai` e as chamadas exigem
`Authorization: Bearer RUNPOD_API_KEY`.

Teste o endpoint diretamente:

```bash
curl -fsS \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  "https://${RUNPOD_ENDPOINT_ID}.api.runpod.ai/v1/health"
```

O retorno deve conter `"online": true`, `"cuda": true`, `"ai_ready": true` e,
para o preset Max, `"max_ready": true`.

> Videos podem ultrapassar o limite de payload do Load Balancer. O fluxo de
> producao deve manter upload e resultados em storage privado/Network Volume e
> passar apenas referencias assinadas pela API. Nao envie a API key do RunPod ao
> navegador.
