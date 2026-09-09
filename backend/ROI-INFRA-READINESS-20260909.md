# Prontidao de infraestrutura para a comparacao ROI

Verificado em 09/09/2026, aproximadamente 13:52 UTC. Auditoria somente leitura: GET de saude da Hostear e GET de saude, configuracao do endpoint e template da RunPod. Nao foram iniciados workers, enviados jobs, alteradas configuracoes ou feitos deploys. Nenhum segredo ou URL assinado foi registrado.

## Hostear

- URL publica: `https://cleaner-104-234-186-50.nip.io`.
- `GET /v1/health`: HTTP 200; `online=true`.
- Revisao declarada: `scene-masks-v1`; versao: `2.1.0`.
- `cuda=false`; dispositivo `cpu`.
- ProPainter declarado pronto, com lista de arquivos ausentes vazia. Isso representa prontidao permitida em CPU, nao inferencia GPU validada.
- DiffuEraser declarado indisponivel: codigo, modelos e CUDA ausentes.
- TBE e preenchimento temporal classico declarados disponiveis.
- Recursos declarados: processamento por cenas, mascaras conservadoras de karaoke, sinais de revisao de qualidade e renderizacao em lote.

## RunPod

- Endpoint: `km860ju9ded2e0` (`cleaneria-gpu`). Saude, configuracao e template responderam HTTP 200.
- `workersMin=0`, `workersMax=0`, `idleTimeout=5`, `executionTimeoutMs=600000`.
- Workers: zero prontos, em execucao, iniciando, ociosos, limitados ou com falha.
- Jobs: zero na fila e em andamento; contadores acumulados: 49 concluidos, 20 com falha, zero repetidos.
- Tipos de GPU configurados: RTX A5000, L4, RTX 3090, RTX 4090 e RTX 5090. Nao ha GPU alocada neste endpoint.
- Volume de rede configurado: `qn57kpxk5y`.
- Template: `wblwqgy54h`, nome `cleaneria-scene-masks-validation-20260908`.
- Imagem: `docker.io/nivaldo12/leaneria-runpod@sha256:df9b6633b6941491b7fb57391923b436396c24a463fe7f29684784947f3fe243`.
- Autenticacao do registro configurada: sim. Disco do container: 24 GB.
- A configuracao do template retorna `volumeMountPath=/workspace`. O Dockerfile RunPod local usa caminhos de modelos sob `/runpod-volume`. O template nao explicita overrides para `PROPAINTER_WEIGHTS_DIR` ou `DIFFUERASER_MODELS_ROOT`. Essa diferenca merece conferir o caminho efetivo do volume dentro de um worker; a resposta do template isoladamente nao demonstra uma falha de montagem do volume serverless.
- Overrides de resolucao no template: `PROPAINTER_MAX_SIDE=960`, `DIFFUERASER_MAX_SIDE=960`.

## Credenciais locais

- `RUNPOD_API_KEY` presente: sim.
- `CLEANER_WORKER_SECRET` presente: sim.
- `RUNPOD_ENDPOINT_ID` corresponde ao endpoint auditado: sim.

## Consequencia para o experimento

A Hostear esta acessivel para orquestracao e trabalho em CPU. A RunPod esta acessivel, mas deliberadamente sem capacidade: nenhuma inferencia pode iniciar com `workersMax=0`. Como nao ha worker em execucao, este levantamento nao confirma revisao efetiva do handler, disponibilidade dos pesos no volume ou inferencia dos modelos na RunPod.

O teste local de ROI pode avancar de forma independente. Uma futura prova GPU remota exige imagem contendo a implementacao aprovada, verificacao de caminhos/pesos e inicializacao controlada de capacidade. Os contadores acumulados nao demonstram que a nova implementacao passou por inferencia.
