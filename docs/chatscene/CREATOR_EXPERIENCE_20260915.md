# ChatScene — formatos, criação e atuação

15/09/2026. Implementado e validado localmente. Geração autenticada e avaliação auditiva continuam pendentes.

## Correção de vozes e entrada de mensagens

O Voice Cast agora destaca sete identidades sintéticas PT-BR por função: adulto
chefe, adulto amigável, duas crianças masculinas estilizadas e três adolescentes.
O servidor aceita o gateway da Lovable ou a API oficial da OpenAI, escolhendo a
única chave configurada no ambiente. A sessão é renovada quando expira ou pertence
a outro projeto Supabase; a validação final continua ocorrendo no servidor.

Em conversas com painel de altura automática, a chegada deixou de combinar escala,
deslocamento e crescimento. O histórico permanece fixo e o novo balão aparece apenas
pelo crescimento do recorte inferior. Conversas de altura fixa preservam os presets
de animação existentes.

Limite local atual: nenhuma chave `LOVABLE_API_KEY` ou `OPENAI_API_KEY` está presente
no ambiente de desenvolvimento, portanto a síntese real não foi cobrada nem executada.

## O que muda para quem cria

1. Abra `/chatscene`. **Fake WhatsApp** e **História do Reddit** ficam no topo do estúdio. A escolha é salva no projeto; trocar o formato preserva o roteiro e as mídias.
2. Em Fake WhatsApp, descreva a situação ou use uma das três ideias iniciais. Escolha tom, duração desejada e elenco. **Criar conversa para revisar** gera primeiro o roteiro; a geração simultânea de vozes é opcional e começa desmarcada.
3. Em Reddit, cole título e relato, revise os blocos e adicione ao roteiro. Autor, comunidade e link são opcionais. O link registra atribuição; não busca o post automaticamente. A importação acrescenta uma história e não apaga as anteriores.
4. **Experimentar exemplo** carrega uma história original do formato selecionado, sem áudio gerado. Substitui a conversa atual e permite desfazer.
5. Revise em **Revisar falas**, escolha o elenco em **Vozes e atuação**, gere as falas e confira a reprodução. Use **Vídeo de fundo** para a mídia de sua escolha. Os exemplos usam gradiente; não incluem gameplay do canal de referência.
6. Para um documento antigo, escolha Fake WhatsApp ou **Aplicar visual** para adotar o novo visual. Abrir o documento sozinho preserva o estilo histórico.

## Implementação

- `CreatorFormatPicker` e `StoryPanel`: escolha persistente e criação orientada, sem depender de uma aba interna pouco visível. O prompt digitado permanece ao alternar formatos/abas. Erros e progresso continuam nas ações reais existentes.
- `creator-presets.ts`: apresentação escura com conversa na região superior, balões legíveis, entrada curta e câmera fixa. Conteúdo, identidade e mídias são preservados ao mudar formato; exemplos são originais e explícitos.
- `draw.ts`: páginas calculadas pela altura real dos balões e pelas fontes/mídias carregadas. Usa o `ConversationPlan` existente, compartilhado pela prévia e exportação. Um novo grupo/conversa também inicia uma página. Cache por documento/plano/geometria. Textos excepcionalmente longos são reduzidos para caber; devem ser divididos para boa legibilidade.
- `reddit-draw.ts`: cartão dedicado com título e atribuição da história ativa, mais o trecho correspondente ao quadro atual. Sem relógio de WhatsApp, votos inventados ou realce de palavras com sincronismo fictício. Fundo usa tempo absoluto.
- `story-generation.ts`: prompt PT-BR com conflito imediato, respostas curtas, personagens distintos, continuidade e desfecho preparado. Valida JSON completo, limites e referências dos falantes. Não corta o final para caber em 90 mensagens, nem transfere uma fala desconhecida a outro personagem. Validações não certificam qualidade literária de uma geração ainda não feita.
- `story.ts`: idade e gênero declarados prevalecem sobre suposições pelo parentesco; um filho adulto não recebe voz infantil apenas por ser filho. Exatamente um dono do celular após normalização.
- `voice-request.ts`, `voice.ts`, `voice-resolution.ts`, `voice-cast.ts`: instruções de atuação completas até 1600 caracteres, identidade declarada transmitida, troca de preset substitui o som anterior e isola perfis compartilhados. Chave de cache `ator-br-3` impede reutilização de falas produzidas com o contrato antigo. Áudios antigos não são restaurados magicamente: precisam ser gerados novamente.

O Clock V3 continua experimental e isolado. Esta entrega conecta páginas ao Canvas legado já ativo; não migra o scheduler de áudio. Nenhum provider, pacote, MCP, banco ou infraestrutura de execução foi adicionado.

