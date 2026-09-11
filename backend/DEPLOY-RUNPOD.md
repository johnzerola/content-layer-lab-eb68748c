# Pipeline oficial do CleanerIA: Hostear + RunPod Serverless

Esta é a única arquitetura suportada pelo CleanerIA. O app nunca envia a chave
do RunPod ao navegador e nunca manda o vídeo original inteiro para uma função
GPU.

## Identidade da implantação

- Endpoint Queue RunPod: `km860ju9ded2e0`
- API: `https://api.runpod.ai/v2/km860ju9ded2e0`
- Handler esperado: `backend/runpod_handler.py`, `worker_version=v4`
- Imagem vista anteriormente no endpoint: `docker.io/nivaldo12/leaneria-runpod:6bba537`

O ID fica no secret `RUNPOD_ENDPOINT_ID`; não deve ser fixado no bundle do
navegador. Depois de publicar uma nova imagem, o diagnóstico da tela deve
responder `worker_version=v4`. Se responder outra versão, o endpoint ainda está
usando uma imagem antiga.

## Fluxo de dados

1. O navegador cria o job autenticado e recebe um token temporário de upload.
2. O vídeo original vai diretamente para a VPS Hostear. O app apenas faz
   fallback de proxy se o upload direto falhar.
3. A VPS valida o arquivo com `ffprobe`, detecta cenas e texto/marca, gera
   regiões de remoção e planeja chunks de até 15 s, separados por cena. O
   contexto de até 0,6 s nunca atravessa um corte; no limite da cena ele é zero.
   Os trechos enviados são silenciosos. As máscaras finas são calculadas no worker.
4. O servidor do app cria URLs assinadas e envia cada chunk por `POST /run` ao
   endpoint Queue. A chave `RUNPOD_API_KEY` existe somente no servidor.
5. Cada worker RunPod baixa um chunk assinado, localiza a máscara no tempo,
   processa, remove as bordas de overlap e envia o resultado ao Storage.
6. O orquestrador consulta `GET /status/{id}`, confirma que o artefato realmente
   existe e recebe a métrica de texto residual. Falhas técnicas permitem até
   2 envios; resíduo visual alto, borrado e instabilidade geram aviso de revisão.
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
CLEANER_GPU_CONCURRENCY=1
```

Na VPS, configure o mesmo `CLEANER_WORKER_SECRET`. Na RunPod, use uma GPU por
worker, `min workers=0`, `max workers=1` durante a validação de qualidade e
idle timeout curto (5 s). Confirme estas configurações no endpoint: o código
do app não altera a quantidade mínima de workers. Após validar o resultado,
dimensione a concorrência conforme o orçamento. As requisições de chunks
limitam execução a 10 minutos e permanência total a 30 minutos no provedor,
mesmo que o navegador feche. Diagnósticos têm execução de 30 s e TTL de 3 min;
se retornarem ainda pendentes, o app solicita cancelamento.

### Qualidade: revisão e segunda tentativa controlada

O produto envia `options.quality_profile=legacy_refined` por padrão. Esse perfil
reaplica, cena a cena, o contrato que produziu a melhor amostra anterior:

- a máscara de inferência mantém contexto temporal amplo e estável;
- a máscara de composição permanece apertada ao texto detectado;
- frames sem máscara continuam disponíveis como candidatos a referência;
- pixels externos à composição vêm do vídeo original;
- enhancement global permanece desligado.

O contrato é igual para os dois motores oficiais. O preset **Qualidade** usa
ProPainter e o preset **Máxima** usa DiffuEraser; `options.engine` aceita
`propainter` ou `diffueraser` em ensaios controlados. A resposta registra
`quality_profile`, `profile_contract`, `selected_engine` e os relatórios por
cena. O perfil trata legendas e karaokê. Logo, título e demais marcas precisam
de regiões próprias ou do modo Smart; não são incluídos silenciosamente na
faixa da legenda.

Depois da reconstrução neural, `legacy_refined` também executa
`subtitle-junctions-v1` separadamente em cada cena. O estágio transfere pixels
de frames originais somente quando pelo menos dois doadores locais, alinhados e
sem texto, concordam. `CLEANER_SUBTITLE_JUNCTIONS=0` fica reservado para uma
ablação controlada.

`quality_status=checks_passed` indica apenas que as heurísticas passaram, não
garantia visual. `needs_review` acompanha os motivos em `quality_issues` até a
montagem final. Falha de composição seletiva ou sequência incompleta aborta.

`options.selective_second_pass=true` habilita uma comparação experimental:
no máximo uma cena de até 5 s por job, somente se não há texto residual, mas
há sinal de borrado/instabilidade, e DiffuEraser está pronto. A alternativa
parte do original, nunca do vídeo já deformado. Só substitui o candidato
principal se passa as verificações e não piora nenhuma métrica avaliada.
Permanece desligada por padrão até o benchmark real; não atualiza modelos
automaticamente, não encadeia cinco motores e não inicia tentativas ilimitadas.

Confirme `pipeline_revision=scene-masks-v1` na saúde da Hostear. A imagem GPU
também precisa conter a mesma revisão; publicar apenas a interface não basta.

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
   `online=true`, `worker_version=v4`, `ai_ready=true` e, para o modo Máxima,
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
