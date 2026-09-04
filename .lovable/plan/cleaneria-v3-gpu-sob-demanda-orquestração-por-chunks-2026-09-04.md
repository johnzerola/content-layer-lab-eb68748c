# CleanerIA v3 — GPU sob demanda + orquestração por chunks

Objetivo: chegar ao nível vmake.ai (remoção limpa de marca d'água, legendas coloridas, legendas pulantes e karaokê) com tempo de espera aceitável, mantendo o motor CPU atual como modo econômico.

## Arquitetura proposta

```text
UI /remover  ->  server fn cleaner  ->  fila de chunks (Cloud)
                                          |
              +---------------------------+---------------------------+
              |                |                |                     |
          chunk 0          chunk 1          chunk 2   ...   (overlap 0.5s)
        GPU worker A      GPU worker B      GPU worker C  (RunPod serverless)
              |                |                |
              +------------ concat com crossfade de máscara --------> output.mp4
                                          |
                              verificação (residual_text por chunk)
                                          |
                          re-passada só nos chunks acima do limiar
```

- Fatiamento por cena (corte em mudança de plano quando existir), senão por duração fixa (~10–20s) com overlap de ~12 frames.
- Fila persistida no banco: `cleaner_jobs` (existente) + `cleaner_chunks` (novo) com estado, tentativas, custo, `residual_text`.
- Concorrência limitada por plano (ex.: 2 chunks free/pro, 6 no plano alto) para controlar custo.
- Concat sem re-encode quando os parâmetros batem; crossfade curto apenas na zona de overlap.

## O que os projetos open source fazem que vamos trazer

Baseado em ProPainter, E2FGVI, STTN, DiffuEraser, video-subtitle-remover, lama-cleaner/IOPaint, RapidOCR/PP-OCR e Track-Anything/SAM2:

1. **Detecção em duas camadas** (video-subtitle-remover): OCR (RapidOCR ONNX) + máscara por pixel do glifo, e não só a caixa. Resolve legenda colorida e com contorno.
2. **Máscara temporalmente estável** (Track-Anything/SAM2): propagar a máscara por tracking entre keyframes em vez de detectar frame a frame — é o que elimina o piscar em legenda karaokê/pulante.
3. **Modo watermark travado** (IOPaint/watermark-remover): detectar a região recorrente nos primeiros N frames, votar a região fixa e travar a máscara para o vídeo todo. Mais rápido e sem flicker.
4. **Dilatação adaptativa + faixa completa** (já parcialmente feito): quando a cobertura de texto na faixa é alta, limpar a faixa inteira em vez dos glifos — evita halo escuro.
5. **Inpainting com propagação de fluxo** (ProPainter): fluxo óptico completo + transformer temporal na GPU, janela grande. É o que resolve fundo em movimento, que o TBE em CPU não resolve.
6. **Refinamento por difusão** (DiffuEraser): passada final opcional nos chunks com maior resíduo, para textura coerente.
7. **Verificação automática** (nosso `verify.py`): OCR no resultado; chunk com `residual_text` acima do limiar volta para a fila com máscara mais agressiva. É o laço que aproxima do "100% limpo".

## Modos de qualidade expostos na UI

| Modo | Motor | Onde roda | Uso |
|---|---|---|---|
| Prévia | TBE | VPS CPU (atual) | 5s grátis, instantâneo |
| Econômico | TBE + verificação | VPS CPU | vídeos curtos, fundo estático |
| Alta | ProPainter GPU chunked | RunPod | padrão para entrega |
| Máxima | ProPainter + DiffuEraser no refino | RunPod | fundo complexo/karaokê |

## Etapas de implementação

1. **Worker RunPod**: `Dockerfile.gpu` + handler serverless (`runpod.serverless.start`) que recebe um chunk (URL assinada + máscara + params) e devolve o chunk pronto. Pesos ProPainter/DiffuEraser no volume de rede.
2. **Detector v2**: modo `watermark` (região travada) e modo `karaoke` (união temporal da máscara na faixa + dilatação adaptativa), com propagação por tracking entre keyframes.
3. **Orquestrador**: tabela `cleaner_chunks`, fila com lock single-flight, limite de chunks em voo, retry com backoff, circuit breaker em erro de saldo/permissão do provedor.
4. **Concat + verificação**: junção com overlap, OCR de verificação por chunk, re-passada seletiva.
5. **Créditos e UI**: custo por segundo de GPU debitado do plano, seletor de modo, progresso por chunk no `CleanerIAStudio`, fallback automático para CPU se a GPU estiver indisponível.
6. **Bateria de teste**: 4 vídeos-alvo (marca d'água estática, legenda branca, legenda colorida, karaokê) + 1 com fundo em movimento; aceite = `residual_text` < 0,05 e tempo < 2× tempo real no modo Alta.

## Detalhes técnicos

- Chaves do provedor GPU entram como secrets do backend; nenhuma chave no cliente.
- Chunks trafegam por URLs assinadas do storage privado, com expiração curta.
- Sem timeouts artificiais nas chamadas ao worker; progresso por polling do job.
- ProPainter tem licença não comercial — o modo GPU fica atrás de flag e a decisão de licenciamento (ou troca por E2FGVI/STTN, licenças mais permissivas) precisa ser confirmada antes de uso comercial.
- Nada de blur/mosaico em nenhum caminho, conforme regra do projeto.

## Ponto que precisa da sua decisão

Licença: ProPainter/DiffuEraser são não comerciais. Alternativas com licença permissiva (E2FGVI, STTN) têm qualidade um pouco menor. Posso implementar a arquitetura com ProPainter e deixar o motor plugável, trocando depois se você optar por licença comercial.
