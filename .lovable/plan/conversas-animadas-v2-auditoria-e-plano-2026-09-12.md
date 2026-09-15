# Conversas Animadas V2 — auditoria e plano

## Etapa A — o que já existe hoje

O módulo de conversas já é grande e funcional (cerca de 6.800 linhas separadas entre
lógica e telas). Já está pronto:

- Projeto de conversa como fonte de verdade, com participantes, mensagens, tema,
  tempo, fundo, marca e configuração de exportação.
- Tipos de mensagem: texto, imagem, emoji, figurinha, vídeo, voz e aviso de sistema.
- 6 famílias de tema (claro e escuro cada) com cores, fontes e papel de parede.
- Motor de tempo humano: pausa para pensar, "digitando…", ritmo por tamanho do texto.
- Rolagem automática suave conforme cada mensagem entra.
- Câmera com cortes e meia tela, layouts de criador (incluindo conversa sobre gameplay).
- Vozes por personagem com velocidade, tom, pré-escuta e mixagem com música.
- Prévia em tempo real, linha do tempo clicável e exportação de MP4 vertical real.
- Fundo em vídeo, imagem ou papel de parede, com escurecimento.

Conclusão: quase nada precisa ser recriado. O trabalho é de fidelidade visual e de
conforto de edição.

## Gaps visuais (o que ainda não parece as referências)

1. Cabeçalho simples demais: falta status "online/digitando…" animado, ícones de
   chamada e câmera, e o traço de grupo (vários avatares).
2. Balões sem cauda e sem os sinais de entregue/lido; horário pouco discreto.
3. Papel de parede sem textura (as referências têm padrão sutil atrás dos balões).
4. Imagem dentro do balão ainda quadrada e sem legenda; figurinha sem transparência
   bem tratada; GIF não anima.
5. Cartão do chat sem sombra e sem o leve destaque de borda que separa do gameplay.
6. Falta o realce da mensagem "importante" (zoom leve + escurecer o resto).

## Gaps funcionais

1. Não dá para arrastar mensagens para reordenar nem colar uma conversa inteira de
   uma vez.
2. Ajuste fino de quando cada mensagem entra só existe de forma automática; falta
   travar o horário de uma mensagem específica.
3. Fundo em vídeo não tem recorte/posicionamento nem repetição em laço controlada.
4. Efeitos sonoros curtos (pop de mensagem, notificação) ainda não existem.
5. Painéis estão todos numa tela só e ficam longos no celular.

## Arquitetura proposta (mantendo o que existe)

Sem reescrita. Só três separações novas dentro do módulo:

- `chat-ui/` — desenho do cartão, cabeçalho, balões e papel de parede.
- `background/` — fundo: escolha do arquivo, recorte 9:16, laço, desfoque e overlay.
- `sfx/` — efeitos sonoros curtos, entrando na mesma mixagem das vozes.

A tela do editor passa a ter abas: Participantes, Mensagens, Linha do tempo, Fundo,
Vozes, Estilo e Exportar. Tudo continua atrás da mesma rota e sem tocar em Cleaner IA
nem nos editores de vídeo existentes.

## Plano de execução

**Bloco B — fidelidade visual (primeiro, como você pediu)**
Cabeçalho completo com status e ícones, balões com cauda e sinal de lido, papel de
parede com textura, cartão com sombra, imagem com legenda e canto arredondado,
figurinha sem fundo. Três temas de referência revisados: verde escuro, DM social e
minimal claro.

**Bloco C — animação**
Realce da mensagem importante, entrada por tipo de mídia, "digitando…" com bolinhas
animadas, travar horário de entrada por mensagem.

**Bloco D — mídia**
GIF animado, legenda na imagem, espaço reservado para vídeo curto dentro do balão,
efeitos sonoros curtos.

**Bloco E — editor**
Abas, arrastar para reordenar, colar conversa inteira em texto, duplicar participante.

**Bloco F — fundo e exportação**
Recorte e posição do fundo, laço automático, verificação final de exportação e QA no
celular.

Ao fim de cada bloco eu mostro o que foi feito, o que falta e os riscos.

## Riscos

- Mexer no desenho dos balões afeta a exportação: cada bloco termina com um vídeo de
  teste exportado antes de seguir.
- GIF animado pesa na prévia; vai com limite de tamanho e quadros.
