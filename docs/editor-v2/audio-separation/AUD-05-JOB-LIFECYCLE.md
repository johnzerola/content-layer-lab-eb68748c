# AUD-05 — fundação do ciclo de vida do job

Data: 13/09/2026. Estado: **CLIENT_DURABLE_METADATA_FOUNDATION_PASS / SERVICE_PERSISTENCE_PENDING**.

Esta entrega inicia a AUD-05 sem ligar o candidato B2 ao endpoint atual. O novo
módulo `src/lib/editor-v2/audio-jobs.ts` define o registro persistível que liga
um job ao projeto, grupo, asset, revisão, fingerprint, intervalo fonte e receita
imutável. Tokens do worker e URLs temporárias não fazem parte da projeção salva.

## Garantias implementadas

- estados explícitos incluem upload, fila, processamento, download,
  cancelamento, conclusão e falha;
- transições inválidas ou regressão de estado terminal são recusadas;
- `completed` exige as duas chaves de storage e duração válida;
- `resultRevision` incrementa uma única vez mesmo se a confirmação terminal for
  recebida novamente;
- resultado tardio só pode ser aplicado se projeto, grupo, asset, hash e
  `sourceRevision` forem exatamente os que iniciaram o job;
- metadados ficam em repositório separado do documento do editor e podem ser
  listados após reload;
- a serialização é uma projeção explícita e não copia campos extras como
  `uploadToken`, `controlToken` ou `resultToken`.

Quatro testes cobrem receita/origem congeladas, ausência de token, fila,
idempotência terminal, resultado obsoleto e persistência separada. O TypeScript
completo passa. Isso prova o contrato local, não retomada de um worker após
reinício.

## Pendente para concluir AUD-05

1. Persistir ownership, receita e estado no serviço/backend, além do lock em
   memória atual.
2. Renovar tickets por usuário autenticado sem colocar tokens no projeto.
3. Fazer start idempotente no servidor e permitir retomar apenas o download sem
   repetir inferência.
4. Persistir ambos os WAVs fora do TTL temporário e validar ownership no status
   e download.
5. Cobrir 401/403/409/413/422/429/507, timeout, reinício, download parcial e
   cancelamento durante validação.

O endpoint legado permanece inalterado e o Editor V2 ainda não inicia B2. Essa
separação preserva o comportamento atual enquanto o storage durável é definido.
