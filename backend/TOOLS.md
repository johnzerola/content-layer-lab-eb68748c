# Ferramentas do Clean Engine — o que cada peça faz

Mapa completo do que o motor usa hoje e do que está previsto. Nenhuma etapa é
dependente de um único modelo: tudo entra pelo registry de providers
(`app/providers/__init__.py`), então trocar de motor é registrar outro.

## 1. Entrada e preparo

| Ferramenta | Papel | Onde |
|---|---|---|
| FFmpeg / ffprobe | corte, proxy, encode, remux, áudio original preservado | `app/utils/video.py` |
| Proxy | cópia leve (540px) só para análise; o master nunca é reprocessado | `app/video/proxy.py` |
| ROI | recorta a região de trabalho; fora dela o pixel é bit a bit o original | `app/video/roi.py` |
| Detecção de cena | impede que a janela temporal atravesse corte | `app/services/scene.py` |
| Chunking com overlap | processa em blocos com sobra, sem emenda visível | `app/services/chunking.py` |

## 2. Localizar o que remover

| Ferramenta | Papel | Onde |
|---|---|---|
| RapidOCR (PP-OCR ONNX) | detecta texto em CPU — legenda, texto animado | `app/providers/rapidocr_provider.py` |
| Caption zone | acha a faixa da legenda por amostragem, evita OCR no frame todo | `app/pipelines/caption_zone.py` |
| Agrupamento karaokê | une palavras destacadas numa linha só | `app/services/mask_modes.py` |
| Watermark estática | vota a região que quase não muda no tempo | `app/services/watermark.py` |
| **SAM2 (ONNX)** | **segmenta o objeto que o usuário apontou (clique/caixa)** | `app/providers/sam2_provider.py` |
| **GrabCut (fallback)** | **mesma seleção sem baixar pesos; roda em qualquer CPU** | `app/providers/sam2_provider.py` |
| Optical flow (Farneback) | propaga máscara entre keyframes e acompanha o objeto | `app/services/tracking.py` |

## 3. Proteger o que não pode ser tocado

| Ferramenta | Papel | Onde |
|---|---|---|
| **Protect Area** | **regiões intocáveis (rect/elipse/polígono), com janela de tempo** | `app/video/protect.py` |
| Proteção automática | rosto (Haar) e pessoa (MediaPipe, opcional) | `app/services/protect.py` |
| Trava anti-borrão | fora da máscara dilatada, o pixel original volta sempre | `app/pipelines/clean_pipeline.py` |

A máscara final é sempre `remoção − proteção`, com borda suave — corte duro
deixa degrau visível entre reconstruído e preservado.

## 4. Reconstruir o fundo

| Ferramenta | Papel | Licença |
|---|---|---|
| TBE (Temporal Background Exposure) | usa pixels reais de outros frames | própria/OpenCV |
| LaMa ONNX | inpainting por modelo, só na ROI, em keyframes + propagação | Apache 2.0 |
| ProPainter | flow-guided, alta qualidade, GPU | **não comercial — desligado** |
| DiffuEraser | difusão, alvo da rota GPU comercial | Apache 2.0 |

Proibido por decisão de produto: blur, mosaico, tarja, crop e preenchimento por
cor sólida.

## 5. Julgar o resultado

| Ferramenta | Papel | Onde |
|---|---|---|
| Quality score 0–100 | texto residual, ghost edge, flicker, textura, nitidez | `app/quality/scoring.py` |
| Roteador | `done` / `retry` / `gpu` — nunca declara sucesso falso | `app/pipelines/clean_pipeline.py` |
| Benchmark | tempo, RTF, RAM, telemetria por estágio | `backend/benchmark.py` |

## 6. CLI

```bash
# legenda (inalterado)
python clean.py in.mp4 out.mp4 --mode caption --quality high

# objeto apontado por caixa, protegendo a faixa inferior
python clean.py in.mp4 out.mp4 --mode object \
  --box 0.30,0.30,0.30,0.16 --protect 0.0,0.75,1.0,0.25

# objeto por clique, protegendo rosto automaticamente
python clean.py in.mp4 out.mp4 --mode object --point 0.5,0.4,1 --protect-person

# proteção só entre 2s e 4s, em elipse
python clean.py in.mp4 out.mp4 --mode object --box 0.1,0.1,0.2,0.2 \
  --protect ellipse,0.4,0.1,0.2,0.25,2,4

python clean.py --check   # mostra OCR, LaMa, SAM2, GPU
```

Pesos do SAM2 (opcionais) via `CLEANER_SAM2_ENCODER` e `CLEANER_SAM2_DECODER`.
Sem eles a seleção funciona em GrabCut, com qualidade menor em borda complexa.
