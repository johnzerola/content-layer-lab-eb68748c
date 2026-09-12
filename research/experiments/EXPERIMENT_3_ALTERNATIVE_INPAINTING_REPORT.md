# EXPERIMENT 3 — ALTERNATIVE INPAINTING

Data: 11/09/2026. **RETEST — bloqueio de runtime na inicialização; qualidade NÃO AVALIADA.**

Artefatos: `G:/dowloand/teste/experiment-3-alternative-inpainting-20260911/`.
Custo cloud incremental: **US$ 0**. B2 finish OFF preservado. Nenhuma integração, troca de engine ou Fase 6.

## 1. Resultado e limite desta rodada

O DiffuEraser instalado foi auditado e houve uma tentativa real de carregar o modelo oficial. CUDA executou uma operação mínima corretamente, mas o carregamento foi interrompido pelo monitor quando a RAM disponível caiu abaixo do piso de 1 GiB. **Não houve chamada de inferência de vídeo, saída alternativa ou avaliação de qualidade.**

| Verificação | Resultado |
|---|---|
| Código local identificado e sem diff em arquivos tracked | PASS |
| Pesos/configurações inventariados com SHA-256 | PASS, 23 arquivos |
| SHA-256 igual ao ETag LFS disponível | PASS, 8 arquivos; não generalizar aos demais |
| `pip check` | PASS, `No broken requirements found` |
| Importação de Torch/CUDA e operação matricial mínima | PASS |
| Importação da classe DiffuEraser | PASS |
| Inicialização completa do modelo | NÃO CONCLUÍDA |
| Inferência mínima real de vídeo | NÃO EXECUTADA |
| Comparação GT, casos A/B/C/D | PENDENTES |
| Hash B2 antes/depois | idêntico ao baseline congelado |

A decisão RETEST não significa que DiffuEraser piorou, empatou ou melhorou. O gate de runtime impediu medir isso. Conforme a regra do pedido — parar e registrar um bloqueio técnico antes de substituir o modelo — não foi tentada outra engine nem iniciada GPU paga.

## 2. Hipótese e desenho preservados

Hipótese: inpainting por difusão condicionado pelo SOURCE original e máscara pode reconstruir a textura residual melhor que o ProPainter, mantendo estabilidade e geometria. Essa hipótese continua **não testada** neste material.

Baseline oficial: `G:/dowloand/teste/phase-5-20260911/baseline/B2-finish-OFF-rgb-lossless.mp4`.

SHA-256 antes e depois:
`08e73ade1fa0048f33a5701502f6825428ee392c4e8748ddab6cffb1093779b5`.

A entrada futura permanece SOURCE + máscara aprovada. B2 serve para comparação, nunca como entrada do restaurador. Não foram alterados máscaras históricas, donors, pesos, acabamento, contraste, sharpening ou configuração de produção. Nenhum frame Vmake foi lido pelos instrumentos desta rodada.

## 3. Runtime e tentativa controlada

Código DiffuEraser: commit `8e6f279ac7531e27ad1849c6f8dab5372a8597e7`, em `G:/cleaneria-runtime/DiffuEraser`. O working tree contém caches e pesos não rastreados; o diff de arquivos tracked estava vazio. O experimento não modificou esse código.

| Componente | Versão medida |
|---|---|
| Python | 3.11.9 |
| Torch / CUDA do framework | 2.3.1+cu121 / 12.1 |
| Torchvision | 0.18.1+cu121 |
| Diffusers | 0.29.2 |
| Transformers | 4.41.1 |
| Accelerate | 0.25.0 |
| PEFT | 0.13.2 |
| NumPy / PyAV | 1.26.4 / 14.0.1 |
| GPU | NVIDIA GeForce RTX 2060, 6.144 MiB |
| RAM física total reportada pelo Windows | 17.096.101.888 bytes, aproximadamente 15,92 GiB |

O README recomenda Python 3.9.19; o ambiente instalado usa 3.11.9. Imports e dependências passaram, mas isso não certifica toda a inferência. Não foi alterado o ambiente funcional do ProPainter.

Tentativa: construtor oficial `DiffuEraser(device=cuda, ..., ckpt='2-Step')`, carregamento padrão, modo offline, sem download automático, sem quantização e sem offload novo. A classe foi importada do upstream fixado. Não há input de vídeo nessa etapa: é o primeiro estágio do smoke, não um smoke de vídeo completo.

| Medida | Observado |
|---|---:|
| Limite de tempo previamente configurado | 300 s |
| Piso de RAM previamente configurado | 1.073.741.824 bytes |
| Tempo até encerrar a tentativa | **110,5065 s** |
| Menor RAM livre amostrada | **1.014.558.720 bytes — 967,56 MiB** |
| Pico de VRAM total da placa amostrado | **947 MiB** |
| Estado final | `RAM_GUARD_ABORT` |
| Inferências de vídeo completas | **0** |
| CUDA OOM observado | **nenhum** |
| VRAM da placa após término | **473 MiB** |

