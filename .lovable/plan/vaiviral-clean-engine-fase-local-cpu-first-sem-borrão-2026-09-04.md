# VaiViral Clean Engine — Fase local (CPU-first, sem borrão)

Objetivo desta fase: um motor local que pega um vídeo com legenda queimada e devolve outro vídeo em que a legenda desapareceu, sem blur, sem tarja, sem corte, com áudio e resolução preservados — e com números reais de tempo e qualidade.

Nada de frontend, billing ou lote nesta fase. Evoluímos o motor que já existe (TBE + RapidOCR + ProPainter) em vez de recomeçar.

## O que já temos hoje

- Reconstrução temporal TBE (mediana temporal com alinhamento de movimento) e preenchimento por exemplar — já é a abordagem "sem blur".
- Detecção de texto (RapidOCR/PP-OCR com fallback morfológico), modo karaokê com união temporal, máscara travada por votação para marca d'água.
- Detecção de cenas, corte em chunks com overlap, remux de áudio, proteção de área, verificação com `residual_text`, nitidez e consistência temporal.
- ProPainter em CPU (lento) e caminho GPU/RunPod já esboçado.

## O que falta (é isto que vou construir)

1. **Master preservado + proxy de análise**
   Original nunca é reescrito. Gera proxy (540p ou 720p) só para OCR/detecção; máscara e reconstrução voltam mapeadas para o master em resolução total. Hoje o motor analisa e compõe no mesmo material.

2. **ROI de verdade**
   Processar só a faixa onde o elemento vive (ex.: 8%/68%/84%/18% + margem de contexto) em vez do frame inteiro, incluindo composição de volta apenas nessa área.

3. **Caption zone por amostragem**
   OCR em frames amostrados (0, 15, 30, 45…) para descobrir a zona de legenda, depois vigiar prioritariamente essa zona — corta muito tempo de CPU.

4. **Máscara configurável e karaokê melhor**
   `mask_expand_px`, `mask_feather_px`, `mask_confidence`, erosão; agrupamento de palavras/sílabas da mesma linha em `karaoke_group`, cobrindo fill + stroke + sombra + glow, nunca só o miolo da letra.

5. **Fallback LaMa na ROI (CPU, ONNX/OpenVINO)**
   Entra só onde a linha do tempo não expôs fundo real, e só no recorte — nunca no frame inteiro.

6. **Quality score 0–100 e roteador automático**
   Junta texto residual, borda fantasma, flicker e diferença de textura num único score.
   `>= 90` conclui · `70–89` reprocessa com máscara maior/janela maior, depois LaMa na ROI · `< 70` marca para GPU.
   Retry com parâmetros diferentes, sem repetir etapas já cacheadas.

7. **Interfaces plugáveis**
   `TextDetector`, `MaskGenerator`, `TemporalReconstructor`, `InpaintingProvider`, `SegmentationProvider`, `UpscaleProvider`, com os motores atuais implementando cada uma. Nada preso a um único modelo.

8. **CLI**
   `python clean.py input.mp4 output.mp4 --mode caption`
   com `--mode karaoke|text|logo|auto`, `--quality fast|high|max`, `--preview`, `--cpu-only`, `--gpu`, mostrando progresso real por etapa.

9. **Benchmark e telemetria**
   `python benchmark.py input.mp4` comparando TBE CPU, TBE+LaMa CPU e GPU; registra tempo por etapa (ocr/mask/temporal/inpaint/encode), RAM, fator de tempo real (processamento ÷ duração), score e tamanho de saída.

10. **Cache**
    Proxy, resultado de OCR, caption zone, metadados de máscara e cortes de cena ficam cacheados por job — retry não refaz o que já foi feito.

11. **MODEL_LICENSES.md**
    Modelo, repositório, licença, versão, data verificada, uso permitido. ProPainter/DiffuEraser já ficam marcados como não comerciais; o caminho padrão comercial é TBE + OpenCV + RapidOCR + LaMa.

## Como vou validar

Gero clipes sintéticos verticais de teste (legenda branca com stroke preto, karaokê com palavra ativa colorida, texto sobre fundo em movimento) e rodo o benchmark em CPU aqui. O caminho GPU fica pronto e detectando CUDA/VRAM para você rodar na RTX 2060 em casa — sem fingir resultado de GPU que não rodou.

Só considero pronto quando, num clipe de teste, o texto sumir sem blur, sem tarja, sem faixa de cor, sem flicker forte, com áudio intacto e resolução preservada — e com os números do benchmark na mesa.

## Detalhes técnicos

- Tudo dentro de `backend/app`, reorganizado em `pipelines/`, `providers/`, `video/`, `quality/`, mantendo `main.py` e o worker atuais funcionando (os endpoints existentes continuam chamando os mesmos pipelines por dentro).
- Novos módulos: `video/proxy.py`, `video/roi.py`, `quality/scoring.py`, `quality/ghost_text.py`, `quality/flicker.py`, `providers/lama_provider.py`, `pipelines/{caption,karaoke,static_logo,auto}_pipeline.py`, `clean.py`, `benchmark.py`.
- Streaming por chunks com overlap; nunca carregar o vídeo inteiro em RAM.
- Janela temporal adaptativa (±15 → ±30 → ±60) limitada pelo corte de cena.
- Optical flow começa leve (Farneback/DIS já usados) e só sobe se o benchmark provar ganho.
- GPU: `inference_mode`, FP16, limpeza de memória, chunks pequenos, assumindo 6 GB de VRAM.
- Testes unitários para caption zone, agrupamento karaokê, mapeamento proxy→master e scoring.

## Fora desta fase

Fila na VPS, worker com heartbeat, upload multipart, batch, billing e SAM2/objetos. Entram depois que o motor provar qualidade.
