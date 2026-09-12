# Analogue ChatScene — Fase 0: arquitetura e plano de implementação

Criador de vídeos narrativos em formato de conversa. Não é um app de mensagens:
o usuário escreve uma conversa, escolhe o visual e o ritmo, e sai um vídeo
vertical pronto para TikTok, Reels e Shorts.

## O que já existe e vai ser reaproveitado

- Exportação de vídeo no próprio navegador (WebCodecs + empacotador MP4), já em
  produção no editor atual. É o mesmo recurso que faz o Chatimator ser rápido:
  sem fila, sem envio para servidor.
- Desenho em tela (canvas) com fontes, sombra e camadas.
- Biblioteca de mídia, armazenamento, autenticação, planos e créditos.
- Agenda e publicação multiplataforma — o ChatScene entra nelas no final.
- Catálogo de assets com licença declarada.

Nada do Cleaner IA nem do editor atual será alterado. O ChatScene é um módulo
novo e isolado, atrás de uma chave de ativação.

## Decisões de arquitetura

**1. Documento único.** `ChatSceneProject` guarda participantes, mensagens,
tema, tempo, mídia, vozes e configuração de exportação. Nenhuma tela mantém
cópia própria do estado: roteiro, prévia, linha do tempo e inspetor leem e
escrevem no mesmo documento.

**2. Quatro camadas separadas.**

```text
CONTENT   quem fala, o que fala, qual mídia    (ChatSceneProject)
THEME     cores, bolhas, tipografia, fundo     (tokens, sem lógica)
TIMING    quando cada coisa aparece            (ConversationClock)
RENDER    como vira imagem e vídeo             (ConversationRenderer)
```

Trocar o tema não mexe no tempo. Trocar o motor de render não mexe no documento.

**3. Tempo determinístico.** Um relógio calcula, a partir do roteiro, uma tabela
"mensagem → quadro inicial e final". Prévia e exportação leem a mesma tabela, o
que garante que o vídeo exportado é idêntico ao que o usuário viu. Sem
temporizadores espalhados pela interface.

**4. Render no navegador primeiro.** O `ConversationRenderer` é uma interface.
A primeira implementação desenha cada quadro em canvas e exporta pelo motor
WebCodecs que já existe aqui. Vantagens: privacidade, custo zero de servidor,
velocidade. O Remotion fica registrado como segunda implementação futura, se um
dia precisarmos de render em servidor — e depende de validar a licença comercial
antes.

**5. Interface própria.** Temas inspirados em conversas, mas com identidade
VaiViral: nada de recriar pixel a pixel um aplicativo de terceiros nem usar
logos alheios.

## Escopo da Fase 1

**Modo Simples** — o caminho de dois minutos: escrever a conversa, escolher
tema, ver a prévia, exportar.

**Modo Estúdio** — acrescenta linha do tempo, inspetor por mensagem e ajuste
fino. Nunca é imposto: entra por um botão.

Funcionalidades da Fase 1:
- Participantes múltiplos, com nome, avatar e cor — grupo desde o começo.
- Mensagens de texto, imagem, emoji, aviso de sistema e "digitando...".
- Quatro temas próprios em claro e escuro.
- Velocidade global (0,5x a 2x) e atraso por mensagem.
- Prévia ao vivo 9:16 com as margens seguras das plataformas visíveis.
- Exportação MP4 1080p no navegador, com aviso claro se o navegador não suportar.
- Salvar e reabrir projetos.

Fica para depois: vozes por participante, notas de voz, reações e respostas,
vídeo e figurinha na bolha, ritmo humano, roteiro por IA, lote.

## Etapas

**Etapa 1 — Fundação (sem tela).** Tipos do documento, criação de projeto,
relógio de tempo e testes. Nada visível ainda.

**Etapa 2 — Tema e desenho.** Tokens de tema, desenho de uma bolha, de uma lista
de mensagens e do cabeçalho da conversa em canvas. Testes de layout com nome
longo, mensagem longa, só emoji.

**Etapa 3 — Modo Simples.** Rota nova protegida por chave de ativação: compositor
de mensagens, seletor de participantes, seletor de tema, prévia 9:16 tocando.

**Etapa 4 — Exportação.** Renderizador de quadros ligado ao motor WebCodecs
existente, com barra de progresso, cancelamento e relatório final.

**Etapa 5 — Persistência.** Salvar o projeto na conta do usuário, listar e
reabrir. Mídia vai para o armazenamento, nunca embutida no documento.

**Etapa 6 — Qualidade.** Revisão visual em 1440, 1366 e 390 px, teste de conteúdo
extremo, verificação do console, tipos, lint, testes e build.

## Detalhes técnicos

- Novos arquivos em `src/lib/chatscene/` (documento, relógio, tema, renderer) e
  `src/components/chatscene/`. Rota `/chatscene` em `src/routes/`.
- `ChatSceneProject`: `id`, `participants[]`, `messages[]`, `theme`, `timing`,
  `render`, `version`. Mensagem: `id`, `participantId`, `kind`, `payload`,
  `delayMs`, `typingMs`, `replyToId`, `reactions[]`.
- `ConversationClock.build(project)` devolve `{ totalFrames, entries[] }` com
  `startFrame`/`endFrame` por mensagem. Função pura, coberta por testes.
- `ConversationRenderer`: `prepare(project)`, `renderFrame(plan, frame, ctx)`,
  `renderVideo(plan, settings)`. Implementação canvas + WebCodecs.
- A exportação precisa de um codificador genérico de sequência de quadros. O
  `encodeMp4` atual é acoplado a um vídeo de origem, então será extraído um
  caminho genérico a partir de `encode-core`/muxer **sem alterar o comportamento
  do `encodeMp4` existente**.
- Persistência na tabela `projects` já existente, com um `mode` próprio
  (`chatscene`), aproveitando as políticas de acesso vigentes. Sem tabela nova
  na Fase 1.
- Chave de ativação `VITE_CHATSCENE_ENABLED`, desligada por padrão; a rota
  responde "indisponível" enquanto estiver desligada.
- Sem dependência nova na Fase 1. Seletor de emoji e animações Lottie ficam para
  a fase seguinte, se necessários.

## Riscos

- Suporte a WebCodecs varia por navegador: prévia funciona em todos, exportação
  precisa de verificação e mensagem honesta quando não houver suporte.
- Render no celular é mais lento; 1080p é o teto da Fase 1, 4K fica para depois.
- Fontes precisam estar carregadas antes de desenhar, senão o texto sai errado
  no arquivo exportado.

## Fora deste plano

Cleaner IA, editor atual, cobrança, publicação automática, roteiro por IA,
clonagem de voz e qualquer cópia fiel de interface de terceiros.
