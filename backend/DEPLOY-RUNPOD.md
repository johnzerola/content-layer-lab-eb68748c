# Pipeline oficial do CleanerIA: Hostinger + RunPod Serverless

Esta é a única arquitetura suportada pelo CleanerIA. O app nunca envia a chave
do RunPod ao navegador e nunca manda o vídeo original inteiro para uma função
GPU.

## Identidade da implantação

- Endpoint Queue RunPod: `km860ju9ded2e0`
- API: `https://api.runpod.ai/v2/km860ju9ded2e0`
- Handler esperado: `backend/runpod_handler.py`, `worker_version=v3`
- Imagem vista anteriormente no endpoint: `docker.io/nivaldo12/leaneria-runpod:6bba537`

O ID fica no secret `RUNPOD_ENDPOINT_ID`; não deve ser fixado no bundle do
navegador. Depois de publicar uma nova imagem, o diagnóstico da tela deve
responder `worker_version=v3`. Se responder outra versão, o endpoint ainda está
usando uma imagem antiga.

## Fluxo de dados

1. O navegador cria o job autenticado e recebe um token temporário de upload.
2. O vídeo original vai diretamente para a VPS Hostinger. O app apenas faz
   fallback de proxy se o upload direto falhar.
3. A VPS valida o arquivo com `ffprobe`, detecta cenas e texto/marca, gera
   máscaras temporais e planeja chunks de 15 s com 0,6 s de contexto.
4. O servidor do app cria URLs assinadas e envia cada chunk por `POST /run` ao
   endpoint Queue. A chave `RUNPOD_API_KEY` existe somente no servidor.
5. Cada worker RunPod baixa um chunk assinado, localiza a máscara no tempo,
   processa, remove as bordas de overlap e envia o resultado ao Storage.
6. O orquestrador consulta `GET /status/{id}`, confirma que o artefato realmente
   existe e mede texto residual. Somente o chunk ruim é reenviado, até 3 envios.
7. A VPS baixa os chunks em ordem, concatena, recoloca o áudio original e cria
   `output.mp4` na resolução do master.
8. Chunks, proxy, plano e vídeo de entrada são apagados depois da entrega. O
   `output.mp4` é preservado durante a retenção para permitir novo download.

## Secrets do app

```dotenv
CLEANER_WORKER_URL=https://SEU-DOMINIO-DA-VPS
CLEANER_WORKER_PUBLIC_URL=https://SEU-DOMINIO-DA-VPS
CLEANER_WORKER_SECRET=SEGREDO-ALEATORIO-DE-48-CARACTERES
RUNPOD_ENDPOINT_ID=km860ju9ded2e0
RUNPOD_API_KEY=SECRET_DA_RUNPOD
CLEANER_GPU_CONCURRENCY=3
```

Na VPS, configure o mesmo `CLEANER_WORKER_SECRET`. Na RunPod, use uma GPU por
worker, `min workers=0`, `max workers=3`, FlashBoot e timeout compatível com o
maior chunk (recomendado: pelo menos 20 minutos para DiffuEraser).

## Imagem serverless

```bash
cd backend
REGISTRY_USER=nivaldo12 IMAGE_NAME=leaneria-runpod ./scripts/build-push-runpod.sh
```

Use `backend/Dockerfile.runpod`. Monte o Network Volume em `/runpod-volume` e
confirme os pesos nos caminhos configurados por `PROPAINTER_*` e
`DIFFUERASER_*`. Tags imutáveis devem ser usadas no endpoint; evite depender de
`latest`.

## Verificação antes de publicar o app

1. No CleanerIA, clique em **Verificar RunPod**. O retorno precisa ter
   `online=true`, `worker_version=v3`, `ai_ready=true` e, para o modo Máxima,
   `max_ready=true`.
2. Envie um vídeo autorizado de 5–10 s com legenda fixa e gere a prévia grátis.
3. Processe em Qualidade/Turbo e confirme no banco que todos os chunks chegaram
   a `done`, sem tentativas duplicadas.
4. Baixe o resultado duas vezes; ambos os downloads devem funcionar.
5. Confirme que entrada/chunks foram apagados da VPS e que o resultado final foi
   preservado.
6. Compare duração, FPS, resolução e presença de áudio com o master.

## Licenças

ProPainter é distribuído para uso não comercial pela NTU S-Lab. DiffuEraser é
Apache-2.0, mas sua configuração oficial usa ProPainter como prior e herda essa
restrição. Não ative esses modelos em um produto pago sem licença/autorização
compatível. Consulte `MODEL_LICENSES.md`; os fallbacks próprios/OpenCV continuam
disponíveis para uma rota comercial.
