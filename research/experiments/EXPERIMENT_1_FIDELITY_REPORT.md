# EXPERIMENT 1 — FIDELITY, COLOR AND DELIVERY

Data: 11/09/2026  
Resultado: **ACCEPT no harness de fidelidade sem IA; NÃO INTEGRADO em produção.**  
Custo cloud: **US$ 0**.

## 1. Conclusão executiva

A hipótese foi confirmada nas três fontes: o caminho atual acumula perdas de múltiplas recodificações e da composição global, enquanto um transporte lossless/cópia seguido por **um único encode final** preserva mais fielmente o SOURCE.

O candidato passou os critérios definidos na revisão 5.5:

| Critério | Resultado | Decisão |
|---|---:|---|
| Viés Y′ absoluto na rampa conhecida ≤ 0,25 | **0,0328** | PASS |
| Redução de MAE externo ≥ 15% | **56,36% a 68,95%** | PASS |
| Não piorar SSIM mais que 0,001 | melhorou **0,00927 a 0,01041** | PASS |
| Não piorar gradiente mais que 1% | perda residual **0,016% a 0,243%** | PASS |
| Mesma grade, FPS, contagem e PTS | 3/3 fontes, erro PTS **0 s** | PASS |
| Tags completas e verificadas no arquivo | 3/3 fontes | PASS |
| Harness equivalente ao backend | arquivo e YUV decodificado idênticos, 3/3 | PASS |

O resultado não veio de brilho, contraste, saturação ou sharpening. O candidato preserva Y, U e V do SOURCE por planos, normaliza a base temporal antes do framesync e aplica CRF 16 uma única vez no delivery.

Isso fecha o Experimento 1 como prova de arquitetura de fidelidade sem IA. Ainda não prova que a integração com uma região realmente reconstruída esteja correta: na execução real, o ROI RGB do ProPainter precisa ser convertido e inserido somente no suporte editado, sem contaminar os planos externos. Essa validação pertence à implementação futura e não foi autorizada nesta rodada.

## 2. Escopo e controles

Nada foi alterado em B2, ProPainter, pesos, máscaras reais, donors, acabamento, contraste artístico ou textura reconstruída. O backend de produção também não foi editado.

O ensaio usou:

| Caso | Origem local | Seleção | Geometria | Papel |
|---|---|---:|---:|---|
| `current` | `G:/dowloand/teste/padro-01-001 (15).mp4` | 0,0 s | 1080×1920 | clipe atual |
| `independent_detail` | `C:/Users/DINO/Downloads/3vi3f1lms_video_no_watermark.mp4` | 2,0 s | 1378×576 | fonte clara com textura fina |
| `independent_lowlight` | `C:/Users/DINO/Downloads/tiktok_video_no_watermark (1).mp4` | 2,0 s | 768×576 | fonte independente em baixa luz |
| `calibration` | gerado deterministicamente | 90 frames | 640×360 | barras, rampas de luma e chroma |

Cada fonte real produziu 126 frames lossless: três frames de contexto antes, 120 frames de corpo e três depois. A comparação final usa os mesmos 120 frames em todos os braços. Métricas RGB/YUV foram calculadas em 12 frames estratificados; hashes do fluxo YUV cobrem todos os frames.

O áudio foi removido dos controles. O experimento mede somente imagem, timestamps de vídeo e recipiente.

## 3. Pipeline real reproduzido

O caminho alcançável no working tree foi reproduzido com os helpers reais:

```text
SOURCE canônico
  → slice_video                  libx264 / veryfast / CRF 16 / yuv420p
  → scene cut                    libx264 / ultrafast / CRF 0 / yuv420p
  → composite_masked identidade libx264 / slow / CRF 16 / yuv420p
  → trim_edges                   libx264 / veryfast / CRF 16 / yuv420p
  → delivery
```

Quantidade: **quatro encodes de vídeo**, dos quais três usam CRF 16. O encode de cena em CRF 0 foi lossless no domínio YUV420 destes casos, mas continua consumindo tempo e armazenamento.

O compositor atual converte os dois vídeos e a máscara para `gbrp`, executa `maskedmerge` e volta para `yuv420p`. Além da conversão global, seu framesync depende das timebases efetivas dos três inputs. No controle `SOURCE→compositor` aplicado diretamente ao master MKV de timebase 1/1000, alguns frames vizinhos foram escolhidos porque a sequência PNG estava em 1/30. Isso mostra que PTS correto no arquivo de saída, sozinho, não prova alinhamento visual interno.

No caminho completo atual, o `slice_video` já produzia timebase divisível por 30 antes do compositor; portanto não se atribui automaticamente esse deslocamento à execução normal observada. Ele permanece um risco real para outras entradas/intermediários.

