# ChatScene — avaliação dos três repositórios

Consulta em15/09/2026 via GitHub API, arquivos oficiais e versões fixadas. Download apenas de texto para inspeção; nenhum clone completo, npm install, modelo ou script externo executado. Nenhum código externo incorporado nesta rodada.

Atualização de autorização: o usuário confirmou nesta conversa que já possui as licenças e autorização dos autores para copiar código ou partes. Essa permissão declarada autoriza prosseguir com reaproveitamento dentro do escopo; não foi solicitado novo aceite. As observações abaixo sobre licença pública descrevem o repositório, não negam a permissão particular informada. A escolha de não copiar os trechos inspecionados é técnica: mocks, timing fixo, contrato de dois lados e outro renderer não atendem à fatia atual. Comprovantes e condições da autorização particular ainda não foram anexados ao inventário.

| Projeto / versão examinada | Estado observado | Valor para VaiViral | Decisão |
|---|---|---|---|
|[Superviral](https://github.com/vaibhavvTripathi/superviral/tree/9ef582ceb77dde8f226ada095dba44fe483ab683), `9ef582c`|Último commit2025-07-27; não arquivado;1star;0issues abertas|Fluxo de roteiro→voz→fundo→revisão. Inclui Reddit, fakechat e split-screen.|Referência de fluxo; cópia autorizada conforme declaração do usuário. Os trechos examinados não foram incorporados por usarem áudio dummy, timing fixo e contagens fictícias.|
|[iArt text-message-video-skills](https://github.com/iart-ai/text-message-video-skills/tree/3a800e1e9b9635fa196a07b0143c80f7e9648558), `3a800e1`|Último commit2026-06-22; não arquivado;4stars;0issues abertas|Roteiro como dados, duração derivada, verificação antes de lote.|Assimilar princípios nos contratos/testes existentes. Não instalar Skill duplicada nem impor digitação/scroll ao preset rápido.|
|[Floom OpenCut](https://github.com/floomhq/opencut/tree/57dedbc606e17cc2013f2ca5fcbf8cc69266e488), `57dedbc` v0.1.0|Último commit2026-04-29; não arquivado;4stars;8issues/PRs abertas agregadas pela API|Separação timeline/config/render; validação antes do render e transforms.|Referência arquitetural. Não adicionar outro motor/Express/Remotion para resolver a mesma função.|

Stars são contexto, não avaliação de qualidade. Não é o repositório `OpenCut-app/OpenCut` analisado anteriormente. README e badges são alegações do autor, não benchmarks executados aqui. Issues não foram triadas individualmente.

## Achados no código

- Superviral: [`use-reddit-tts.ts`](https://github.com/vaibhavvTripathi/superviral/blob/9ef582ceb77dde8f226ada095dba44fe483ab683/src/helpers/use-reddit-tts.ts) devolve áudio dummy e registra texto no console. [`RedditStory.tsx`](https://github.com/vaibhavvTripathi/superviral/blob/9ef582ceb77dde8f226ada095dba44fe483ab683/src/remotion/MyComp/RedditStory.tsx) agrupa oito palavras por2,5s e usa contagens fictícias de votos/comentários. Não serve como implementação de sincronização ou prova social. Isso não implica que todo caminho TTS do projeto seja mock.
- iArt: [`references/data-driven.md`](https://github.com/iart-ai/text-message-video-skills/blob/3a800e1e9b9635fa196a07b0143c80f7e9648558/skills/text-message-animation/references/data-driven.md) deriva duração da timeline e sugere validar um caso antes de renderizar lote. Contrato `me/them` é insuficiente para nosso elenco multicaracter; preservar `participantId`. O guia não fornece nosso gerenciador de páginas por altura.
- Floom: [`src/workflow/validator.ts`](https://github.com/floomhq/opencut/blob/57dedbc606e17cc2013f2ca5fcbf8cc69266e488/src/workflow/validator.ts) valida dados básicos; não valida nossa geometria, proveniência, separação de áudio ou sincronismo. Não copiar supondo que cobre esses gates. [`package.json`](https://github.com/floomhq/opencut/blob/57dedbc606e17cc2013f2ca5fcbf8cc69266e488/package.json) exige Node20+, React19 e Remotion; scripts com `timeout 10m` pedem adaptação no Windows. Execução local/cloud possível segundo projeto, não testada nesta máquina.

## Licença, custo e risco

| Source / author / version | License | Commercial use | Attribution / redistribution | Dependencies / segurança | Gate de incorporação |
|---|---|---|---|---|---|
|Superviral / vaibhavvTripathi /9ef582c|Sem licença pública própria; autorização particular confirmada pelo usuário|Autorizado conforme declaração do usuário|Condições particulares ainda não anexadas|Remotion/Next/TTS: credenciais e custos separados; mocks não podem chegar como áudio real|USER_CONFIRMED_PERMISSION; sem cópia por incompatibilidade técnica dos trechos analisados|
|iArt / iart.ai /3a800e1|[MIT](https://github.com/iart-ai/text-message-video-skills/blob/3a800e1e9b9635fa196a07b0143c80f7e9648558/LICENSE)|Permitido para material coberto|Preservar copyright e licença se copiar|Sem dependência adicionada; exemplos recomendam Remotion e libs extras cuja licença não é automaticamente MIT|ALLOWED material MIT com atribuição; não incorporado por sobreposição|
|Floom / buildingopen (copyright), Federico De Ponte(package) /57dedbc|[MIT](https://github.com/floomhq/opencut/blob/57dedbc606e17cc2013f2ca5fcbf8cc69266e488/LICENSE)|Permitido para código coberto|Preservar copyright e licença em cópias|Dependências transitivas/ativos não auditados integralmente; não importar servidor/API nem executar CLI do usuário|ALLOWED código MIT isolado com atribuição; stack completa NÃO aprovada|

Remotion tem [termos, elegibilidade comercial e telemetria próprios](https://www.remotion.dev/docs/license); não assumir que MIT do wrapper cobre a dependência. Nenhuma instalação necessária para a entrega atual. Economia de tokens/tempo dos três não foi benchmarkada. Custo incremental de infraestrutura desta integração: nenhum serviço novo contratado; TTS existente continua sujeito a configuração/custo normais.

## Histórias do Reddit — entrega e limites

Implementação própria sobre `ChatSceneProject`: colar título/texto/autor/comunidade/link opcional; revisar blocos; adicionar thread e narrador; editar na timeline; gerar vozes pelo fluxo existente. Link é metadado de atribuição, não busca automática. Texto não é enviado a terceiros na importação. Não há logo oficial, votos falsos, voz dummy ou legendas com tempo fixo. Use relato próprio ou autorizado.

Atualização: o formato Reddit agora possui cartão dedicado e blocos de narrativa fora dos balões, ligados ao tempo do ConversationPlan. Integração autenticada com API Reddit e alinhamento por palavra continuam posteriores. Ver CREATOR_EXPERIENCE_20260915.md. A função não se apresenta como scraper ou integração oficial.

Rollback: remover entrada de UI/importador se necessário; mensagens já importadas continuam comuns e editáveis. Compilador V3 é isolado, sem alterar o renderer ativo. Não requer migração de banco, configuração do Codex ou troca de autenticação.
