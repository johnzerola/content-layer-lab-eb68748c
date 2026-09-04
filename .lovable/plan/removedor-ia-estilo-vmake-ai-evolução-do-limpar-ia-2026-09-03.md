# Removedor IA estilo vmake.ai — evolução do /limpar-ia

## Objetivo

Transformar o `/limpar-ia` existente em um removedor de legendas e marcas d'água no padrão vmake.ai: detecção automática com ajuste manual (híbrido), prévia rápida de 5 segundos, suporte a vídeos de até 5 minutos e resultado sem blur/mosaico — apenas reconstrução real do fundo com IA.

A base já existe no projeto (tabela `cleaner_jobs`, upload com token HMAC, callback de progresso, página `/limpar-ia`). Este plano evolui essa base em vez de recriá-la.

## Decisões já tomadas

- **Modo híbrido Auto + Manual** — a IA detecta e propõe as áreas; o usuário confirma, ajusta ou desenha novas.
- **Infra serverless (RunPod)** — GPU sob demanda, sem servidor ligado. Volume inicial baixo (poucos vídeos/semana) torna o custo de centavos por vídeo. Migração futura para GPU dedicada exige só trocar o endpoint.
- **Nunca blur/mosaico** — invariante do projeto; sempre inpainting temporal.

## Fase 1 — Worker GPU serverless (ProPainter)

Subir o worker Python no RunPod (serverless) seguindo a arquitetura já documentada:

1. **Worker FastAPI + ProPainter**: recebe o vídeo via upload assinado (HMAC `x-job-token`, já implementado), processa e devolve via `cleaner-callback` (já implementado).
2. **Chunking com overlap**: vídeos divididos em blocos de ~200 frames com 12 frames de sobreposição; blocos processados e unidos sem costura visível; áudio extraído no início com ffmpeg e remuxado intacto no final.
3. **Composite seletivo**: o modelo reescreve apenas a região mascarada; o restante do frame permanece idêntico ao original (zero perda de qualidade fora da área tratada).
4. **Dilatação de máscara**: +8px em toda máscara para eliminar resíduo de borda.
5. **Fallback por reframe**: se a marca está fora da safe zone 9:16, o sistema oferece crop/reframe em vez de inpainting — instantâneo e com qualidade perfeita.

## Fase 2 — Detecção automática (modo Auto)

1. **Legendas**: amostragem de 1 frame/segundo com PaddleOCR; caixas recorrentes na mesma região viram máscaras com intervalo de tempo (suporta legendas que mudam de posição).
2. **Marca fixa**: detecção estatística por baixa variância temporal em regiões semi-transparentes (cantos e bordas) nos primeiros 30 frames.
3. **Marca móvel (TikTok)**: template matching (OpenCV) rastreando o logo a cada N frames com interpolação de trajetória.
4. **Seleção manual de objetos**: SAM2 no worker — usuário clica no objeto na prévia e o modelo segmenta e rastreia pelo vídeo inteiro.
5. **UI Auto/Manual na `/limpar-ia`**: toggle igual à referência; o modo Auto exibe as caixas detectadas sobre o vídeo para confirmar, remover ou complementar com desenho manual antes de processar.

## Fase 3 — Prévia de 5s, créditos e acabamento

1. **Prévia rápida**: botão "Prévia (5s)" renderiza só os primeiros segundos (chunk único, custo mínimo) para aprovação antes do processamento completo.
2. **Cobrança em créditos**: prévia grátis ou 1 crédito; vídeo completo cobrado por minuto, integrado ao sistema de planos/créditos existente.
3. **Barra de progresso real**: o callback já existente reporta avanço por chunk; a UI passa a exibir etapas (detectando → prévia → processando → finalizando).
4. **Download em qualidade original**: MP4 com resolução e áudio originais preservados.

## O que NÃO muda

- Rotas, páginas de vendas, publicação/agenda, editor profissional — nada disso é tocado.
- Fluxo de segurança existente (HMAC, tokens de job, callbacks) é mantido e reutilizado.

## Detalhes técnicos

- **Worker**: Python 3.11, FastAPI, PyAV/ffmpeg, PaddleOCR, OpenCV, ProPainter (pesos baixados no build da imagem RunPod), SAM2 (checkpoint base).
- **Segredos necessários**: `VITE_VIDEO_CLEANER_API_URL` (endpoint RunPod) e `CLEANER_WORKER_SECRET` (HMAC compartilhado) — solicitados via formulário seguro na hora da implementação.
- **Modelos**: ProPainter para o resultado final; máscaras dilatadas +8px; chunks de 200 frames com overlap de 12.
- **Banco**: reutiliza `cleaner_jobs`; adiciona apenas campos de metadados de detecção (caixas propostas, modo escolhido) se necessário — migração pequena com RLS mantida.
- **Limites**: vídeos até 5 minutos e 500 MB na fase inicial; limite por plano configurável.

## Verificação

1. Teste ponta a ponta com vídeo de 30s com legenda fixa: Auto detecta, prévia confere, resultado sem resíduo.
2. Teste com marca móvel de TikTok: rastreamento correto da marca em todo o vídeo.
3. Teste com vídeo de 5 min: chunking sem costuras, áudio intacto, tempo total aceitável.
4. Créditos descontados corretamente por plano.
5. Typecheck + build + teste visual da página `/limpar-ia` com o novo fluxo.
