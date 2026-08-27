# Agendamento em massa: pasta inteira → calendário automático

Subir dezenas de fotos e vídeos de uma vez (ou pegar direto os resultados do ViralBatch/CorteIA) e deixar o sistema distribuir tudo no calendário conforme "quantos posts por dia" você quiser.

## Como vai funcionar

1. Na Agenda, botão **Agendar em massa**.
2. Você escolhe arquivos ou uma pasta inteira (fotos e vídeos juntos), ou marca "usar resultados prontos" das outras ferramentas.
3. Define:
   - conta(s) de destino e tipo de post (Reels/Feed/Stories/Shorts, foto vai para Feed/Stories);
   - data de início;
   - **quantidade por dia** (ex.: 3);
   - horários: **fixos** (ex.: 09:00, 13:00, 19:00) ou **automático** (espalhado entre uma hora inicial e final, ex.: 08:00–22:00);
   - dias da semana permitidos (opcional);
   - legenda base + variações simples (ex.: numeração, hashtags fixas).
4. Ordem dos arquivos: nome A–Z.
5. Uma **prévia do calendário** mostra data/hora de cada item antes de confirmar (ex.: 30 fotos ÷ 3 por dia = 10 dias).
6. Confirmar: upload em lote com barra de progresso e criação dos agendamentos; se algum item falhar no upload, os demais continuam e o item fica listado para nova tentativa.

## Suporte a fotos

- Upload aceita imagem (jpg/png/webp) além de vídeo.
- Novo tipo de post `foto` (feed) e foto em stories, publicado pela API da Meta com o fluxo de imagem (container de imagem em vez de vídeo).
- Na Agenda, cada item mostra miniatura de foto ou vídeo.

## Reuso no ViralBatch e CorteIA

O modal de agendamento automático que já existe passa a usar o mesmo motor de distribuição: em vez de só "intervalo de X horas", ganha as opções de posts por dia + horários fixos/automáticos e a mesma prévia de calendário.

## Detalhes técnicos

- Novo módulo `src/lib/schedule-plan.ts`: função pura que recebe (itens ordenados, data inicial, posts/dia, modo de horário, janela, dias permitidos) e devolve a lista de `scheduled_at`. Testes unitários cobrindo divisão exata, sobra e pulos de dia.
- Novo componente `src/components/BulkScheduleModal.tsx` (seleção de arquivos/pasta, configuração, prévia em tabela por dia, progresso do upload) usado pela Agenda e reaproveitado pelo `AutoScheduleModal`.
- `src/lib/social.ts`: generalizar `uploadPostVideo` para `uploadPostMedia` (mantendo o nome antigo como alias), guardar `media_type` e permitir `PostKind` `foto`.
- Migration: coluna `media_type` (`video` | `image`) em `scheduled_posts` com default `video`; sem mudança de RLS.
- `src/lib/publish.server.ts` / adapter Meta: ramificação para imagem (`image_url` + `media_type=IMAGE`/`STORIES`), com as mesmas mensagens de erro normalizadas do fluxo de vídeo.
- Uploads em lote com concorrência limitada (3 por vez) e cancelamento, para não travar a aba.