947 MiB é ocupação total da placa durante inicialização parcial, incluindo desktop. **Não é VRAM necessária para DiffuEraser nem pico de uma inferência.** Não houve medição de alocações completas da rede porque o construtor não retornou. A falta de RAM livre é do sistema naquele momento; não se atribui todo consumo aos pesos do modelo.

O log chegou a `MODEL_INITIALIZATION_STARTED` e ao carregamento de componentes da pipeline. O monitor terminou somente o processo da tentativa. A consulta posterior não encontrou processos `experiment3_preflight.py` remanescentes. Não foram encerrados aplicativos do usuário.

Evidências: `initialization.log`, `initialization-stage.json`, `initialization-monitor.json`, `runtime-validation.json`. O arquivo de estágio registra o último checkpoint; o resultado definitivo da interrupção está no monitor.

## 4. Pesos, dependências e licenças

O inventário contém 23 arquivos de pesos/configuração, aproximadamente 11,204 GiB no disco, incluindo variantes alternativas de text encoder/safety checker. Isso não é o tamanho residente de uma execução. Os SHA-256 e as revisões de download estão em `preflight-inventory.json`.

| Artefato | Revisão local de download | Evidência de licença |
|---|---|---|
| DiffuEraser brushnet + unet_main | `ad510dca07fa8e155d4bd8d002085bb8ec8f60e5` | card dos pesos declara Apache-2.0 |
| Stable Diffusion 1.5, componentes | `451f4fe16113bff5a5d2269ed5ad43b0592e9a14` | card declara CreativeML OpenRAIL-M |
| sd-vae-ft-mse | `31f26fdeee1355a5c34592e401dd41e45d25a493` | card declara MIT |
| PCM sd15 smallcfg 2step | `39560fead4ce00f94db3cb8e93dd8fba90ec0be6` | card consultado sem concessão explícita para o checkpoint; UNKNOWN específico |
| ProPainter/flow completion/RAFT | hashes locais inventariados; origem histórica dos pesos em manifesto V3 | prior conserva os termos próprios; autorização comercial particular não demonstrada |

O código DiffuEraser usa Apache-2.0, com exceções para terceiros. Seu README exige observar a licença do ProPainter. O código PCM e o código BrushNet têm Apache-2.0 nos commits arquivados, mas isso não autoriza atribuir automaticamente essa licença a qualquer checkpoint derivado. O branch BrushNet usado pelo DiffuEraser está identificado pelo commit do próprio DiffuEraser; não se afirma identidade com o BrushNet atual.