Estado implantado: **UNVERIFIED**. Este relatório prova o comportamento do working tree local, não a imagem atualmente publicada no RunPod ou Hostear.

## 4. Contrato colorimétrico reproduzível

### Entrada e delivery SDR

O contrato validado para estas fontes é:

| Propriedade | Valor |
|---|---|
| Primárias | BT.709 |
| Transfer | BT.709 |
| Matriz YUV | BT.709 |
| Range YUV | limitado / `tv` |
| Range RGB de trabalho | pleno / `pc` |
| Pixel format de entrega | `yuv420p` |
| Bit depth | 8 bits |
| Chroma subsampling | 4:2:0 |
| Chroma location | left |
| SAR | 1:1 |
| DAR | derivado da grade, preservado |
| FPS | 30/1 CFR |
| Timebase do delivery de teste | 1/90000 |

O decoder escolhido para avaliação simétrica foi:

```text
scale=in_color_matrix=bt709:in_range=tv:out_range=pc:
      flags=accurate_rnd+full_chroma_int,format=bgr24
```

Ele foi escolhido contra pixels RGB conhecidos antes de avaliar os vídeos reais. SOURCE e candidato usam exatamente o mesmo filtro.

### Calibração com barras e rampas conhecidas

| Decoder | Viés Y′ na rampa | MAE RGB geral | SSIM luma geral | Decisão |
|---|---:|---:|---:|---|
| BT.709 padrão | −0,4773 | 0,8179 | 0,998410 | REJECT |
| `accurate_rnd+full_chroma_int` | **+0,0328** | **0,4570** | **0,998910** | ACCEPT |
| bicubic + accurate | +0,0328 | 0,4570 | 0,998910 | empate, sem resize |
| lanczos + accurate | +0,0328 | 0,4990 | 0,998878 | REJECT |

A perda residual em barras coloridas é esperada ao converter RGB 4:4:4 para YUV 4:2:0. O teste não escolheu uma matriz porque “pareceu mais bonita”; escolheu o menor viés sobre uma rampa conhecida e usou MAE geral para desempate.

## 5. Pipeline proposto no harness

```text
SOURCE
  → transporte lossless ou cópia, preservando YUV e metadados
  → IA = identidade no controle
  → normalizar os três inputs de framesync para TB 1/30 e PTS=N
  → separar Y, U e V
  → compor luma com máscara nativa
  → compor U/V com representação da mesma máscara em meia resolução
  → remontar yuv420p
  → um encode libx264 / slow / CRF 16
  → gravar BT.709/range/SAR/timebase explicitamente
```

No controle de identidade, o segundo vídeo é o próprio SOURCE. A máscara sintética branca serve apenas para obrigar a passagem pelo compositor. O suporte da máscara não foi usado para melhorar métrica; como os dois inputs são idênticos, qualquer valor válido deve produzir o mesmo conteúdo.

Parâmetros completos, incluindo o filter graph e argv sem abreviação, estão em `commands-and-times.json`.

O benefício central é preservar os planos originais fora da edição. Converter o frame inteiro YUV→RGB→YUV introduziu perda adicional mesmo com flags explícitas; os smokes correspondentes foram rejeitados e preservados em `REJECTED-SMOKES.md`.

## 6. Resultado RGB

Comparação simétrica contra o mesmo master de 120 frames, mesmo decoder e CRF 16 final:

| Fonte | Pipeline | MAE | PSNR dB | SSIM luma | Viés Y′ RGB | Gradiente/SOURCE | Edge preservation | ΔE76 aprox. |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| atual | atual | 1,0878 | 41,9718 | 0,985900 | −0,6747 | 0,989486 | 0,95013 | 0,7449 |
| atual | proposto | **0,4228** | **48,0300** | **0,996306** | **+0,0426** | **0,997572** | **0,96334** | **0,3423** |
| detalhe | atual | 1,8769 | 38,0863 | 0,982186 | −1,2072 | 1,000839 | 0,93217 | 1,3127 |
| detalhe | proposto | **0,8190** | **45,4215** | **0,991923** | **+0,0492** | **0,998397** | **0,95328** | **0,6280** |
| baixa luz | atual | 1,4686 | 42,4465 | 0,985395 | −1,1383 | 0,986262 | 0,91299 | 0,9140 |
| baixa luz | proposto | **0,4559** | **48,8526** | **0,994661** | **+0,0142** | **0,999840** | **0,94691** | **0,3452** |

ΔE76 é calculado pelo OpenCV sob hipótese sRGB e serve somente como descritor relativo. Não é CIEDE2000 calibrado com BT.1886.

Redução de MAE:

