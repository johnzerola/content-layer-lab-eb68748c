# AUD-06 — integração das duas trilhas no Editor V2

Data: 14/09/2026

Estado: **CLIENT_FLOW_IMPLEMENTED / BROWSER_REGRESSION_PASS / LIVE_AUTHENTICATED_SEPARATION_SMOKE_PENDING / MODEL_NOT_SELECTED**

## Resultado implementado

O Inspector do Editor V2 agora oferece **Separar diálogo e música** quando o vídeo ou uma de suas representações de áudio está selecionado. Se ainda não houver WAV fonte, o mesmo fluxo extrai e persiste o áudio completo antes de solicitar o job. O usuário também pode cancelar a operação e, depois que os stems existem, executar novamente ou restaurar o áudio original.

O resultado aceito é aplicado em uma única transação do documento:

- asset e clipe de **Diálogo** na faixa `voice`;
- asset e clipe de **Música e ambiente** na faixa `music`;
- representação ativa do grupo alterada para `separated`;
- áudio embutido e extraído mantidos como origem restaurável, sem reprodução simultânea;
- WAVs e waveforms registrados no armazenamento local e nos mapas de runtime.

Os dois clipes preservam `projectStart`, `projectEnd`, `sourceIn`, `sourceOut` e `playbackRate` do vídeo. Mute, solo, ganho, exclusão de um stem e restauração passam pelo mesmo estado usado no resolvedor de prévia e no manifest de render.

## Proteções

- O fluxo não usa `suppressMusicBleed`; esse pós-processamento antigo pode alterar duração/tom e não demonstrou resolver vazamento musical.
- Cancelamento impede aplicação tardia.
- Antes de aplicar o resultado, o cliente confere grupo, asset de origem, `sourceRevision` e fingerprint da fonte congelados no início do job.
- O cliente salva metadados do job antes do upload e registra os estados observados `uploaded`, `queued`, `processing`, `downloading` e o terminal. Tickets e URLs temporárias não entram nesse registro.
- Engine, modelo e configuração anunciados por `/capabilities` formam a receita congelada; o worker também devolve engine/modelo do resultado para os assets.
- Uma nova separação cria revisão e IDs novos; os object URLs e arquivos derivados substituídos deixam de ser usados pelo runtime.
- O arquivo original e o áudio extraído continuam preservados.
- O B2 experimental não foi promovido silenciosamente. O fluxo chama o contrato de serviço já autenticado; a receita de produção continua a configurada no serviço atual.

## Evidência executada

### Testes de estado e integração

`npm run test -- src/lib/__tests__/editor-v2-project.test.ts src/lib/__tests__/stem-service.test.ts src/lib/__tests__/editor-v2-audio-jobs.test.ts`

Resultado: **4 arquivos, 57 testes aprovados**. A cobertura inclui aplicação atômica, relógio do clipe, exclusão individual, mute, solo, restauração, serialização, manifest, estados de rede e ciclo de jobs.

### Tipos e build

- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado para cliente, SSR e preset Cloudflare.

O build mantém avisos já existentes sobre `inputValidator` depreciado, import dinâmico ineficaz e chunks grandes. Nenhum deles impediu a compilação desta integração.

### Navegador

`scripts/editor-v2-audio-source-qa.mjs` passou no Chrome com `VITE_EDITOR_V2_ENABLED=true`:

- importou MP4 H.264/AAC;
- manteve um único monitor de áudio;
- extraiu WAV e waveform;
- recarregou projeto e mídia;
- detectou remoção do arquivo no IndexedDB;
- religou o WAV;
- voltou ao áudio embutido;
- confirmou que **Separar diálogo e música** fica habilitado antes e depois da extração;
- confirmou que **Restaurar áudio original** não aparece antes de existirem stems;
- terminou sem erro de console.

Evidência visual: `output/playwright/editor-v2-audio-source/audio-source-1440x1000.png`.

`scripts/editor-v2-phase5-qa.mjs` também passou sem erro de console. Waveform fria: 549 ms; aquecida: 281 ms nesta execução local. Esses números são amostra de desenvolvimento, não meta de produção.

## Limites honestos

O teste de navegador não enviou um job autenticado ao serviço remoto. Portanto ainda faltam:

1. smoke autenticado de ponta a ponta com um arquivo curto e os dois WAVs baixados;
2. persistência durável do job no backend, ownership e retomada após reload/outro dispositivo;
3. comparação sincronizada Original/Diálogo/Música antes de aplicar;
4. validação auditiva humana em conversa espontânea e música real;
5. seleção e promoção explícita da receita neural;
6. exportação real medida, que pertence à AUD-07.

Esta entrega torna o fluxo cliente concreto e reversível. Ela não aprova qualidade neural, Hostear para vídeo longo ou liberação comercial.
