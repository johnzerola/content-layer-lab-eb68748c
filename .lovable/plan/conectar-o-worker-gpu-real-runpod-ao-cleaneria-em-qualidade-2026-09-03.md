# Conectar o worker GPU real (RunPod) ao CleanerIA em qualidade máxima

## Objetivo

Tirar o CleanerIA do modo OFFLINE/fallback local e fazê-lo processar no worker GPU real com ProPainter/DiffuEraser, atingindo qualidade equivalente à Vmake.ai em vídeos de até 5 minutos.

## Estado atual (confirmado no código)

- `workerBase()` em `src/lib/cleaner.server.ts` já prefere `CLEANER_WORKER_PUBLIC_URL` quando é um domínio HTTPS válido (sem IP) — nenhuma mudança de código é necessária para "trocar o domínio": basta configurar o segredo com a URL real.
- O selo OFFLINE aparece quando o health check falha; hoje o endpoint RunPod responde, mas em modo CPU e sem os pesos ProPainter/DiffuEraser instalados — por isso a qualidade máxima não é liberada.
- O segredo HMAC (`CLEANER_WORKER_SECRET`) já existe e será mantido.

## O que falta de você (único bloqueio)

O **domínio HTTPS real do worker RunPod** não foi informado. Sem ele não há o que conectar. O formato típico é:

```text
https://<pod-id>-8000.proxy.runpod.net          (pod com porta exposta)
https://api.runpod.ai/v2/<endpoint-id>/runsync  (serverless — exige adaptação)
```

## Plano

1. **Configurar o segredo** `CLEANER_WORKER_PUBLIC_URL` com o domínio HTTPS real do pod RunPod (você me passa a URL, eu gravo via ferramenta de segredos — o valor nunca aparece no código nem no chat).
2. **Validar o health check**: chamar `/v1/health` e confirmar resposta JSON com versão, GPU CUDA detectada e modelos carregados. Se faltar peso ProPainter/DiffuEraser, seguir o `backend/DEPLOY-RUNPOD.md` para instalar os modelos no pod (isso acontece no lado RunPod, com seus comandos documentados).
3. **Confirmar autenticação HMAC**: garantir que o worker aceita o segredo atual (modo legacy vs. HMAC v2 já é detectado automaticamente pelo código).
4. **Teste ponta a ponta**: enviar um vídeo curto pelo estúdio, verificar que o selo sai de OFFLINE, o botão "Enviar para IA" fica ativo, o job processa no worker e o MP4 volta sem blur/mosaico.
5. **Teste de 5 minutos**: validar chunking sobreposto e remux de áudio em vídeo longo, medindo tempo de processamento.
6. **Manter o fallback local** como está: se o worker cair, o modo local continua disponível sem bloquear o fluxo.

## Detalhes técnicos

- Arquivos envolvidos: `src/lib/cleaner.server.ts` (já pronto), `backend/DEPLOY-RUNPOD.md` (guia de deploy), `src/components/CleanerIAStudio.tsx` (UI/health).
- Nenhuma alteração de schema ou banco.
- Se o endpoint for **RunPod serverless** (`/runsync`), o formato de API é diferente do FastAPI do worker; nesse caso será preciso um pequeno adaptador — me diga se é pod ou serverless ao passar a URL.

## Critério de pronto

- Selo ONLINE no estúdio, job real processado no GPU, remoção de legenda/marca d'água sem borrão em vídeo de teste e em vídeo de 5 minutos.