- clipe atual: **61,13%**;
- fonte independente detalhada: **56,36%**;
- baixa luz: **68,95%**.

Não houve tradeoff escondido em SSIM, gradiente ou bordas: todos melhoraram em relação ao caminho atual. Em relação ao SOURCE ideal, o gradiente do candidato ficou entre 0,997572 e 0,999840, dentro do limite de 1%.

## 7. Planos YUV, histogramas e cor

| Fonte | Pipeline | Y MAE / bias | U MAE / bias | V MAE / bias | Histograma luma L1 |
|---|---|---:|---:|---:|---:|
| atual | atual | 0,8339 / −0,5904 | 0,1949 / +0,0311 | 0,2547 / +0,0626 | 0,04121 |
| atual | proposto | **0,2842 / +0,0364** | **0,0958 / +0,0132** | **0,1304 / +0,0147** | **0,00498** |
| detalhe | atual | 1,4929 / −1,0449 | 0,3524 / +0,0965 | 0,3732 / +0,1000 | 0,03938 |
| detalhe | proposto | **0,5670 / +0,0430** | **0,1862 / +0,0171** | **0,1956 / +0,0155** | **0,00338** |
| baixa luz | atual | 1,1655 / −0,9788 | 0,2213 / +0,0213 | 0,2074 / +0,0355 | 0,07932 |
| baixa luz | proposto | **0,3130 / +0,0122** | **0,0868 / +0,0036** | **0,0955 / +0,0023** | **0,00250** |

O candidato reduz o viés negativo sistemático sem aplicar compensação de brilho. A diferença restante vem do encode CRF 16 e de sua decisão de quantização; o fluxo YUV do candidato coincide exatamente com o teto de transporte submetido ao mesmo encode.

## 8. Ablação de uma recodificação por vez

| Mudança isolada | MAE médio nas 3 fontes | Ganho médio contra atual | Conclusão |
|---|---:|---:|---|
| caminho atual | 1,4778 | — | baseline |
| remover somente `slice_video` | 1,3824 | 6,45% | melhora, não atinge 15% |
| remover somente encode da cena | 1,4778 | 0,00% | pixels idênticos nestes casos |
| fundir somente `trim_edges` ao compositor | 1,3924 | 5,78% | melhora, não atinge 15% |
| remover compositor, diagnóstico identidade | 0,8519 | 42,35% | confirma custo, não é rota para IA real |
| proposta: transporte preservado + um encode final | **0,5659** | **61,70%** | PASS |

Nenhuma remoção isolada atingiu o critério principal. O resultado demonstra que as perdas são cumulativas: a arquitetura precisa evitar todas as recodificações intermediárias com perdas, mantendo somente a entrega final. O encode CRF 0 de cena foi redundante nestas três entradas YUV420, embora possa continuar necessário para isolamento lógico até ser substituído por representação lossless/cópia segura.

## 9. FFprobe, grade e timestamps

Todos os candidatos propostos apresentaram:

- `yuv420p`, 8 bits, range `tv`;
- `color_space=bt709`, `color_transfer=bt709`, `color_primaries=bt709`;
- chroma location `left`;
- SAR 1:1 e DAR correto para cada grade;
- `r_frame_rate=avg_frame_rate=30/1`;
- timebase 1/90000;
- exatamente 120 frames;
- erro máximo de PTS contra o master: **0,000000 s**;
- sequência de duração de frames idêntica.

| Fonte | Grade / DAR | Current bytes | Proposed bytes | Variação | Tempo current | Tempo proposed |
|---|---|---:|---:|---:|---:|---:|
| atual |1080×1920 /9:16 |1.285.558 |1.429.154 |+11,17% |10,53s |6,85s |
| detalhe |1378×576 /689:288 |1.419.532 |1.421.833 |+0,16% |5,84s |4,48s |
| baixa luz |768×576 /4:3 |539.022 |512.797 |−4,87% |2,94s |2,44s |

Tempos são das operações FFmpeg do pipeline de quatro segundos neste computador, sem métricas. A soma das 59 operações de geração da rodada foi **130,84 s**. O tempo total de análise/ffprobe/métricas não foi instrumentado como wall time único e permanece `null`; não foi estimado. O tamanho ligeiramente maior no clipe atual é consequência do conteúdo preservado com o mesmo CRF, não de bitrate fixo.

O arquivo `ffprobe-by-stage.json` contém stream, formato, todos os PTS, duração por frame, keyframes, tamanho e SHA-256 de cada etapa.

## 10. Equivalência e hashes

O SOURCE original selecionado e o master canônico de 126 frames têm o mesmo SHA-256 do fluxo YUV decodificado nas três fontes. O recorte canônico de frames 3–122 também coincide exatamente com o master alvo de 120 frames.

