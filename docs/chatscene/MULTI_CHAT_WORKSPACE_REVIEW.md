# ChatScene: edição por chat e bibliotecas

## Referência e direção

Referência: capturas do usuário de aicut.pro/create/fake-text (24/09/2026).
A comparação é visual; não houve acesso ao código ou às funções internas desse serviço.

Emprestamos a hierarquia: chat selecionado, cinco assuntos principais, biblioteca em
modal com busca e cartões, prévia vertical persistente ao lado do editor. Mantemos
a identidade violeta, componentes Radix, fontes e motor de renderização do VaiViral.
Não copiamos marca, catálogo privado, créditos/preços, vídeos ou licenças presumidas.
Fidelidade: organização próxima da referência, com aparência nativa do VaiViral.

Implementação em `feat/chatscene-multi-chat-workspace`, sem publicar em produção.

## Comparação de funções

| Referência | Situação do ChatScene nesta alteração |
| --- | --- |
| Adicionar Chat 2 | Cabeçalho com seleção, criação, duplicação e remoção de chats. As conversas aparecem em sequência no mesmo vídeo, não lado a lado. |
| Conversa em grupo | Tipo direto/grupo, nome e foto por chat; autores usam os personagens existentes do projeto. |
| Mensagens por conversa | Lista filtrada, inclusão no chat selecionado, reordenação e importação. IDs, respostas internas e sons são preservados na cópia. |
| Texto, chat, vídeo, vozes, música | Cinco abas principais; roteiro, personagens, clonagem, timeline e exportação continuam acessíveis. |
| Biblioteca de vídeos | Modal com miniaturas, busca, categoria, upload próprio e estado de arquivo indisponível. |
| Vídeos liberados | Três loops abstratos originais com miniaturas e script reprodutível. Não são Minecraft/GTA/Subway Surfers nem foram retirados do concorrente. |
| Catálogo de vozes em cartões | Busca, gênero, idade, coleção, seleção e ação de pré-escuta. Usa o catálogo já existente, sem inventar novas identidades ou habilitar motores indisponíveis. |
| Voz por personagem | Controles e integração existentes preservados. A disponibilidade depende do serviço real; o teste visual usa respostas simuladas explícitas. |
| Prévia e enquadramento | Motor compartilhado existente preservado, incluindo formatos, posição, altura, opacidade, cantos e animações já disponíveis. |
| Música e sons | Música separada em aba própria; sons e configuração de mensagens existentes preservados. |

Não há paridade integral: contador de mensagens não lidas, opção de sombra
independente e controles de layout distintos para cada chat não foram adicionados.
Layout, fundo e música continuam no nível do vídeo. O catálogo de vozes externo da
conta ElevenLabs continua no seletor existente, não nos novos filtros locais.

## Correções estruturais

- `createChatSceneProject` agora aceita as threads recebidas.
- `createMessage` preserva `soundEffect` ao recriar/normalizar mensagens.
- Remover um chat preserva suas mensagens, movendo-as para o primeiro restante.
- Projetos antigos sem `threadId` continuam resolvendo para o chat principal.
- Novo chat vazio tem prévia vazia; incluir/selecionar mensagem posiciona a prévia.
- Upload temporário de foto avisa que a mídia não foi persistida.

## Evidências de validação local

- TypeScript sem erros.
- Build de produção concluído; avisos de depreciação e tamanho do projeto permanecem.
- Suíte ChatScene: 311 testes passaram, 2 ignorados (29 arquivos passaram, 1 ignorado).
- Seis testes de edição por chat passaram novamente após a correção de sons.
- Navegador Chrome isolado: adicionar chat, grupo, mensagem, duplicar, remover,
  buscar fundos/vozes, selecionar fundo, Escape e retorno de foco passaram.
- Tab/Shift+Tab permanecem dentro dos modais em 15 passos por direção.
- Sem overflow horizontal em 1440, 1366 e 390 px. Modal móvel medido em 759,6 px
  numa viewport de 844 px (limite 90dvh).
- Prévia exercitada em 9:16, 16:9 e 1:1. Nenhuma exceção JavaScript nesse fluxo.
- MP4 originais: 540×960, 24 fps, 8 s, H.264, sem áudio.

Capturas e roteiro de teste em `output/playwright/multi-chat-qa/` (artefatos locais).
O navegador usa stubs apenas para chamadas externas; não demonstra disponibilidade
do serviço de voz, upload autenticado, salvamento remoto ou exportação publicada.

O verificador visual automatizado adicional não iniciou por ausência de
`@axe-core/playwright`; usamos o roteiro Playwright isolado. Os verificadores de
texto geraram falsos positivos para estados vazios em português e labels aninhados.
Não foi feita auditoria WCAG integral, contraste automatizado, teste de todos os
tipos de mídia/temas ou de grupo com cinco personagens. Não declarar aprovação
integral do visual ou funcionamento 100% em produção.

## Publicação

Direção visual aprovada pelo usuário em 26/09/2026. Integração autorizada.
Após a publicação, realizar smoke test no ambiente autenticado e no export.
Os arquivos de mídia originais precisam acompanhar a publicação do frontend.

### Integração em 26/09/2026

Aplicado sobre `origin/main` em `6c3a2242`, preservando as mudanças recentes de voz
e editor. TypeScript e build passaram. A suíte atual teve 307 testes aprovados,
4 falhas e 2 ignorados. As mesmas quatro falhas foram reproduzidas em uma worktree
isolada de `6c3a2242`, sem esta implementação:

- teste de pitch após transformação do servidor (1 falha);
- versão esperada do FFmpeg 6.1.1 versus instalada 8.1.1 (1 falha);
- tolerância de duração de dois áudios MP3 (2 falhas).

Não alteramos o processamento de áudio para mascarar essas falhas. Os seis testes
de múltiplos chats passaram. A publicação do frontend no Lovable e o smoke test
autenticado continuam separados do envio do código ao GitHub.
