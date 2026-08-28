# Render na VPS (fila server-side com FFmpeg/NVENC)

Objetivo: você monta o lote no navegador, clica em processar e pode **fechar o site**. O servidor renderiza tudo e você volta depois só para baixar (ou receber direto na pasta / no agendamento).

## Como vai funcionar para o usuário

1. No ViralBatch / CorteIA, além do modo atual ("render no navegador"), aparece a opção **Render na nuvem (rápido)**.
2. Ao processar: os vídeos de origem sobem uma única vez para o worker, junto com o "receituário" do template (crop, headline, CTA, legendas, anti-duplicidade, variações).
3. A tela mostra a fila real do servidor (posição, etapa, %, ETA). Pode fechar o navegador.
4. Quando termina: aparece na Biblioteca, com download individual, ZIP do lote e envio direto para o Agendamento em lote.

## Arquitetura

- Reaproveita o worker que já existe na VPS (mesmo host/autenticação do CleanerIA), acrescentando um serviço de render:
  - `POST /render/jobs` — cria o lote com o preset JSON
  - `PUT` de upload assinado por item
  - `GET /render/jobs/:id` — status/etapas por item
  - `GET /render/items/:id/result` — arquivo pronto (link assinado, expira)
  - webhook de conclusão para o app
- Autenticação: mesmos tokens HMAC com escopo (`upload`/`control`/`result`) já usados em `cleaner.server.ts`, agora com escopo `render`.
- Renderização: FFmpeg com filtros (escala/crop/zoom-pan, brilho/saturação/ruído/rotação/borda da anti-duplicidade), legendas queimadas via ASS gerado a partir do transcript, encode NVENC quando houver GPU, libx264 como fallback.
- Fila: workers concorrentes limitados por GPU/CPU, retry por item, item que falha não derruba o lote.

## Paridade com a prévia (ponto crítico)

O que hoje é desenhado em canvas precisa dar exatamente o mesmo resultado no FFmpeg. Para isso:

- O template vira um **preset JSON versionado** (única fonte de verdade), consumido pelos dois caminhos.
- Overlays complexos (headline, CTA, molduras, logo) são rasterizados em PNG com alpha no navegador, no momento do envio, e compostos pelo FFmpeg — evita divergência de fonte/kerning.
- Movimento (Breathe / Ken Burns / Pulse / Push-in) é traduzido em curvas `zoompan` equivalentes às usadas no canvas.

## Mudanças no app

- `src/lib/render-cloud.ts` — cliente da fila (criar lote, subir mídia, acompanhar, baixar).
- `src/lib/render-cloud.functions.ts` + `render-cloud.server.ts` — server fns autenticadas, assinatura de tokens, webhook em `src/routes/api/public/render-hook.ts`.
- `src/lib/preset.ts` — serialização do template para o preset JSON versionado.
- `src/lib/batch-runtime.ts` — passa a aceitar dois backends (`local` | `cloud`) mantendo a mesma UI de progresso.
- `BatchProgressDock` e Biblioteca passam a mostrar jobs de nuvem retomados após recarregar/fechar.
- Tabelas no backend para persistir lotes/itens por usuário (com RLS), para a fila sobreviver a qualquer reload.

## Fora do escopo agora

- Provisionar VPS nova: usamos a que já existe.
- Cobrança por minuto de GPU (fica no modelo de créditos atual).

## Entrega em duas etapas

1. Fila + render server-side com paridade de crop/zoom/anti-duplicidade/overlays e download/ZIP.
2. Legendas queimadas no servidor + ligação automática com o Agendamento em lote.
