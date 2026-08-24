# CorteIA: corrigir áudio do player e chegar ao nível OpusClip

## Diagnóstico do bug de áudio (confirmado no código)

Os dois players de corte em `src/components/ClipStudio.tsx` (o card grande, linha ~229, e a miniatura da sequência, linha ~491) têm o atributo `muted` fixo no elemento `<video>`. Nenhum controle de volume existe na interface, então nunca sai som — o arquivo e a exportação estão corretos (o encoder em `src/lib/encode.ts` já grava a trilha AAC/Opus junto com o vídeo).

Ou seja: o áudio existe no arquivo final; o problema é só a pré-visualização.

## Estado atual do CorteIA

Já pronto: detecção de trechos por energia de fala e movimento, corte apoiado na transcrição, score viral com hook/densidade de fala, remoção de silêncios, zoom dinâmico, reordenação por arrastar, exportação 9:16 direta e envio para agendamento.

Falta para se equiparar ao OpusClip/Clippy/AI-Captions: som na pré-visualização, player com timeline e ajuste fino das bordas, legendas virais animadas aplicadas ao corte, b-roll/cortes de câmera automáticos e um relatório claro do porquê de cada score.

## O que será feito

### 1. Áudio no player (correção do bug)
- Remover o `muted` fixo dos dois players e iniciar a reprodução já com som.
- Botão de mudo/volume em cada card e no player principal, com o nível lembrado entre cortes.
- Um corte por vez: ao dar play em um card, os outros pausam, evitando áudio sobreposto.
- Tratamento do bloqueio de autoplay do navegador: se o som for barrado, o player toca mudo e mostra um botão "ativar som".

### 2. Player profissional com timeline
- Barra de progresso arrastável (scrubbing) dentro dos limites do corte.
- Alças para ajustar início e fim do corte direto no player, com atualização do trecho salvo.
- Atalhos de teclado: espaço (play/pause), setas (±1s), J/K/L, M (mudo).
- Contador de tempo do corte e indicação visual do trecho aparado.

### 3. Legendas virais animadas
- Presets prontos (karaokê palavra a palavra, destaque em bloco, estilo "pop") reaproveitando o mecanismo de legendas já existente.
- Pré-visualização das legendas dentro do player do corte e inclusão automática na exportação.
- Botão para aplicar o estilo escolhido a todos os cortes do lote de uma vez.

### 4. B-roll e cortes automáticos de câmera
- Evolução do zoom dinâmico: alternância automática entre enquadramento aberto e fechado nos picos de fala, com transições suaves.
- Reenquadramento seguindo o rosto do orador durante o corte, reaproveitando a detecção já existente.
- Controle de intensidade (sutil / equilibrado / agressivo) no painel avançado.

### 5. Relatório de score viral
- Painel por corte explicando as parcelas do score: força do gancho, densidade de fala, ritmo, conclusão narrativa e retenção estimada.
- Sugestão de título e hashtags para cada corte, prontos para copiar.
- Aviso quando o corte tem pontos fracos (início lento, final cortado) com sugestão de ajuste.

## Detalhes técnicos

- `src/components/ClipStudio.tsx`: remover `muted`, adicionar estado de volume compartilhado, coordenação de "somente um tocando", controles de timeline e trim, painel de relatório de score.
- `src/lib/clips.ts`: expor o detalhamento das parcelas do score (já calculadas internamente) para exibição, e gerar sugestões de título/hashtags a partir da transcrição.
- `src/lib/draw.ts` / `src/lib/encode.ts`: aplicar presets de legenda e as trocas de enquadramento no mesmo pipeline usado na exportação, para o preview corresponder ao MP4.
- `src/lib/autoframe.ts`: reutilizar o rastreamento de rosto para os cortes de câmera automáticos.
- Nenhuma alteração de banco de dados ou backend é necessária.
