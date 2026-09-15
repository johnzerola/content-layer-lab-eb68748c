# Reconciliação da referência

15/09/2026. Não houve acesso ao arquivo de vídeo nem escuta nesta rodada. O anexo `97efad90…/pasted-text.txt` contém **duas análises**: R1 no início, R2 a partir da segunda introdução/Parte 1 (aproximadamente linha 632). `MEASURED` escrito pelo relatório não certifica uma medição nossa. Handoff: `df98c831…/pasted-text.txt`.

Hierarquia aplicada: linhas internamente consistentes → prints → vídeo efetivamente acessível (ausente) → consenso → estatísticas → recomendações. Mesmo linhas consistentes são evidência documental, não verdade do vídeo.

| Campo | R1 | R2 | Reconciliação |
|---|---|---|---|
| Duração | 136 s | 136 s | LIKELY; ambos concordam, último evento tabulado termina em 135,20 s. |
| Mensagens | 55 | 53 | DISPUTED; 53 linhas numeradas em R2. Não equivale ao total visual porque os prints contêm imagem omitida pela análise. |
| Mensagens/min | 24,26 | 23,38 | DERIVADO condicionado: 55/136×60=24,265; 53/136×60=23,382. |
| Palavras / WPM | ~580 /255,8 | resumo 511,76; conclusão ~210 | INVALID o WPM de 511,76. Soma das contagens das linhas=530; /136×60=233,824. Com 131,75 s de fala tabulada:241,366. Não são taxas medidas do áudio; contagem textual também precisa revisão. |
| Caracteres / CPS | ~2840 /18–22 | valores conflitantes | Soma das contagens declaradas=2713; /131,75=20,592 CPS. Condicionado à transcrição fornecida. |
| Lead bolha→voz | 0–50 ms, ~30 | 0 ms | DISPUTED; prints não resolvem áudio ou offsets subframe. |
| Intervalo entre falas | 100–120 ms (ou150) | 65–70 ms;68,30 | DISPUTED na referência. 52 diferenças entre linhas R2: média66,346 ms, mediana60, min50, max200. |
| Digitação | nenhuma | nenhuma | LIKELY; screenshots não mostram indicador, mas não provam ausência no vídeo inteiro. |
| Largura |0,90|0,88|DISPUTED como valor exato; screenshot ~0,87.|
| Altura máxima |0,58|0,50–0,52|DISPUTED; painel observado chega a ~0,61 da área de vídeo. Não usar0,52 como teto comprovado.|
| Máximo visível |5|4|CONFIRMED ao menos5 no print a03e…, contradiz máximo4. Máximo do vídeo inteiro UNKNOWN.|
| Duração de página |11,3 s|9,06 s|DISPUTED;15 páginas R2, incluindo página13 de3,63 s. Faixa publicada não confere com linhas.|
| Movimento |append+micro-scroll+reset|reset sem scroll|DISPUTED; seis estáticos não medem trajetória nem velocidade.|
| Cor / mídia |relatórios descrevem cores claras e0% imagem|0% mídia na tabela|INVALID para esses prints: interface escura, verdes escuros e uma imagem/figurinha de cachorro visível.|

## Prints examinados

Arquivos em `G:/dowloand/aachat`, todos1920×1080. Medidas manuais aproximadas no screenshot, tolerância alguns pixels, **normalizadas na área do player**, não na tela inteira. Player≈(793,185)–(1255,1007):462×822, consistente com9:16. Chat≈x824–1225; topo244–248. Razões≈x0,067, y0,072–0,077, largura0,86–0,87. No maior painel, fundo≈746:altura≈0,61. Não são parâmetros medidos do arquivo original.

| Print (prefixo) | Observação direta |
|---|---|
|f3d9b6b3|Uma bolha parcial; painel baixo.|
|3a3d4c55|Uma bolha completa e próxima parcial; cabeçalho na mesma posição.|
|fd9b2562|Duas bolhas completas; painel mais alto.|
|a03e3ae0|Cinco bolhas visíveis, incluindo quinta na borda inferior.|
|10f26a0e|Imagem de cachorro e texto parcial; mensagens anteriores não estão visíveis.|
|55f4bf6b|Imagem e duas mensagens; ícone de pausa do player sobreposto.|

Consistente com painel de altura variável e troca de conjunto de mensagens. Não permite decidir se a troca foi corte, scroll rápido ou outro comportamento. Gameplay visível em toda a área livre; continuidade temporal e áudio do fundo UNKNOWN. Todos mostram mesmo cabeçalho, portanto troca de cabeçalho não é confirmada por esses prints.

## Correções determinísticas da tabela R2

`scripts/chatscene-reference-audit.py` gera `reference-table-audit.json`, sem copiar os diálogos. Conversão estrita: segundos=60×MM+SS, nunca ler01:09,95 como109,95.

| Beat | JSON incorreto | Linhas MM:SS consistentes |
|---|---|---|
|SB5|fim109,9|69,9|
|SB6|109,95–138,8|69,95–98,8|
|SB7|138,9–157,8|98,9–117,8|
|SB8|158–175,2|118–135,2|

R2 é internamente consistente em53 durações individuais (nenhuma divergência com end−start), mas não em estatísticas gerais. R1 não fornece equivalência completa suficiente para “consertar” suas55 mensagens. Não fundir vozes/personagens pela posição esquerda/direita; há referência a SPEAKER_05 fora dos quatro perfis.

## Decisão de implementação

Preset experimental parametrizado, sem digitação e reset por altura, com reset editorial explícito. RESET_ONLY é uma **escolha de implementação conservadora**, não conclusão sobre scroll original. Medição real de áudio domina estimativa; leads/gaps editáveis. Nenhum código usa valores inconsistentes como gold standard. Vídeo original, offsets de áudio, vozes/emoções e durações reais permanecem pendentes de validação.