Fontes fixadas: [DiffuEraser código e exceções](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/README.md), [card dos pesos DiffuEraser](https://huggingface.co/lixiaowen/diffuEraser/blob/ad510dca07fa8e155d4bd8d002085bb8ec8f60e5/README.md), [PCM card](https://huggingface.co/wangfuyun/PCM_Weights/blob/39560fead4ce00f94db3cb8e93dd8fba90ec0be6/README.md), [PCM código](https://github.com/G-U-N/Phased-Consistency-Model/blob/b127277f641f28ad2459647a05f78133e5b3fd34/LICENSE), [BrushNet código](https://github.com/TencentARC/BrushNet/blob/0f9d9e54ca85c40a11a8f0504b4b5b2e7e8fd14d/LICENSE), [VAE card](https://huggingface.co/stabilityai/sd-vae-ft-mse/blob/31f26fdeee1355a5c34592e401dd41e45d25a493/README.md), [SD1.5 card](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/blob/451f4fe16113bff5a5d2269ed5ad43b0592e9a14/README.md), [ProPainter termos](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/LICENSE).

Conclusão comercial: **não liberado para integração comercial por esta auditoria**. O prior ProPainter tem concessão padrão não comercial e precisa de autorização específica para esse uso; PCM mantém pendência de termos do checkpoint exato. A documentação Apache do wrapper não remove essas questões. A tentativa local de pesquisa não representa aprovação jurídica de um produto. Não houve contato externo solicitando autorização. Datasets de treinamento e direitos de redistribuição dos componentes não foram auditados integralmente; permanecem pendentes, separados das licenças de código.

## 5. Problemas de fidelidade encontrados no caminho padrão

São achados de código, não resultados de qualidade do modelo:

1. `Propainter.forward` embarcado tem `resize_ratio=0.6`; `run_diffueraser.py` não sobrescreve esse default. Rodar a CLI padrão introduziria redução espacial no prior, confundindo o experimento nativo.
2. O prior é escrito com OpenCV `mp4v`, depois lido pelo DiffuEraser. A saída final também usa `mp4v`. São intermediário e entrega com perdas, sem o controle CRF/planos do Experimento 1.
3. `read_priori` remove o arquivo do prior após ler. Isso conflita com a preservação de intermediários solicitada.
4. O caminho de máscara executa erosão seguida de dilatação. A composição padrão acrescenta suporte com blur 21×21. Nenhum desses defaults pode ser aceito silenciosamente como a máscara final aprovada.
5. A leitura usa Torchvision/PyAV e OpenCV; a equivalência com o decode BT.709 calibrado ainda precisa de teste. Tags não bastam.
6. A grade é arredondada para múltiplos de 8 por resize quando necessário. Para o GT 820×410 deve-se usar padding até 824×416 e recorte exato depois.
7. `forward` exige pelo menos 22 frames efetivos. Repetir os 12 targets artificialmente alteraria o ensaio temporal; foi preparado contexto real.

O contrato do Experimento 1 continua obrigatório. O teste de compositor de identidade não certifica composição com ROI diferente do SOURCE. A próxima execução de qualidade precisa de um controle com ROI conhecido e máscara não vazia, preservação dos planos YUV externos, entrada RGB simétrica, intermediários lossless e um único encode de entrega. É necessário explicitar o suporte do chroma e sua vizinhança de reconstrução, pois YUV420 compartilha chroma entre pixels; não prometer simultaneamente identidade RGB arbitrária fora de uma máscara estreita sem medir esse efeito.

Não foi feita adaptação desses caminhos nesta rodada, pois a inicialização bloqueou antes. O smoke não consumiu vídeos e não reintroduziu encodes em B2.

## 6. Controle GT preparado, ainda sem resultado neural

Foi extraído diretamente do SOURCE original, usando o decoder simétrico do Experimento 1:

```text
scale=in_color_matrix=bt709:in_range=tv:out_range=pc:
      flags=accurate_rnd+full_chroma_int,format=bgr24
```

| Item | Preparação |
|---|---|
| SOURCE | `G:/dowloand/teste/padro-01-001 (15).mp4` |
| Crop nativo global XYWH | `[130,1240,820,410]` |
| Faixa GT local XYXY | `[270,295,590,345]`, limites finais exclusivos |
| Targets avaliáveis | 118–129, os mesmos 12 frames do Experimento 2 |
| Contexto preparado | 112–133, 22 frames reais consecutivos |
| Máscara | máscara histórica do frame unida à faixa artificial |
| Contexto sob faixa artificial | também mascarado, evitando disponibilizar GT limpo por acidente |
| Representação preservada | PNG BGR8 sem perdas; sem inferência e sem encode de entrega |

Foram registrados hashes de cada frame, máscara nova e máscara histórica. A faixa GT não cruza pixels positivos das máscaras históricas nos 12 targets. Esse check não certifica sozinho ausência de qualquer halo não detectado; deve acompanhar a inspeção visual da faixa limpa.

Importante: o controle anterior era **Telea + donors**, não uma predição ProPainter sob a máscara artificial. Além disso, o decoder desta preparação segue a calibração do Experimento 1. Não comparar seus números diretamente com as métricas antigas nem chamar B2 sem edição dessa faixa de baseline neural válido. É necessário executar ProPainter e DiffuEraser sobre os mesmos 22 inputs e avaliar os mesmos 12 targets.

MAE, SSIM, LPIPS, gradiente, bordas, correlação de textura e erro temporal da alternativa: **null / NOT_RUN**. Não foram preenchidos com zero. Critérios de geometria/flicker e avaliação visual também permanecem pendentes.

## 7. Casos reais e comparadores

Foi produzido `source-scene-index.jpg`, uma folha de navegação do SOURCE. Ela usa thumbnails e decode OpenCV exclusivamente para localizar cenas; **não é evidência colorimétrica nem comparador de qualidade**.

| Caso | Localização inicial | Situação |
|---|---|---|
| A: mulher retirando roupa | cena 0–73; movimento claro nas amostras 30–73 | localizado; mancha ainda sem diagnóstico causal nesta rodada |
| B: mulher de braços cruzados | cena 74–103 | localizado; continuidade/mancha ainda sem diagnóstico causal |
| C: homem de suéter | targets 104–146; cena até 198 | localizado; alternativa não executada |
| D: homem olhando, áreas não editadas | áreas de rosto/cabelo/fundo da cena do suéter como sentinela provisória | não executado; não equivale a certificar uma cena inteira sem edição |

Os intervalos de A/B identificam as cenas, **não os frames exatos das manchas**. Sem inspeção temporal das predições e composições, a causa permanece `UNDETERMINED`; não foi rotulada como MASK, INPAINTING, COMPOSITION, TEMPORAL_DRIFT ou ASSOCIATED_EFFECT_RESIDUAL sem evidência.

Comparadores solicitados SOURCE/B2/ALTERNATIVE/VM​​AKE em 1×, 0,5×, crop ampliado e delta: **não gerados**, porque inexiste saída alternativa. Não foi colocado B2 ou SOURCE na coluna alternativa para simular um resultado. `comparison.html` mostra explicitamente essa pendência e permite consultar o índice de cenas e os relatórios disponíveis.

## 8. Próxima tentativa concreta

O bloqueio medido foi RAM durante carregamento padrão, não uma prova de que toda execução local em 6 GiB seja impossível. Há duas questões separadas:

1. **Carregamento:** reduzir o pico de RAM com carregamento direto em FP16/baixo uso de memória precisa de um ensaio isolado, mantendo pesos e algoritmo. O upstream primeiro constrói componentes e só depois chama `.to(cuda, float16)`. Não foi demonstrado que apenas liberar alguns aplicativos resolveria a inferência completa.
2. **Inferência:** mesmo com carregamento corrigido, a RTX 2060 tem margem limitada para pesos e ativações temporais. Os cabeçalhos locais somam cerca de 5,17 GiB se UNet, BrushNet, VAE, text encoder, safety checker e PCM forem representados em FP16, antes do prior, ativações e allocator. É estimativa de elementos de tensor, não uma medição de residência simultânea.

A referência publicada informa 12 GB para 640×360/250 frames e 20 GB para 960×540/250 frames em L20. Não é mínimo universal nem previsão do nosso crop de 22 frames. [Tabela oficial](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/README.md).

Não foi demonstrada a necessidade inevitável de cloud. Uma configuração de 24 GB VRAM e 32 GB ou mais de RAM seria candidata de capacidade para novo smoke, sujeita a medição, não garantia. GPU exata disponível, tarifa atual, tempo total com carregamento e teto de gasto **não foram cotados** nesta rodada. Portanto não há proposta financeira autorizável nem custo por vídeo informado. Antes de qualquer execução paga, apresentar esses quatro itens e obter a autorização específica solicitada.

Depois do runtime: ajustar somente transporte/instrumentação no harness, preservar máscaras efetivas e raw outputs, validar identidade externa, rodar o GT pareado, então A/B/C e D. Nenhuma troca de modelo nem promoção automática.

## 9. Respostas explícitas

| Pergunta | Resposta baseada nesta rodada |
|---|---|
| 1. Superou ProPainter no GT? | Não avaliado; nenhum dos dois braços neurais desse GT foi executado nesta rodada. |
| 2. Melhorou a mancha da cena A? | Não avaliado. |
| 3. Melhorou a cena B? | Não avaliado. |
| 4. Melhorou a microtextura do suéter? | Não avaliado. |
| 5. Criou flicker ou hallucination? | Não avaliado; ausência de output não é ausência de artefato. |
| 6. Preservou a cena limpa? | B2 existente está intacto; preservação de um candidato D ainda não foi testada. |
| 7. VRAM/runtime/custo? | Inicialização parcial: 110,5065 s, pico total amostrado 947 MiB, abortada por RAM; cloud US$ 0; inferência/custo por vídeo desconhecidos. |
| 8. Licença permite caminho comercial? | A cadeia não está liberada: ProPainter exige autorização comercial específica e há pendência do checkpoint PCM. |
| 9. Deve substituir ProPainter? | Não há evidência para recomendar substituição. |
| 10. Deve complementar apenas casos difíceis? | Hipótese ainda pendente do GT e dos casos reais. |
| 11. Prontos para Fase 6? | Não segundo os gates desta solicitação; B2 OFF permanece oficial. |

**Decisão: RETEST por runtime. Experimento de qualidade incompleto.**

## 10. Artefatos e reprodução

- `preflight-inventory.json`: pesos, revisões, hashes de código e baseline.
- `initialization-monitor.json`: comando, piso de RAM, timeout e amostras de recursos.
- `initialization-stage.json`, `initialization.log`: checkpoint e log da tentativa real.
- `runtime-validation.json`: pip check e término dos processos.
- `license-evidence/`: textos fixados, fontes e hashes; consultas falhas preservadas como falhas.
- `gt-prepared/source/`, `gt-prepared/mask/`, `gt-prepared/manifest.json`: 22 frames e máscaras preparados.
- `gt-prepared/gt-support-validation.json`: interseção das máscaras históricas com a faixa GT.
- `source-scene-index.jpg`: localização visual das cenas, sem função de benchmark.
- `comparison.html`: índice de evidências e estado dos comparadores pendentes.
- `artifact-hashes.json`: inventário final dos arquivos desta rodada.

Instrumentos: `research/experiments/experiment3_preflight.py` e `experiment3_evidence.py`. O preflight recusa sobrescrever uma tentativa existente. Uma nova tentativa deve ter destino próprio e configuração registrada, preservando esta falha. Energia elétrica e armazenamento local não foram convertidos em custo monetário.
