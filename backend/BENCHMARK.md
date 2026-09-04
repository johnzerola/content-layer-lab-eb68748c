# Benchmark do Clean Engine (CPU, sem GPU)

Máquina: Linux x86_64, 16 vCPU, sem CUDA. FFmpeg 8.0, OpenCV 5.0, RapidOCR ONNX,
LaMa ONNX fp32 (`CLEANER_LAMA_ONNX`).

Fonte: vídeo real 1080x1920 @30fps, 300s, com legenda queimada (stroke preto,
posição inferior) — `/tmp/real300.mp4`.

## Medido (trecho de 30s do mesmo master, `--preview 30`)

| pipeline | motor | tempo | RTF | score | texto residual | texture gap | nitidez | RAM pico |
|---|---|---|---|---|---|---|---|---|
| caption/fast | tbe+lama (auto) | 440,2s | 14,7x | 77,7 | 0,000 | 0,298 | 0,21 | 3,9 GB |
| caption/high | tbe | 326,0s | 10,9x | 78,4 | 0,000 | 0,089 | 0,21 | 3,9 GB |

Estágios dominantes (fast): inpaint 182,5s, quality 64,2s, OCR 57,0s, máscara 36,9s.
Estágios dominantes (high): máscara 152,4s, OCR 142,3s, temporal 52,4s.

## Extrapolação para os 300s completos

- fast: ~73 min (14,7x)
- high: ~54 min (10,9x)

Uma execução direta do master de 300s foi iniciada e estava dentro dessa faixa
quando foi interrompida para liberar CPU ao benchmark medido. Em CPU o motor
**não** é viável para 5 minutos em tempo interativo; a rota GPU existe por isso.

## Leitura honesta

- Texto residual 0,000 nos dois pipelines: a legenda sai por completo.
- `texture_gap` 0,089 (high) x 0,298 (fast): o fast deixa a faixa mais lisa que
  a vizinhança; o high reconstrói textura melhor.
- `sharpness_ratio` 0,21: a área reconstruída ainda é mais macia que o entorno.
  É o gargalo de qualidade que separa este motor do Vmake.
- Score 77-78 => rota `retry`, ou seja, o roteador não declara sucesso.

## Como reproduzir

```bash
cd backend
CLEANER_LAMA_ONNX=/caminho/lama_fp32.onnx \
python benchmark.py video.mp4 --mode caption --pipelines fast,high --preview 30 \
  --outdir bench --report bench/report.json
```

## Rodada — qualidade do preenchimento (clipes sintéticos, CPU)

Medido contra o ground truth (`*_truth.mp4`), erro médio absoluto só dentro da
área que teve texto:

| Cenário | MAE |
|---|---|
| caption, só TBE | 19,56 |
| caption, TBE + LaMa (tile antigo) | 14,99 |
| caption, TBE + LaMa (tile com contexto + teto 640) | **13,28** |

Teto do tile (o tile é reamostrado para 512 antes da inferência):

| lado do tile | MAE | tempo |
|---|---|---|
| 512 | 14,40 | 19,1 s/frame |
| **640** | **13,78** | 13,4 s/frame |
| 768 | 14,70 | 11,3 s/frame |
| 1024 | 15,48 | 15,6 s/frame |

Janela temporal e fluxo óptico (hipótese testada e **descartada como prioridade**):

| config | MAE caption | MAE motion |
|---|---|---|
| 16 amostras, sem fluxo | 19,56 | 3,66 |
| 48 amostras, sem fluxo | 19,56 | 3,62 |
| 48 amostras, com fluxo | 19,56 | 3,65 |

Leitura: em cena com movimento o TBE já está quase perfeito (MAE 3,6 / PSNR
~37 dB) e alongar a janela ou corrigir por fluxo muda quase nada. Em legenda
estática sobre cena estática o fundo **nunca** é exposto, então nenhuma janela
resolve — 100% do erro vem do preenchimento sintético. Por isso o fluxo virou
opt-in (`--flow`) e o esforço foi para o tile do LaMa.

Pipeline completo, `caption --quality high`, clipe sintético 2s:

| | antes | depois |
|---|---|---|
| engine | tbe+retry (LaMa nunca acionava) | tbe+lama |
| texture_gap | 0,040 | **0,011** |
| sharpness_ratio | 0,034 | **0,107** |
| score | 79,2 | 79,8 |
| lama_rejected | 7 de 8 chunks | 0 |
| tempo | 80,6 s | 169,8 s |

## Grade janela temporal 24–48 × fluxo óptico (64 frames, CPU, MAE na área da legenda)

| clipe | 24 off | 24 on | 32 off | 32 on | 48 off | 48 on |
|---|---|---|---|---|---|---|
| caption | **12,22** | 12,22 | 12,22 | 12,22 | 12,24 | 12,24 |
| karaoke | **10,18** | 10,18 | 10,18 | 10,18 | 10,18 | 10,18 |
| motion | 3,95 | 3,98 | 3,95 | 3,98 | **3,82** | 3,85 |

Tempo (caption): 24 off 15,5s → 48 on 33,0s, ou seja +113% de custo.

Conclusão: a janela satura em 24 amostras. Em cena estática o MAE é idêntico
até a 3ª casa porque o fundo atrás da legenda nunca é exposto — não existe
frame limpo para colher, então o erro é 100% do preenchimento sintético. Só o
clipe `motion` ganha algo com 48 (−3,3%), e mesmo ali o fluxo **piora**
(3,82 → 3,85) enquanto cobra +63% de tempo: o campo Farneback de baixa
resolução introduz mais ruído de reamostragem do que corrige de desalinhamento
residual, já que o affine global sozinho basta neste tipo de movimento.

Presets mantidos: fast 24 / high 32 / max 48, `flow` desligado por padrão e
disponível via `--flow` para material com parallax forte.

## Pós-passe de harmonização (CPU) — 2026-09-04

`app/video/harmonize.py` casa cor, nitidez e grão da área reconstruída com o
anel de fundo ao redor, só dentro da máscara suavizada.

| Métrica (clipe sintético, faixa de legenda) | Antes | Depois |
|---|---|---|
| MAE vs fundo real na área tratada | 7,47 | 6,47 |
| Grão (σ alta frequência) — real 4,18 | 0,47 | 3,17 |

Ligado por padrão (`CleanOptions.harmonize`), desligável com `--no-harmonize`.
O pipeline só aceita o resultado se o score não cair (tolerância de 0,5).