## Referências verificadas

Os seis prints de `G:/dowloand/aachat` e o [Short de Léo Conversas Animadas](https://www.youtube.com/shorts/JeQX0EKT4z4) orientam proporção, contraste, densidade e espaço para o fundo. A página e um quadro real foram visualizados nesta rodada; o quadro mostra balões escuros sobre vídeo. Captura local: `output/playwright/youtube-channel-reference-current.png`.

O download comum do vídeo/áudio retornou HTTP 403. Não houve escuta crítica do áudio nesta rodada, identificação do provider ou comparação de timbre. Não afirmar que as vozes agora são iguais às do canal.

A avaliação de [Superviral, iArt e Floom OpenCut](REPOSITORY_REUSE_REVIEW_20260915.md) foi reaproveitada. O código desta entrega foi implementado sobre nossos contratos: os exemplos externos não atendiam ao elenco por identidade e ao cálculo real de páginas sem uma substituição maior. A autorização de cópia já foi registrada; não há novo pedido de permissão.

## Evidências

| Verificação | Resultado |
|---|---|
| Suíte ChatScene | 19 arquivos, 220 testes aprovados |
| TypeScript e ESLint direcionado | Saída 0 |
| Build | Saída 0, sem deploy |
| Desktop e celular | 1440, 1366 e 390 px; sem overflow horizontal nas superfícies exercitadas |
| Interações | Alternar por teclado, manter prompt, revisar/importar Reddit, desfazer/refazer, opção de gerar vozes, estado ocupado, reprodução/pausa/seek passaram no harness |
| Console do harness após recarregar | Zero erros; avisos de leitura frequente do Canvas causados pela comparação de pixels |
| Formatos de render | Exercitados 9:16, 1:1 e 16:9, incluindo limites de texto e páginas nos testes |
| Exportação WhatsApp | H.264, 720×1280, 30 fps, 513 quadros, 17,1 s, 2.702.928 bytes |
| Exportação Reddit | H.264, 720×1280, 30 fps, 714 quadros, 23,8 s, 2.035.589 bytes |

Os dois MP4 foram produzidos pelo `encodeFrameSequence` real e conferidos com ffprobe. Não contêm áudio. Quadros decodificados foram inspecionados; isso não equivale a revisão humana contínua de um vídeo com vozes. Arquivos em `output/playwright/chatscene-{whatsapp,reddit}-visual.mp4`, ignorados pelo Git.

A comparação HTMLCanvas/OffscreenCanvas encontrou pequenas diferenças de rasterização; **igualdade pixel a pixel não passou**. No controle 1080×1920/WhatsApp, o erro absoluto médio por canal ficou entre 0,00189 e 0,00568, com máximos pontuais até 134. Os testes de conteúdo, páginas e tempo passaram. Não confundir contrato comum de desenho com pixels idênticos em superfícies diferentes, nem com identidade após H.264.

O harness usa os componentes, histórico e renderer reais, mas substitui somente o callback de geração por um registro local. Não valida login, cobrança, upload, resposta do modelo ou TTS. A rota principal em `http://127.0.0.1:8091/chatscene` abre corretamente e exige login no navegador isolado; a autenticação foi preservada.

A falha TLS da suíte global registrada na [validação inicial](VALIDATION_20260915.md) continua sendo uma pendência separada. Não foi repetida a suíte global nem alterada a verificação de certificados nesta fatia.

## Próximo teste de produto

Na sessão autenticada, gerar uma conversa de 30–45 s, revisar o texto e ouvir amostras de dois ou três personagens antes de gerar todas as falas. Conferir idade, emoção, naturalidade, pausas, continuidade de fundo e MP4 com áudio. Só esse teste permite aprovar a qualidade vocal e o resultado completo. Nenhuma comparação com o canal está aprovada ainda.

Para manutenção, Sol / medium atende aos ajustes de UI e contrato cobertos pelos testes; Sol / high para timing/áudio. Astra / high apenas se aparecer conflito causal ou arquitetural. São orientações de trabalho, não resultados de benchmark financeiro.

## Rollback

Documentos sem `storyFormat`/`pagination` abrem em WhatsApp/scroll. Para voltar ao desenho anterior de um documento, definir `storyFormat: "whatsapp"` e `layout.pagination: "scroll"` e restaurar seu layout salvo. Desfazer a aplicação do visual recupera o documento na sessão. A nova renderização Reddit pode ser desativada sem perder seus blocos de texto. Não apagar mídias ou reescrever histórico Git.
