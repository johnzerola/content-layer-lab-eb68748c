# ADR 0001: laboratório independente de produção

Decisão: infraestrutura em `research/`, skills em `.agents/skills` e configuração
stdio adicionada sem substituir os MCP existentes. O laboratório não importa
`backend.app`, não provisiona GPU e não envia jobs a serviços comerciais.

Motivo: o working tree contém várias mudanças anteriores e a missão exige
evidência antes de alterar o Cleaner. Ambiente Python separado evita conflito
com torch/numpy/SDKs fixados no worker. AST permite inspecionar sem inicializar
modelos, conexões ou callbacks.

Tradeoffs: análise TypeScript é textual, chamadas Python são sintáticas e métricas
GPU devem vir de um runner isolado ou resultado importado. Essas limitações são
explícitas na resposta das ferramentas. Skills fazem análise semântica sobre as
fontes; o MCP fornece evidência, não finge substituir compreensão de código.
