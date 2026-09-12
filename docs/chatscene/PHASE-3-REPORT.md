# ANALOGUE CHATSCENE — Relatório da Fase 3

Escopo: mídia rica, fundos, marca do criador, biblioteca de arquivos e decisão
do motor de vídeo. Cleaner IA, Editor V1, arquitetura do Editor V2, RunPod e o
render do Cleaner não foram tocados.

## O que foi construído

### Registro de tipos de mensagem (`src/lib/chatscene/message-kinds.ts`)
Um único lugar descreve cada tipo: rótulo, ajuda, se precisa de arquivo, quais
arquivos aceita, se o texto é legenda, se pode responder outra mensagem e se
ocupa tempo de escuta. A lista de tipos do estúdio e o desenho leem daqui, então
acrescentar um tipo novo depois (enquete, localização, chamada perdida) é
registrar e desenhar — sem espalhar exceções pelo código.

Tipos disponíveis: texto, emoji grande, foto, figurinha/GIF, vídeo/meme, recado
de voz e aviso do app.

### Recado de voz
Bolha com botão de tocar, onda e duração (0:12). A onda é sempre a mesma para a
mesma mensagem, e a parte já "ouvida" acompanha o tempo da cena. A voz em si
entra na Fase 4 — o campo de duração já alimenta o motor de ritmo.

### Resposta a mensagem
Qualquer mensagem pode citar outra: a bolha mostra o trecho respondido com a
barrinha na cor de quem escreveu, como em um mensageiro de verdade.

### Fundos
Além de tema, cor, degradê e foto, agora existe vídeo em laço (gameplay,
paisagem ou textura). O quadro do fundo vem do tempo da cena, não do relógio do
navegador, então a exportação sai igual à prévia. O estúdio avisa em texto que
só devem ser usados vídeos próprios ou com permissão.

### Marca do criador
@ e/ou logo por cima da cena, em qualquer canto, com tamanho e transparência
ajustáveis. Fica fora da conversa, nunca dentro das bolhas.

### Biblioteca de mídia (`src/lib/chatscene/assets.ts`)
Tudo que é enviado fica disponível para reaproveitar com um clique. O mesmo
arquivo nunca sobe duas vezes: a identificação é pelo conteúdo (impressão
digital), não pelo nome. Vale para fotos das mensagens, fundos e logo.

### Motor de vídeo
Canvas 2D + WebCodecs confirmado como caminho de produção, medido contra as
alternativas. Números em `RENDER-BENCHMARK.md`.

## Verificação

| Item | Resultado |
| --- | --- |
| TypeScript | sem erros |
| Testes ChatScene | 36 passando (8 novos de mídia, fundo, voz e marca) |
| Exportação 1080p30, 10 s | 4,3 s, arquivo válido |
| Prévia contra exportação | mesmo quadro (diferença só de suavização) |
| Quadro de exemplo com voz, resposta e marca | conferido visualmente |
| Navegador, computador e celular | sem transbordo e sem erro de console |

## Limites conhecidos

- O áudio do vídeo inserido na conversa ainda não entra na trilha exportada —
  aparece a imagem em movimento, sem som. Som entra junto com a Fase 4.
- Vídeos de fundo e memes são amostrados a 12 quadros por segundo e limitados a
  10 segundos, para manter a memória do navegador sob controle.
- A biblioteca de mídia vive no navegador do usuário; trocar de computador
  mostra a lista vazia, embora os arquivos continuem salvos na conta.

## Portão para a Fase 4

Fase 3 fechada e verificada. A Fase 4 (elenco de vozes, síntese de fala e
sincronização) pode começar a partir daqui.
