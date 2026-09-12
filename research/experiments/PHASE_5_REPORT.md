# Fase 5 — restauração temporal local do suéter

Data: 2026-09-11. Artefatos: `G:/dowloand/teste/phase-5-20260911`.

**Rodada local concluída. B2 com acabamento desligado continua sendo o baseline oficial. Nenhum candidato foi promovido.**

O runtime agora executou inferência real na RTX 2060 local. Duas intensidades do mesmo resultado neural preservaram os pixels protegidos, mas não demonstraram redução convincente da faixa sintética. Aumento de nitidez não foi aceito como recuperação de microtextura verdadeira. A cena inteira não recebeu nova inferência; produção não foi alterada.

## Hipótese e decisões

Hipótese: um restaurador temporal limitado à região incerta poderia melhorar a trama que o B2 deixou artificial, aproveitando seu contexto, sem modificar regiões já corretas.

| Teste | Variável | Decisão | Motivo |
|---|---|---|---|
| Smoke local | Runtime/compatibilidade e pesos | **ACCEPT** técnico | CUDA, carregamento estrito, inferência finita e repetição idêntica |
| B2 OFF | Controle congelado | **ACCEPT** como baseline atual | Referência preservada; não significa qualidade perfeita |
| A20 | Mistura neural local 20% | **REJECT** para promoção | Ganho discreto de acutância; faixa e padrões artificiais continuam visíveis |
| A40 | Somente mistura 20% → 40% | **REJECT** para promoção | Destaca mais os padrões artificiais, sem evidência de recuperar a trama oculta |
| Cena inteira / produção | Expansão | Não executada | O teste curto não satisfez a condição de ganho real |

A20 é o candidato menos agressivo da rodada, disponível para revisão. Não foi rotulado como melhoria aprovada. O comparador de **melhor resultado mantido** usa B2 novamente na terceira posição; o comparador experimental mostra A20 explicitamente.

## Baseline congelado e entradas

Arquivo copiado e conferido por SHA-256:

`baseline/B2-finish-OFF-rgb-lossless.mp4`

SHA-256: `08e73ade1fa0048f33a5701502f6825428ee392c4e8748ddab6cffb1093779b5`.

É o master B2 da Fase 3, RGB sem perdas, 1080×1920, 147 quadros a 30 fps, sem acabamento adicional. O arquivo anterior foi preservado.

`manifest.json` registra hashes de SOURCE, V3 original, B2 e Vmake. SOURCE é o master de preservação da Fase 2; V3 é o output original da rodada V3, não o master recomposto. Os arquivos YUV V3/Vmake foram decodificados com conversão explícita BT.709 limitada → RGB pleno. Nenhuma alteração global de aparência foi aplicada.

Vmake foi usado exclusivamente no comparador. Não entrou no modelo, na máscara, nos donors, na seleção de pixels nem como ground truth. As métricas de preservação comparam os candidatos com B2.

## Runtime e smoke real

- GPU local: NVIDIA GeForce RTX 2060, 6 GB.
- Python 3.13.5, PyTorch 2.11.0+cu128, CUDA 12.8; precisão float32.
- Arquitetura oficial MMEditing v0.16.0, revisão `8b819f1d28d6eed6244721278a099f5dc0848a20`.
- Pesos oficiais RealBasicVSR; SHA-256 `52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376`.
- Carregamento de `generator_ema`, **320 chaves, strict=True, nenhuma faltante ou inesperada**.
- Smoke: três quadros sintéticos 64×64 com deslocamento; saída 256×256, finita; duas execuções com diferença máxima **0,0**.
- Smoke medido: **6,40 s**, incluindo carregamento do modelo após imports. Não é benchmark de qualidade.

O ambiente moderno não recebeu MMCV/MMEditing antigo via pip. O adaptador de pesquisa carrega as definições oficiais e substitui somente a superfície usada de infraestrutura: ConvModule conv2d+ReLU, registro e inicialização. As funções de inferência permanecem nas fontes oficiais; hashes, revisão e verificação de arquivos sem modificações estão registrados. Caminhos de dependência não suportados falham explicitamente.

