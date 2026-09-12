# EXPERIMENT 2 — TEMPORAL CONTEXT AND REAL SOURCE DONORS

Data: 11/09/2026  
Resultado: **REJECT para promoção dos dois candidatos; B2 finish OFF continua baseline oficial.**  
Custo cloud: **US$ 0**. Nenhuma integração em produção foi feita.

## 1. Conclusão executiva

Ampliar a cena de 104–146 para 104–198 encontrou mais amostras derivadas do próprio SOURCE, mas o ganho não passou pelo controle com ground truth e não removeu visualmente a faixa lisa do suéter.

Na busca de donors, a cobertura aceita subiu de 21.246 para 23.526 ocorrências de pixel: ganho líquido de 2.280, ou 0,424 ponto percentual da área mascarada. No controle de tecido limpo, porém, o erro caiu apenas **0,50%**, contra o mínimo exigido de 10%, e o erro temporal aumentou **0,74%**. A cobertura maior não se converteu em recuperação fiel.

No ProPainter, o contexto de 95 quadros terminou em 485,50 s, sem OOM e sem redução espacial. A diferença contra C2 foi pequena: MAE mascarado de 0,610 nível, mudança de energia de microtextura de +0,063% e melhora do proxy temporal de 0,391%. Os comparadores continuam mostrando a mesma faixa artificial. FP32 também não apresentou evidência de recuperação perceptiva.

Os gates estruturais passaram: zero mudança fora das máscaras, zero verde residual, prefixo 0–103 idêntico e nenhuma alteração em rosto, cabelo, fivela, janela, bordas ou geometria. Isso torna os ensaios seguros, mas não os torna melhores que B2.

## 2. Baseline e variável isolada

Baseline oficial congelado:

- B2 `finish=OFF`;
- master SHA-256 `08e73ade1fa0048f33a5701502f6825428ee392c4e8748ddab6cffb1093779b5`;
- ProPainter C2 nos alvos 104–146;
- ROI de inpainting 820×294, padding apenas até 824×296;
- máscara, composição, resolução e contrato de cor mantidos;
- nenhum sharpening, contraste, acabamento, engine alternativa ou pixel Vmake.

A única variável da subrodada A foi a disponibilidade de donors. A única variável da subrodada B foi a disponibilidade da sequência 104–198 ao ProPainter. Os 43 inputs e máscaras alvo do D2 são cópias byte a byte do C2.

## 3. Timeline da cena

| Intervalo | Papel | Observação |
|---|---|---|
| 104–146 | alvos originais | mesmos inputs/máscaras do C2 |
| 147–198 | contexto novo | todos os 52 quadros inventariados e avaliados |
| 199 | corte seguinte | excluído |

Frames 181–184 foram os únicos novos quadros sem pixels de legenda/halo detectados pela máscara heurística. Isso não os tornou automaticamente bons donors: eles forneceram 3, 6, 24 e 0 pixels selecionados antes do veto, respectivamente. Distância, suporte local, flow e aparência continuaram limitando o uso.

## 4. Subrodada A — donor search

### 4.1 Pools

Pool antigo:

```text
[104, 112, 116, 128, 136, 145, 146]
```

Pool ampliado:

```text
pool antigo + todos os frames 147–198
```

Os parâmetros permaneceram iguais: Farneback no crop nativo, `fb_max=1 px`, suporte limpo local, MAE fotométrico máximo 7, erro de gradiente máximo 11, concordância RGB entre pelo menos dois donors e confiança mínima 0,48. O flow dentro da máscara é interpolado a partir do entorno observado.

### 4.2 Cobertura

Denominador: 538.097 ocorrências de pixel mascarado nos frames 104–146.

| Medida | Pool antigo recomposto | Pool ampliado | Diferença |
|---|---:|---:|---:|
| Pixels aceitos após veto temporal | 21.246 | 23.526 | +2.280 |
| Cobertura | 3,948% | 4,372% | +0,424 pp |
| Ganho relativo de cobertura | — | +10,73% | — |
| Novos pixels no conjunto ampliado | — | 2.299 | — |
| Pixels antigos perdidos pela interação/veto | — | 19 | — |
| Pixels finais cujo donor escolhido é 147–198 | — | 831 | — |

