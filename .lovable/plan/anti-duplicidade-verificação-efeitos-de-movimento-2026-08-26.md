# Anti-duplicidade: verificação + efeitos de movimento

## O que já existe hoje (verificado no código)

O motor de variação (`src/lib/variation.ts`) gera, por vídeo, uma variação determinística a partir de uma seed: espelho, velocidade, brilho, saturação, zoom, corte de início/fim, ruído, rotação, moldura, tom do áudio (cents), EQ e limpeza de metadados do MP4.

Essas variações realmente chegam ao arquivo exportado: o `encodeMp4` aplica brilho, saturação, zoom, ruído, rotação e moldura no desenho do quadro, aplica `detune` (tom) e EQ no áudio decodificado, e limpa os metadados do MP4 no final. Ou seja, o sistema funciona — mas hoje ele é **estático**: o zoom é um valor fixo aplicado igual do primeiro ao último quadro, o que é o sinal mais fácil de um detector de conteúdo repetido perceber.

## O que muda

### 1. Zoom animado (o pedido principal)
Novo bloco "movimento" na seção Anti-duplicidade, com presets:

- **Respiração** — vai ampliando devagar e volta ao tamanho normal, em ciclo contínuo.
- **Ken Burns** — deriva lenta de zoom + leve panorâmica numa direção, sem voltar.
- **Pulso no ritmo** — pequenos avanços de zoom nos acentos da fala/áudio, com retorno suave.
- **Push-in de abertura** — entra fechado nos primeiros segundos e abre para o quadro normal.
- **Nenhum** — comportamento atual (zoom fixo).

Controles: intensidade (quanto amplia) e velocidade (duração do ciclo). No modo automático, o preset, a fase inicial e a intensidade são sorteados por vídeo pela mesma seed — cada cópia do mesmo vídeo ganha uma curva de movimento diferente.

### 2. Outras variações "vivas" (mesma lógica: variar ao longo do tempo, não só uma vez)
- **Deriva de cor**: brilho/saturação oscilam de forma quase imperceptível ao longo do clipe.
- **Micro-pan**: deslocamento lento de alguns pixels em X/Y, direção sorteada por vídeo.
- **Balanço de rotação**: a rotação atual passa a oscilar em vez de ficar travada.
- **Vinheta sutil** com intensidade variável (opcional, desligada por padrão).
- **Trim inteligente**: além do corte de início/fim, um leve ajuste de velocidade por trecho para mudar a duração total.

### 3. Verificação real de que funciona
- Painel "impressão digital" no rodapé da seção: além do texto atual, mostra hash de vídeo, hash de áudio e duração final de cada saída, para você conferir que dois exports do mesmo fonte saem diferentes.
- Botão "testar anti-duplicidade": gera 2 amostras curtas do vídeo selecionado e reporta a diferença medida (variação média de pixel, diferença de duração e de tom), confirmando na prática que os arquivos não são idênticos.
- Testes automatizados garantindo que duas seeds diferentes nunca produzem a mesma curva de movimento.

### 4. Pré-visualização
O preview do editor e o modal de ajuste individual passam a animar o movimento em tempo real, para você ver o efeito antes de processar o lote.

## Detalhes técnicos

- `src/lib/variation.ts`: `Variation` ganha um campo `motion` (preset, amplitude, período, fase, direção do pan, deriva de cor). `makeVariation` sorteia tudo pela seed já existente, mantendo determinismo.
- Nova função `motionAt(motion, t, duration)` retorna `{ zoom, panX, panY, brightness, saturation, rotate }` para um instante — usada tanto no encode quanto no preview.
- `src/lib/draw.ts` (`DrawOpts`) já recebe `time`; os valores de zoom/offset/cor passam a ser calculados por quadro a partir de `motionAt` em `src/lib/encode.ts` e `src/lib/render.ts`.
- Pulso no ritmo reaproveita a envoltória de áudio já extraída na decodificação, sem nova análise.
- UI: novos controles em `src/routes/index.tsx` (seção Anti-duplicidade) e no `TemplateEditor`; campos novos entram como opcionais no `Template`, então templates salvos continuam abrindo normalmente.