Para cada fonte, estes três outputs têm o mesmo SHA-256 do fluxo YUV completo:

1. teto de transporte com um encode;
2. compositor por planos no harness;
3. cópia de transporte + caminho backend-equivalent.

Além disso, harness e backend-equivalent são byte a byte iguais:

| Fonte | SHA-256 do arquivo harness/backend |
|---|---|
| atual | `5b9475bcbefc03dd5bb3b996233e19e78741248c9c61c91b8d73557d3fa4ee7b` |
| detalhe | `5f60ee30f259b94883ab644b31fff4cd5e1bb0ca4fc67ccf896e9823f753193a` |
| baixa luz | `d29384a91719d58c85f5fee42278a679b2478882af1aa517b03036ee5d9d0611` |

Os hashes completos de origem, masters e fluxos decodificados estão em `source-manifest.json`, `decoded-yuv-hashes.json` e `artifact-hashes.json`.

## 11. Comparadores em movimento

Os três comparadores têm quatro segundos e foram decodificados integralmente sem erro:

- `comparators/current-source-current-proposed.mp4`;
- `comparators/independent_detail-source-current-proposed.mp4`;
- `comparators/independent_lowlight-source-current-proposed.mp4`.

Ordem: **SOURCE à esquerda, CURRENT no centro, PROPOSED à direita**. Como o FFmpeg local não encontrou configuração Fontconfig, os rótulos foram substituídos por barras superiores: verde, vermelho e azul, respectivamente. Isso evita depender de fontes externas e mantém o comparador determinístico.

## 12. Falhas observadas e limites

Os smokes rejeitados foram preservados e descritos em `REJECTED-SMOKES.md`:

- conversão global YUV→RGB→YUV dentro do compositor aumentou MAE e degradou bordas;
- a variante zscale não corrigiu esse custo;
- composição por planos sem timebase comum selecionou quadros vizinhos;
- conferir somente PTS final não detectou essa troca de conteúdo.

O compositor por planos resolve o controle de identidade e preserva o exterior, mas o teste usa dois vídeos idênticos. Antes de produção, é obrigatório validar com um ROI sintético conhecido que:

- a conversão do candidato RGB para YUV ocorre somente uma vez;
- a máscara de chroma em meia resolução não reintroduz letras nem cria halo;
- pixels YUV externos permanecem idênticos antes do encode;
- não há troca de frame em início/fim de chunk;
- áudio e concatenação por múltiplos chunks permanecem sincronizados.

Essas verificações não autorizam alterar B2 ou reconstrução nesta rodada. Elas definem os testes da futura integração de fidelidade.

## 13. Decisão e recomendação

**EXPERIMENTO 1: ACCEPT.**

Aceitar significa que o contrato e a arquitetura proposta passaram no harness sem IA. Não significa deploy, paridade do site, aprovação do compositor com conteúdo diferente, nem melhoria da faixa do suéter.

Recomendação:

1. manter B2 congelado e acabamento desligado;
2. não integrar ainda, conforme solicitado;
3. usar este contrato como base da próxima implementação controlada do transporte/compositor;
4. para qualidade de reconstrução, seguir depois ao Experimento 2 da revisão 5.5: ampliar o contexto temporal real até o final da cena e testar donors/referências separadamente.

Não há justificativa para enhancer global. A transformação evitável demonstrada é a cadeia de recodificações e composição global; a transformação inevitável para delivery continua sendo um único encode YUV420 de 8 bits, porque esse é o formato de entrega escolhido.

## 14. Artefatos

Raiz: `G:/dowloand/teste/experiment-1-fidelity-20260911/`

- `EXPERIMENT_1_FIDELITY_REPORT.md`: este relatório;
- `calibration-analysis.json`: seleção do decoder;
- `calibration/`: RGB conhecido e YUV420 de controle;
- `source-manifest.json`: fontes, seleções e hashes;
- `ffprobe-by-stage.json`: metadados e timestamps de cada etapa;
- `metrics-by-stage.json`: RGB, YUV, histogramas e métricas;
- `commands-and-times.json`: argv real e tempos;
- `decoded-yuv-hashes.json`: hashes do conteúdo decodificado completo;
- `code-hashes.json`: hashes do working tree auditado e do harness;
- `artifact-hashes.json`: inventário dos artefatos;
- `runs/*/baseline-current/`: pipeline atual reproduzido;
- `runs/*/ablations/`: uma recodificação removida por vez;
- `runs/*/proposed/`: teto, harness e backend-equivalent;
- `comparators/`: comparação em movimento;
- `REJECTED-SMOKES.md`: candidatos descartados e motivos.

Instrumento reproduzível: `research/experiments/experiment1_fidelity.py`.
