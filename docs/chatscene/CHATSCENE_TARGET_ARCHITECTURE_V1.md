# ChatScene — arquitetura alvo V1

> Atualização posterior de 15/09: formatos, páginas no Canvas legado, criação e voz avançaram. Estado vigente e limites em [CREATOR_EXPERIENCE_20260915.md](CREATOR_EXPERIENCE_20260915.md) e [MILESTONE_CONTEXT.md](MILESTONE_CONTEXT.md). O conteúdo abaixo registra a etapa inicial.

Documento único `ChatSceneProject` → perfil de estilo → plano de tempos → medição de layout → páginas → estado no instante → Canvas/mix. Seleção, playhead e painéis continuam fora do documento persistido.

1. Evoluir `clock.ts` via compilador experimental V3. Não duplicar `messages` em store de preview/render. A tabela compilada é derivada e descartável.
2. `ChatSceneStyleProfile` descreve ritmo/paginação. `FAST_GAMEPLAY_CHAT` é parâmetro do compilador experimental, ainda sem seletor ou campo persistido no produto. A etapa 4 conectará essa escolha; hoje todos os projetos usam o comportamento v2. Geometria continua em `layout`, não em dois lugares concorrentes.
3. Reutilizar `draw.ts:layoutMessages` como medição Canvas; `MessageLayoutEstimator` adapta o contrato. Mesmas fontes, dimensões, nomes, respostas e mídia produzem a mesma partição. Não estimar altura real usando apenas número de caracteres.
4. `ConversationPageManager` usa altura da lista candidata, não4 mensagens fixas. Uma mensagem que sozinha excede o espaço produz diagnóstico explícito; não perder texto nem inventar sucesso. Reset em thread, cartão editorial ou intenção explícita. Sem smooth-scroll obrigatório.
5. Clock compila uma vez por documento/layout; `getStateAt(timeMs)` não muta projeto e suporta seek reverso. Fundo recebe tempo absoluto, nunca reinicia ao mudar página.
6. Voz: reutilizar elenco e direção existentes. Duração decodificada é autoridade. Texto sem áudio produz estimativa marcada; não gerar som fingindo provider. Taxa de identidade e emoção por fala serão harmonizadas numa etapa posterior, sem pitch-up para fingir criança.
7. Sessões reaproveitam `threads`; beats futuros referenciam IDs de mensagem, evitando segundos persistidos que ficam obsoletos quando TTS muda.
8. Histórias do Reddit: título+texto+atribuição → segmentação por frases → narrador único → mensagens editáveis na mesma timeline. Fonte fica no thread. Nenhum scraping ou chamada de IA ao colar texto. Mesmo fluxo de voz, undo, salvar e render. Importação automática por link/API é outra entrega.

Sem dependências novas. Os três repositórios analisados orientam decisões; não substituem autenticação, backend, modelo ou renderer. Remover os módulos experimentais desliga o piloto V3 sem afetar o produto. A entrada Reddit pode ser retirada da UI; histórias já importadas continuam mensagens comuns.