O instrumento original reproduzido gerou 21.230 pixels, enquanto a recomputação atual gerou 21.246. A diferença de 16 pixels, 0,003% da máscara, vem de decisões limítrofes do Farneback/OpenCV. Por isso, a comparação causal usa o pool antigo e o ampliado recomputados no mesmo harness.

### 4.3 Donors aceitos e rejeitados

Dos 52 novos frames:

- 50 tiveram pelo menos algum suporte que passou os checks em algum alvo;
- 39 foram escolhidos para pelo menos um pixel antes do veto;
- 13 nunca foram escolhidos;
- frames 192 e 193 foram totalmente rejeitados;
- as causas dominantes foram confiança baixa, suporte visível insuficiente, inconsistência ida/volta/oclusão, distância do suporte e máscara de legenda/halo.

Maiores contagens de pixels escolhidos antes do veto:

| Donor | Selecionados | Máscara de legenda/halo no donor |
|---:|---:|---:|
| 161 | 68 | 18.061 |
| 151 | 64 | 7.730 |
| 160 | 57 | 18.003 |
| 167 | 53 | 6.443 |
| 150 | 49 | 7.739 |
| 155 | 47 | 20.732 |
| 166 | 47 | 6.980 |

Ter legenda no donor não significa que seus pixels limpos não possam ser usados: a máscara dilatada exclui as regiões contaminadas. Também não prova ausência de sombra preta fora da máscara. O CSV registra para cada par target/donor: região, distância temporal, máscara do donor, elegibilidade, aceitação, motivo, erro ida/volta médio e P95, oclusão, erro fotométrico, erro de gradiente, correlação de textura, offset de luma e confiança.

### 4.4 Mapa de disponibilidade

Dentro da área solicitada:

| Estado | Ocorrências | Fração |
|---|---:|---:|
| RECOVERABLE | 23.526 | 4,372% |
| UNCERTAIN | 509.802 | 94,741% |
| OCCLUDED | 4.769 | 0,886% |
| NO_VALID_DONOR | 0 | 0% |

`NO_VALID_DONOR=0` significa que algum donor teve mapeamento visível em todos os pixels; não significa que esse donor passou confiança e consistência. A maior parte permaneceu `UNCERTAIN`.

`OBSERVED_REAL` identifica pixels fora da máscara. `RECOVERABLE` identifica somente amostras do SOURCE remapeadas com interpolação bilinear e aceitas pelos checks. Elas não são pixels originais bit a bit.

## 5. Controle com ground truth

Foi usada uma faixa limpa do suéter em `[270,295,590,345]` dentro do crop 820×410, nos frames consecutivos 118–129. A faixa foi ocultada sinteticamente, preenchida com o mesmo baseline Telea e depois recebeu apenas donors aprovados. O SOURCE limpo permaneceu disponível como ground truth da métrica.

| Métrica | Pool antigo | Pool ampliado | Resultado |
|---|---:|---:|---|
| MAE mascarado | 8,4932 | 8,4508 | **−0,50% — FAIL** |
| SSIM luma no crop | 0,619794 | 0,619750 | −0,000044 |
| Gradiente / GT | 0,39098 | 0,40462 | melhora pequena |
| Edge MAE | 20,3757 | 20,2794 | −0,47% |
| Textura RMS / GT | 0,64615 | 0,69111 | mais energia, ainda distante do GT |
| Correlação de textura | 0,11441 | 0,11777 | +0,00336 |
| Cobertura do donor | 8,714% | 10,910% | +2,197 pp |
| MAE temporal com flow | 3,6796 | 3,7068 | **+0,74% — pior** |

LPIPS permanece `null`: a dependência e os pesos não estão instalados. O campo não foi substituído por zero.

O controle mostra que maior cobertura e maior energia de alta frequência não bastam. O ganho de erro é vinte vezes menor que o gate de 10%, o SSIM não melhora e a estabilidade piora. **Subrodada A: REJECT.**

## 6. Subrodada B — ProPainter old context vs expanded context

Configuração mantida:

