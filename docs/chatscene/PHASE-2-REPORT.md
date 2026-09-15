# ANALOGUE CHATSCENE — Relatório da Fase 2

Escopo: ritmo humano, animação de entrada, rolagem, enquadramentos de criador e
UX do estúdio. Nada de Cleaner IA, Editor V1/V2, RunPod ou pipelines de GPU foi
tocado. Nenhuma mídia, voz, TTS ou render em nuvem entrou nesta fase.

## O que foi construído

### ConversationTimingEngine (`src/lib/chatscene/timing.ts`)
- `HumanTypingProfile`: velocidade base (caracteres por segundo), variação,
  pausas de vírgula e de fim de frase, rajadas e parâmetros reservados para
  erro/correção de digitação.
- `humanTypingMs`: o tempo de "digitando…" passa a vir do texto, não de um valor
  fixo. Determinístico — a variação usa uma semente estável derivada do id da
  mensagem, então o mesmo documento sempre produz o mesmo vídeo.
- `computeMessageTimings`: cada mensagem ganha etapas explícitas — espera,
  digitando, entrada, leitura/fala, respiro — com marcos absolutos.
- Respiro extra ao trocar de pessoa e leitura maior em mensagens marcadas como
  "momento de peso".
- Campo `voiceMs` já previsto: quando a Fase 4 trouxer voz, a bolha segura o
  tempo real do áudio sem mudar o motor.

### ConversationClock (`src/lib/chatscene/clock.ts`)
- Converte o ritmo em quadros e expõe `entranceFrames` e os tempos em ms por
  mensagem. Prévia e exportação continuam lendo a mesma tabela.

### Animação e rolagem (`src/lib/chatscene/draw.ts`)
- `entranceTransform` com cinco estilos: mola suave, estouro, subindo, suave e
  rápido. Todos terminam em opacidade 1, escala 1 e deslocamento 0.
- ScrollPlanner determinístico: a conversa fica ancorada embaixo, mas a rolagem
  entre mensagens é suavizada em função apenas do quadro atual — sem estado
  acumulado, portanto igual na prévia e no arquivo final.

### Enquadramentos de criador
- `chatRect` + presets: tela cheia, split do criador, celular no centro e
  conversa flutuante, além de valores livres (custom).
- Controles: posição, tamanho, opacidade, arredondamento, cabeçalho ligado ou
  desligado, zoom, deslocamento e desfoque do fundo.

### Estúdio
- Escolha de enquadramento e de estilo de entrada.
- Ritmo humano ligável, respiro ao trocar de pessoa.
- Na mensagem selecionada: respiro depois dela e marcação de "momento de peso".
- Mini linha do tempo clicável abaixo da prévia: cada traço é uma mensagem,
  proporcional à duração, e leva direto até ela.
- Reprodução por `requestAnimationFrame`, ancorada no tempo real decorrido.

## Verificação

| Item | Resultado |
| --- | --- |
| TypeScript (`tsgo --noEmit`) | sem erros |
| Testes ChatScene (`vitest`) | 28 passando (9 novos de ritmo/animação/enquadramento) |
| Conversa com 100 mensagens | plano construído, ordem preservada |
| QA navegador desktop 1280px | sem transbordo horizontal, sem erro de console |
| QA navegador 390px | sem transbordo horizontal, sem erro de console |

## Limites conhecidos

- Sons de envio/recebimento têm o campo no documento, mas ainda não tocam na
  prévia — entram junto com o áudio da Fase 3.
- Agrupamento de mensagens seguidas da mesma pessoa hoje só esconde o nome
  repetido; o encaixe visual das bolhas coladas fica para o refino.
- O modo teclado com erro e correção está parametrizado no perfil, mas ainda
  não é desenhado.

## Portão para a Fase 3

A Fase 2 está fechada e verificada. A Fase 3 (mídia rica, fundos e motor de
vídeo) pode começar a partir daqui.
