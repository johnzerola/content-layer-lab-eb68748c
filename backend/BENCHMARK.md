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
