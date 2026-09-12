# Validação antes da fase 5 — 10/09/2026

## Resultado

Validação visual ainda pendente. Nenhum candidato novo foi produzido pelas
tentativas cloud abaixo. Não é possível atribuir melhora visual ou custo por
vídeo às fases 3 e 4 com estas evidências.

## Bloqueio observado

As credenciais funcionam para leitura e alteração via REST e GraphQL. O endpoint
existente confirmou `workersMin=0`, `workersMax=1` e o template de teste.
Mesmo após 60 segundos, `POST /run` retornou HTTP 409, `ENDPOINT_PAUSED`,
afirmando `max_workers=0`. Repetiu-se com a atualização documentada
`saveEndpoint` por GraphQL. A causa da divergência não foi identificada.
Nenhuma dessas respostas forneceu ID de job; não houve inferência aceita.

Diagnóstico refinado:

- **CONFIRMADO:** o plano de controle (REST e GraphQL) gravou e devolveu
  `workersMax=1`, enquanto a API de fila devolveu `ENDPOINT_PAUSED` com
  `max_workers=0`. A recusa aconteceu antes do container e do modelo.
- **PROVÁVEL:** o estado do endpoint na fila não sincronizou com a configuração.
  O contador `throttled=1` reforça um problema de disponibilidade/limite no
  provedor, mas não prova sozinho a causa.
- **PROVÁVEL PARA ENDPOINT NOVO:** a chave pode ter permissão restrita ao
  endpoint existente. A documentação informa que chaves restritas começam com
  acesso `None` para novos endpoints; isso é compatível com o HTTP 403 observado,
  mas o tipo da chave não pôde ser consultado pela API.
- **DESCARTADO NESTA ETAPA:** erro do vídeo, máscara, DiffuEraser ou falta de
  VRAM. Nenhum job foi aceito e nenhum container chegou a iniciar.

Evidências locais em `../benchmarks/runs/`:

- `phase3-existing-unique-20260910/report.json`: REST; espera de 12 segundos.
- `phase3-existing-propagation-20260910/report.json`: REST; espera de 60 segundos.
- `phase3-existing-graphql-named-20260910/report.json`: GraphQL confirmou
  template novo e capacidade 1; processamento recusou por endpoint pausado.

A primeira tentativa GraphQL omitiu `name`, campo obrigatório; foi corrigida
antes da tentativa acima. O template dessa tentativa também foi removido.

## Limpeza e custo

Capacidade restaurada para 0/0, template original e lista original de GPUs
restaurados. Templates criados para os testes e uploads temporários no Hostear
foram apagados. Nenhum volume do usuário foi removido.

Última saúde: zero jobs em fila/em execução; zero workers running, ready,
initializing e idle. O provedor ainda reportava um worker `throttled` após a
restauração, portanto isso não deve ser descrito como todos os estados zerados.

Saldo antes/depois informado: US$ 7,7927807601; gasto corrente informado:
US$ 0,005/h na conta. Isso não é custo de inferência nem comprovação de custo
total zero; armazenamento permanece. Não extrapolar para um vídeo de 3 minutos.

## Entregas locais

- Fase 3: imagem DiffuEraser com pesos, digest
  `sha256:6211f0368323f3647df796aa18f40d7807d1d148f1236a36f96723ef079dc7c8`.
- Runner de diagnóstico com nome único de template, resposta DELETE vazia
  tratada corretamente e indicação de capacidade separada de erro de limpeza.
- Fase 4: Docker reconstruído; oito testes de composição/entrega passaram.
  Verificação de resolução, contagem, FPS, duração e presença/formato de áudio.
  O teste neural disponível continua sendo CPU com quadros sintéticos.

## Próxima ação concreta

Resolver a divergência entre configuração e processamento do endpoint junto
ao provedor, usando os relatórios acima como reprodução. Nenhuma mensagem foi
enviada a suporte. Com o endpoint aceitando jobs, executar a cena de 43 quadros,
revisar o candidato da fase 3, executar a restauração da fase 4 em GPU e comparar
a sequência completa. Somente então iniciar a fase 5.

Referências oficiais consultadas:

- https://docs.runpod.io/api-reference/endpoints/PATCH/endpoints/endpointId
- https://docs.runpod.io/sdks/graphql/manage-endpoints
- https://docs.runpod.io/get-started/api-keys
- https://docs.runpod.io/serverless/troubleshooting