Isso comprova execução e consistência neste runtime, **não equivalência numérica certificada com a instalação antiga**. O download inicial via urllib falhou na validação de certificado da instalação Python; curl com TLS verificado concluiu o download e o hash esperado conferiu. Não houve bypass de TLS nem tentativa de GPU paga.

Fontes: [RealBasicVSR oficial](https://github.com/ckkelvinchan/RealBasicVSR), [arquitetura usada](https://github.com/open-mmlab/mmediting/blob/v0.16.0/mmedit/models/backbones/sr_backbones/real_basicvsr_net.py), [configuração oficial](https://github.com/open-mmlab/mmediting/blob/v0.16.0/configs/restorers/real_basicvsr/realbasicvsr_c64b20_1x30x8_lr5e-5_150k_reds.py). Proveniência completa em `runtime/smoke.json` e `inference.json`.

## Janela e configuração

- Trecho restaurado: quadros SOURCE **116–133**, índices começando em zero; **18 quadros / 0,6 s**.
- Contexto real: quadros 114–135, da mesma cena.
- Crop de entrada nativo: **x=280, y=1328, largura=512, altura=224**.
- Seis inferências: três quadros centrais por janela e dois quadros reais de contexto de cada lado, sete entradas por execução.
- Modelo: 64 canais, 20 blocos de limpeza e 20 de propagação; SPyNet do próprio checkpoint.
- Limiar de limpeza 255: uma passagem conservadora. É uma escolha explícita desta ablação; a configuração oficial recomenda 5 no teste, o que não foi aplicado aqui.
- Saída neural x4 reduzida ao tamanho nativo por integração de área em float32. Nenhum downscale da entrada e nenhum upscale do vídeo entregue.
- Mesmo raw neural nos dois candidatos. Única variável A20/A40: mistura de 0,20 / 0,40.
- Delta BGR limitado a ±6 níveis, feather interno de 6 px, rampa temporal de três quadros nas duas pontas do teste.

Não houve sharpening externo, enhancer global, contraste global, restauração facial, alteração de geometria ou donor comercial. O modelo tem prior aprendido; sua saída não pode ser chamada de textura real recuperada sem evidência adicional.

## Mapa de decisão e confiança

Mapa de labels em resolução original para todos os quadros de contexto. Suporte: máscara arquivada ∩ safe-wide da Fase 3 ∩ interior controlado do suéter. Excluir pixels em que B2 já é igual ao SOURCE e todos os donors reais aceitos. Erosão de 3 px antes da candidatura; feather permanece dentro dela.

| Valor | Label | Ocorrências de pixel nos 18 quadros |
|---|---|---:|
| 0 | DO_NOT_TOUCH | 36.211.968 |
| 1 | SAFE_TO_KEEP_FROM_B2 | 715.469 |
| 2 | LOW_TEXTURE_CONFIDENCE | 76.524 |
| 3 | RESTORE_CANDIDATE | 320.839 |

Os números são pixel×quadro, não área espacial única. Candidatura equivale a aproximadamente **0,86%** dos pixels dos 18 quadros. **6.090 ocorrências de donors reais** no suporte foram protegidas antes da erosão. B2 permanece intacto nos labels 0, 1 e 2.

`decision/labels` guarda os quatro estados; `decision/low-confidence` guarda um indicador categórico 16-bit; `decision/alpha` guarda o peso de composição 16-bit; `decision/overlay` facilita inspeção. O indicador de confiança **não é uma probabilidade calibrada** e não prova que cada pixel da região candidata precisava ser alterado. SAFE significa manter neste experimento, não certificar qualidade perfeita do B2.

## Medições e regressões

| Medição | B2 | A20 | A40 |
|---|---:|---:|---:|
| HF RMS médio, suporte fixo | 1,3131 | 1,4641 | 1,6164 |
| Variação HF relativa | — | +11,50% | +23,10% |
| MAE temporal com flow, luminância 0–255 | 1,03215 | 1,01879 | 1,03340 |
| Variação do erro temporal | — | −1,29% | +0,12% |
| Ocorrências de pixel alteradas | — | 123.120 | 225.285 |
| Maior alteração BGR | — | 6 | 6 |
| Pixels alterados fora da candidatura, master reaberto | — | **0** | **0** |

HF é energia de detalhe, não fidelidade: também sobe com artefatos mais nítidos. O flow Farneback é calculado sobre B2 e mantido igual para avaliar ambos os candidatos. Usa ida/volta <1 px, limites da imagem, suporte válido nos dois quadros e erro fotométrico B2 <12. O limite operacional de rejeição era aumento >5% no erro temporal. Ambos passaram **somente nesse proxy**, que não certifica ausência perceptiva de flicker.

O master completo de 147 quadros foi reaberto e comparado. Fora dos pixels candidatos, os dois resultados são exatamente iguais ao B2. Isso protege rosto, cabelo, janela, bordas, contornos e geometria, além de preservar a cena anterior da fivela. Não demonstra que essas regiões já eram perfeitas no B2; demonstra ausência de regressão introduzida nesta rodada.

Essa igualdade é exigida no master sem perdas. O delivery H.264 YUV420/CRF14 tem perdas de compressão e conversão, portanto não se promete igualdade pixel a pixel fora da máscara nesse arquivo.

A verificação independente encontrou matriz/faixa corretas, mas primárias e transferência ausentes nos metadados dos novos exports desta instalação FFmpeg. A correção usa `h264_metadata` e stream copy, sem recodificar. As versões anteriores ficam em `metadata-before/`; hashes dos pixels YUV decodificados antes/depois precisam ser idênticos. `metadata-repair.json` registra cada arquivo; B2 congelado e masters não são alterados. A etapa é validada novamente por `phase5_verify.py`.

Inspeção visual das amostras 116, 120, 126 e 133: a faixa segue mais artificial que o tecido ao redor; A20 reforça discretamente contornos, A40 destaca mais os elementos verticais/agregados. Não vi reintrodução clara de letras nessas amostras. **OCR residual validado, avaliação cega humana de flicker e fidelidade da trama oculta permanecem não medidos**, não recebem nota zero. O teste curto não permite conclusão para outros vídeos, efeitos neon, sombras, fontes ou movimentos.

SSIM/PSNR/LPIPS contra textura limpa: **null**, pois não há ground truth limpo alinhado para a faixa; LPIPS também não está configurado. Não medimos erro contra Vmake como se fosse verdade. O harness registrou máscaras/hashes iguais, erro externo e de fronteira zero e veredito `REVIEW_REQUIRED` em `harness-comparison.json`. O controle identity representa B2 intocado, não uma engine de remoção.

## Comparações em movimento

Abrir `comparison/comparison.html`.

- SOURCE / B2 / A20 experimental / VMAKE reference only, recorte nativo e vídeo completo.
- BASELINE V3 / B2 / A20 / A40, para ablação.
- SOURCE / B2 / BEST RETAINED B2 / VMAKE reference only: nenhum novo candidato aprovado.
- Seis players individuais de suéter, controles de reprodução e velocidade.

Os vídeos combinados têm sincronismo dentro do mesmo arquivo. Cada ciclo contém os 22 quadros 114–135, incluindo contexto sem restauração nas extremidades. Quatro repetições por arquivo, 88 quadros a 30 fps, cerca de 2,93 s. A repetição facilita observação; não representa 2,93 s de conteúdo diferente.

Vmake usa deslocamento constante **−3 quadros** para preservar sua sequência temporal. No frame SOURCE 124, o pareamento por aparência anterior preferia Vmake 122; para movimento usamos 121, evitando repetir artificialmente o frame 122. Essa exceção de um quadro é documentada em `comparison/alignment.json`. É alinhamento temporal aproximado por aparência, não identidade de exposição/pixels. Nenhuma conclusão de textura verdadeira depende dessa diferença.

Teste real no navegador: os dez vídeos presentes no comparador carregaram e avançaram; nenhum erro de mídia ou quadro descartado foi reportado no teste curto, console sem erros após a correção do favicon. `browser-validation.json` preserva a evidência. Isso verifica reprodução, não substitui julgamento perceptivo humano em movimento.

## Intermediários preservados

| Etapa | Artefato |
|---|---|
| Baseline congelado | `baseline/B2-finish-OFF-rgb-lossless.mp4` |
| SOURCE, V3, B2, referência perceptiva | `input/` em PNG, com hashes de origem |
| Máscara, confiança, feather e overlay | `decision/` |
| Entrada nativa do modelo | `model-input/` PNG |
| Entrada após limpeza interna neural | `cleaned-input-float/` NPY float32 |
| Saída neural bruta x4 | `raw-x4-float/` NPY float32 |
| ROI restaurada nativa | `native-float/` NPY float32; `native-preview/` PNG de inspeção |
| Composição | `candidates/A20/composite/`, `candidates/A40/composite/` PNG |
| Master | `candidates/A20/master.mp4`, `candidates/A40/master.mp4`, RGB lossless |
| Delivery | `candidates/*/delivery-crf14.mp4`, BT.709 limitado, áudio original copiado |
| Deltas e métricas | `candidates/*/delta-x16/`, `metrics.json` |

NPY preserva inclusive valores neurais fora de 0–1; o PNG de preview é uma representação limitada/quantizada, não substitui o raw. Masters de 147 quadros contêm o B2 fora do teste; não indicam que o modelo processou a cena completa.

## Tempo e custo

| Etapa medida | Tempo |
|---|---:|
| Preparação/decodificação e máscaras | 43,65 s |
| Smoke, após imports | 6,40 s |
| Seis inferências CUDA, somadas e sincronizadas | 14,66 s |
| Runner real com carga do modelo e gravação dos intermediários | 27,70 s |
| Composição, avaliação, validação dos masters e dois encodes | 137,36 s |
| Dentro da etapa anterior: encode A20 / A40 | 13,71 s / 11,80 s |
| Correção de metadados e hashes antes/depois, 13 arquivos | 59,46 s |

Pico de memória **alocada pelo PyTorch** no teste real: 1,29 GiB; não representa memória total da placa. Tempos acima não incluem downloads, imports iniciais do processo, preparação manual, geração dos comparadores nem revisão. Etapas inclusivas não devem ser somadas duas vezes.

**Custo incremental de cloud nesta rodada: US$ 0,00.** Não foi criado nem iniciado recurso pago RunPod/VPS. Energia e depreciação locais não foram medidas. Não existe preço real de RunPod por vídeo de três minutos para esta versão: extrapolar este crop de 0,6 s para o pipeline completo não seria uma medição válida. Os processos locais de inferência terminaram e liberaram a GPU.

## Conclusão e próximo teste possível

**REJECT para promover A20/A40 como solução da faixa; manter B2 OFF.** O bloqueio técnico de inferência local foi resolvido, mas isso não resolveu o bloqueio visual. Um restaurador genérico pode tornar a reconstrução artificial mais definida sem recuperar sua estrutura fina.

Se houver outra rodada, ela deve continuar curta e isolada: uma variável no comportamento temporal/limpeza, ou um método que reconstrua explicitamente a região sintética com referências reais validadas. Uma calibração com textura limpa do próprio vídeo e degradação artificial conhecida ajudaria a separar recuperação de detalhe de prior inventado. Isso seria **RETEST**, com máscara e proteções congeladas. Não autoriza aumentar a área, promover sharpening ou gastar em modelo maior sem passar a mesma avaliação.

Reprodução: `phase5_prepare.py` → `phase5_runtime.py` → `phase5_infer.py` → `phase5_evaluate.py` → `phase5_compare.py` → `phase5_tag_delivery.py` → `phase5_verify.py` → `phase5_benchmark.py`, todos em `research/experiments`. Inferência recusa sobrescrever um resultado registrado; novas rodadas devem ter diretório e manifest próprios.