| Item | C2 | D2 |
|---|---:|---:|
| Target frames | 104–146 | 104–146 |
| Sequência disponível | 104–146 | 104–198 |
| Grade do modelo | 824×296 | 824×296 |
| `subvideo_length` | 43 | 43 |
| `neighbor_length` | 6 | 6 |
| neighbor stride efetivo | 3 | 3 |
| `ref_stride` | 2 | 2 |
| dilatação upstream | 2 | 2 |
| precisão | FP16 | FP16 |
| donor blending | OFF | OFF |

Efeitos internos reais do D2:

- três segmentos de flow completion, por `flow_length=94 > 43`;
- três segmentos de image propagation, por `video_length=95 > 43`;
- 32 centros de inpainting, contra 15 no C2;
- vizinhança efetiva de quatro frames nas bordas e sete no interior;
- `ref_num=21`, porque 95 > 43;
- dos 15 centros que escrevem os targets, somente seis receberam referência direta após o frame 146;
- esses seis centros receberam 32 referências novas no total;
- a maior referência direta usada num centro alvo foi o frame 164;
- frames posteriores ainda participaram dos estágios segmentados de flow/propagação, mas não foram referências diretas dos centros alvo.

Isso é uma propriedade real do algoritmo atual: disponibilizar 104–198 não faz todos os targets consultarem toda a cena.

### Resultado

| Medida | Resultado |
|---|---:|
| Runtime D2 | 485,50 s |
| Pico VRAM amostrado | 5.824 MiB / 6.144 MiB |
| OOM/retry/downscale | nenhum |
| MAE D2 vs C2 dentro da máscara | 0,610 nível |
| Textura RMS C2 | 1,92675 |
| Textura RMS D2 | 1,92797 |
| Mudança de textura | +0,063% |
| Proxy temporal C2 | 1,77309 |
| Proxy temporal D2 | 1,76616 |
| Mudança temporal | −0,391% |

As diferenças são pequenas e a faixa lisa permanece nos comparadores. O pequeno ganho temporal não acompanha ganho real de trama. **Subrodada B: REJECT para promoção.**

## 7. Controle FP16 vs FP32

O controle usou os mesmos 18 frames 112–129, grade 824×296, máscara, stride, vizinhança e `subvideo_length=18`. Somente a precisão mudou.

| Precisão | Runtime | Pico VRAM |
|---|---:|---:|
| FP16 | 59,75 s | 3.593 MiB |
| FP32 | 51,25 s | 5.755 MiB |

MAE médio FP32 vs FP16 dentro da máscara: 0,5156 nível; delta máximo de canal: 29 em pixels isolados. Sem ground truth limpo sob a legenda, essa diferença não demonstra superioridade do FP32. A inspeção não mostrou recuperação da trama perdida. A hipótese de precisão numérica é encerrada para este caso; uma execução FP32 longa usaria margem de VRAM excessivamente estreita.

## 8. Regressões e contrato de entrega

O D2 foi composto somente no suporte final aprovado. O master lossless e os deliveries CRF 16 seguiram o contrato do Experimento 1.

| Gate | Resultado |
|---|---|
| Frames 0–103 iguais ao baseline | PASS |
| Pixels fora da máscara iguais ao SOURCE no master | PASS |
| Verde residual detectado | 0 — PASS |
| Rosto/cabelo/fivela/janela/bordas/geometria | preservados por igualdade externa — PASS |
| Grade e contagem | 1080×1920, 147 frames — PASS |
| Sharpening/contraste/acabamento | ausentes — PASS |

O candidato de donors foi montado separadamente sobre B2 apenas para revisão e está marcado `REJECTED_BY_GT_GATE`. Não foi integrado.

## 9. Comparadores em movimento

Todos os 11 MP4s de entrega/comparação foram decodificados integralmente sem erro. Comparadores principais:

- `comparators/source-b2-c2-d2-1x.mp4`;
- `comparators/source-b2-c2-d2-0.5x.mp4`;
- `comparators/source-b2-expanded-d2-1x.mp4`;
- `comparators/gt-old-expanded-1x.mp4`;
- `comparators/gt-old-expanded-0.5x.mp4`;
- `comparators/source-b2-d2-vmake-reference-1x.mp4`.

O último comparador aplica o alinhamento visual já documentado de −3 quadros ao Vmake. Ele continua somente referência visual e não entra em nenhuma métrica, máscara, donor, ground truth ou inferência.

