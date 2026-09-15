# ChatScene — execução incremental

> Atualização posterior de 15/09: formatos, páginas no Canvas legado, criação e voz avançaram. Estado vigente e limites em [CREATOR_EXPERIENCE_20260915.md](CREATOR_EXPERIENCE_20260915.md) e [MILESTONE_CONTEXT.md](MILESTONE_CONTEXT.md). O conteúdo abaixo registra a etapa inicial.

15/09/2026. Contrato desta rodada: auditoria + reconciliação + uma fatia de base validada; usuário acrescentou pesquisa de três repositórios e entrada Histórias do Reddit.

Estado em 15/09: etapa 1 concluída; etapa 2 validada como piloto isolado; etapa 3 implementada com testes e smoke do componente, faltando smoke autenticado completo. Etapas 4–7 permanecem abertas. Consulte [checkpoint](MILESTONE_CONTEXT.md) e [validação](VALIDATION_20260915.md); não confundir 114 testes de ChatScene aprovados com aprovação da suíte global, que ainda apresentou um erro TLS no teste de publicação.

| Etapa | Entrega | Gate |
|---|---|---|
|1|Auditoria e reconciliação; canônico com fontes/incertezas|Sem timestamps impossíveis ou números rotulados como medidos sem fonte|
|2|Perfil e Clock V3 experimental; medição reutilizada; páginas por altura|Determinismo,1/4/5mensagens, overflow/texto/mídia/reset, duração real domina, sem overlap|
|3|Entrada Reddit: colar/revisar/adicionar e atribuição|Sem perda silenciosa de texto, validação, undo, roundtrip; usar vozes existentes|
|4|Conectar preset ao Canvas de preview e export com mesma medição|Quadros de fronteira idênticos; testar fontes/mídia/overflow; não promover se falhar|
|5|Concluir contrato de áudio e identidade/performance|Sincronia com áudios reais; speed sem alterar pitch por acidente; erro claro se provider falha|
|6|StoryBeat/sessões, refinamento visual e humanização|História original30–45s,3perfis de personagem, mídia, páginas, narrativa; revisão temporal|
|7|Reddit narrado avançado|Importador autenticado/API se necessário; alinhamento de legendas por palavra fora da estética do chat; avaliação de fonte e atribuição|

Parar após as entregas autorizadas validadas, não integrar catálogo inteiro de providers/modelos. Não reescrever Editor V2/Cleaner. Cada conclusão deve informar arquivos, testes, migração, conflitos, limites e próximo passo único.

QA visual de0–5: fidelidade, densidade, páginas, legibilidade, clareza do falante, sincronia, contraste vocal, gameplay, ritmo e impressão geral. Campos não observados ficam UNDETERMINED, nunca5 por teste unitário. Não aprovar estética ou voz só com documentação.

Sem nova Skill: `chatstory-product-architect`, `conversation-timing-engineer`, `chatstory-render-engineer`, `voice-casting-engineer` e `chatstory-visual-qa` já cobrem o trabalho. iArt conflita com referência ao obrigar digitação/scroll, portanto não instalar automaticamente.
