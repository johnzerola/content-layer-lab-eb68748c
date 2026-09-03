# Worker GPU real + página /remover

## Objetivo
1. Apontar o CleanerIA para o seu worker GPU HTTPS real (mesmo segredo atual), para rodar ProPainter/DiffuEraser em vídeos de até 5 minutos com qualidade próxima de vmake.ai.
2. Criar uma página nova `/remover`: upload direto do vídeo, controles de força e tempo de referência, processamento e resultado abrindo no editor.

## O que falta de você
Preciso do domínio HTTPS do worker (ex.: `https://gpu.seudominio.com`). Sem ele não dá para trocar a URL. Ele será salvo como segredo do projeto (`CLEANER_WORKER_PUBLIC_URL` / `CLEANER_WORKER_URL`); o `CLEANER_WORKER_SECRET` atual continua.

Depois de salvar, o worker precisa aceitar a origem do app como callback (`CLEANER_CALLBACK_ORIGINS`). Se ele recusar, o app já continua funcionando por polling — só perde o aviso instantâneo de conclusão.

## Etapa 1 — Trocar o worker
- Salvar o domínio HTTPS como segredo e usar essa URL como base única de controle (hoje o código prefere a URL pública quando a interna é `http://`; passará a usar o domínio informado sempre).
- Rodar o diagnóstico de saúde já existente e mostrar no painel: online/offline, GPU (CUDA) e pesos carregados (ProPainter, DiffuEraser).
- Se o worker responder com GPU + pesos, o selo "MODO CPU" some e os presets Qualidade/Máxima ficam liberados.
- Se responder sem CUDA ou sem pesos, o painel diz exatamente o que falta em vez de prometer qualidade máxima.

## Etapa 2 — Página `/remover`
Fluxo enxuto em uma tela, sem substituir o CleanerIA avançado:

```text
[arrastar vídeo]  →  [prévia 9:16 + marcar área]  →  [força / referência / qualidade]
        →  [Prévia 5s grátis]  →  [Remover]  →  [Abrir no editor | Baixar MP4]
```

- Upload direto (arrastar/soltar ou clicar), limite de 5 min / 500 MB, barra de envio.
- Detecção automática de legenda/marca com um clique, e marcação manual por retângulo/pincel.
- Controles visíveis: força da remoção, tempo de referência (quantos segundos vizinhos são usados como fundo), frames de contexto e qualidade (Rápido / Qualidade / Máxima).
- Prévia de 5 segundos antes de gastar o processamento completo.
- Progresso em tempo real com etapa (analisando, reconstruindo, finalizando) e cancelamento.
- Ao terminar: player do resultado, botão "Abrir no editor profissional" (cria o projeto com o vídeo limpo já como mídia) e "Baixar MP4".
- Se o worker GPU estiver fora do ar, a mesma página oferece o modo local (sem GPU) que já existe, com os mesmos controles — mais lento e com qualidade menor, mas sem travar o fluxo.

## Tecnologias de remoção (inspiração vmake.ai)
- GPU: ProPainter como padrão e DiffuEraser no preset Máxima — inpainting com contexto temporal, nunca blur ou mosaico.
- Processamento em blocos sobrepostos para aguentar 5 minutos sem estourar memória, com áudio original remuxado.
- Máscara dinâmica (acompanha texto que se move) e proteção de rosto/pessoa, já presentes no motor.
- Fallback local no navegador (WebCodecs + reconstrução temporal) quando não há GPU.

## Detalhes técnicos
- `src/lib/cleaner.server.ts`: base do worker passa a priorizar o domínio informado; diagnóstico de health continua classificando `not_configured`, `edge_blocked`, `unauthorized`, `unreachable`, `bad_response`.
- Nova rota `src/routes/remover.tsx` + componente dedicado, reutilizando os server functions existentes (`createCleanerJob`, `detectCleanerJob`, `processCleanerJob`, `refreshCleanerJob`) e `runLocalClean` / `LOCAL_ADVANCED_LIMITS` do fallback local.
- "Abrir no editor" grava o MP4 limpo na mesma origem de mídia usada hoje pelo editor profissional e navega com o `projectId`.
- Nenhuma mudança de schema; sem alterar lógica de créditos além de reutilizar a cobrança atual do CleanerIA.

## Limite honesto
Qualidade equivalente à vmake.ai depende do worker rodar em GPU CUDA com os pesos ProPainter/DiffuEraser instalados. Com worker em CPU ou sem pesos, o resultado fica abaixo — o app vai mostrar isso claramente em vez de prometer o contrário.