## 10. Runtime e custo

| Etapa | Tempo |
|---|---:|
| Pool antigo recomposto | 111,90 s |
| Pool ampliado + controle GT | 1.330,27 s |
| ProPainter D2 | 485,50 s |
| FP16 curto | 59,75 s |
| FP32 curto | 51,25 s |
| Montagem/métricas/comparadores | 124,23 s |

O job neural mais longo ficou em 8,09 minutos, abaixo do teto de 15 minutos. O harness CPU agregado de donors e GT levou 22,17 minutos, mas cada lote/target ficou muito abaixo de 15 minutos e preservou checkpoints por frame. Nenhuma GPU paga foi iniciada. Energia elétrica local não foi medida.

## 11. Respostas explícitas

### 1. Encontramos nova textura real nos frames 147–198?

Encontramos **candidatos adicionais derivados do SOURCE**, mas não recuperação confiável suficiente. Foram 2.299 novas ocorrências contra o pool antigo recomposto, e 831 pixels finais escolheram donors 147–198. O controle GT reduziu erro só 0,50%, portanto esses números não sustentam promover “nova textura real recuperada”.

### 2. Quanto da região antes considerada incerta passou a ser recuperável?

Ganho líquido de 2.280 ocorrências, ou **0,424 ponto percentual** da máscara: 3,948% → 4,372%. Ainda permaneceram 509.802 ocorrências `UNCERTAIN`, 94,741% da área mascarada.

### 3. ProPainter melhorou apenas por receber contexto adicional?

Não de modo perceptualmente útil. O proxy temporal melhorou 0,391%, mas a energia de textura mudou só 0,063% e a faixa lisa permaneceu. Além disso, apenas 6 dos 15 centros alvo receberam referências diretas novas.

### 4. O gargalo continua sendo falta de informação ou qualidade de síntese?

Não foi demonstrada ausência física de informação: há tecido real visível em outros instantes. O experimento demonstra que **o alinhamento/confiança atual não consegue transferi-lo com fidelidade**, e que o ProPainter atual não o aproveita o suficiente. Para a parte restante, o gargalo prático continua sendo reconstrução/síntese de textura temporalmente coerente, junto com correspondência mais forte.

### 5. Devemos executar o Experimento 3?

**Sim, em laboratório e num trecho curto**, alimentando a engine alternativa com SOURCE + máscara, não restaurando o frame inteiro nem usando Vmake como dado. Deve começar pelo mesmo controle GT e pela faixa real, com custo/VRAM/licença registrados. Não há motivo para integrar o D2 ou os donors ampliados antes disso.

## 12. Decisão

**EXPERIMENT 2: REJECT para promoção.**

Esta decisão rejeita as configurações testadas, não a possibilidade universal de recuperar textura temporal. B2 finish OFF permanece congelado. O próximo passo recomendado é o Experimento 3 local e curto da revisão 5.5, com uma arquitetura de inpainting diferente somente na área residual.

## 13. Artefatos

Raiz: `G:/dowloand/teste/experiment-2-temporal-context-20260911/`

- `comparison.html`: acesso aos comparadores;
- `donors-expanded/report.json`: experimento completo de donors;
- `donors-expanded/donor-decisions.csv`: decisão por target/donor;
- `donors-expanded/donor-summary.json`: resumo por donor;
- `donors-expanded/maps/`: labels, confiança, donor escolhido e cobertura;
- `donors-expanded/ground-truth/ground-truth-control.json`: métricas GT;
- `model/D2-context95/report.json`: comando, inputs, referências efetivas, VRAM e runtime;
- `model/D2-context95/run/raw_predictions/`: predições e IDs de cada janela;
- `model/precision-control/report.json`: FP16 vs FP32;
- `evaluation.json`: composição, gates e métricas temporais;
- `video-validation.json`: ffprobe e decode dos vídeos;
- `artifact-hashes.json`: hashes dos artefatos principais.

Instrumentos reproduzíveis:

- `research/experiments/experiment2_temporal_context.py`;
- `research/experiments/experiment2_propainter_context.py`;
- `research/experiments/experiment2_precision_control.py`;
- `research/experiments/experiment2_evaluate.py`.
