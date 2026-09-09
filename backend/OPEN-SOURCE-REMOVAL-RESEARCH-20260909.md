# Pesquisa: como aproximar a remoção de legendas da referência Vmake

Data: 09/09/2026. Escopo: pesquisa de fontes primárias e inspeção do código local. Não foram executados benchmarks novos, treinamento, contratação de GPU ou deploy nesta pesquisa.

## Decisão recomendada

Priorizar qualidade das máscaras, inferência por região com contexto e comparação reproduzível. Usar ProPainter oficial como referência técnica já integrada; avaliar SVOR sobre Wan2.1-VACE como novo candidato para o produto. DiffuEraser é uma comparação adicional útil, mas a integração atual inclui ProPainter e suas restrições. Não começar treinando do zero.

Isso é uma recomendação de engenharia, não uma demonstração de equivalência. Não encontrei nas páginas oficiais consultadas uma divulgação verificável dos pesos ou arquitetura interna do Vmake. A página anuncia remoção automática, regiões de apagar/proteger e Smart Pro; não permite concluir que utiliza qualquer modelo listado abaixo. [Vmake](https://vmake.ai/video-watermark-remover).

## Situação local e defeitos a resolver

- A referência `G:\dowloand\teste\VMAKE.IA.mp4` tem aproximadamente 4,93 segundos. O original e a saída antiga têm aproximadamente 80,68 segundos. Comparação anterior em `comparacao-vmake-20260908/comparacao.html`.
- A saída antiga tem faixa escura na legenda e textura esticada sobre roupa. Sua origem exata não foi comprovada; não atribuir esse resultado ao ProPainter oficial apenas pelo aspecto.
- Há adaptadores oficiais de ProPainter e DiffuEraser, separação por cena e composição mascarada em `app/workers/tasks.py`.
- `_run_official_pipeline` entrega o quadro completo ao adaptador. `_processing_size` em `app/engines/propainter_official.py` limita o lado maior a 960 ou 1280 por padrão, dependendo do preset e ambiente. Em 1080×1920, lado 960 significa aproximadamente 536×960 após arredondamento: detalhes das letras e do fundo ficam menores.
- O fluxo CPU em `app/pipelines/clean_pipeline.py` já usa recortes. Portanto, a melhoria proposta é para o caminho oficial GPU; não estamos dizendo que todo o projeto carece de ROI.
- RTX 2060 local com 6 GB e disponibilidade CUDA foram verificadas no turno anterior. Isso não comprova que os modelos mais pesados cabem. O último registro RunPod descreve falha de inicialização, não benchmark de remoção.

## Candidatos e prioridade

| Projeto | Evidência e utilidade | Limitação / decisão |
| --- | --- | --- |
| ProPainter oficial | Reconstrução temporal com fluxo e transformer; controles de resolução, referências e memória. Já integrado. | Primeiro benchmark técnico. Código e modelos são não comerciais pela licença publicada; uso comercial exige autorização. [Projeto](https://github.com/sczhou/ProPainter). |
| DiffuEraser | Inpainting por difusão; código de inferência, treinamento e avaliação disponível. | Comparar em cenas difíceis. Licença do repositório é Apache-2.0, mas o pipeline utiliza prior ProPainter: não tratar o conjunto como automaticamente liberado. [Projeto](https://github.com/lixiaowen-xw/DiffuEraser), [licença](https://github.com/lixiaowen-xw/DiffuEraser/blob/master/LICENSE). |
| SVOR, Xiaomi | Projeto de 2026 com inferência e LoRAs publicados; foco em estabilidade, movimentos abruptos e máscaras defeituosas. Usa Wan2.1-VACE-1.3B. | Novo candidato prioritário. Código e model card indicam Apache-2.0. Superioridade em legendas precisa de teste; benchmark de objetos não é prova para karaoke. [Projeto](https://github.com/xiaomi-research/svor), [pesos](https://huggingface.co/HigherHu/SVOR). |
| Wan2.1-VACE | Edição de vídeo condicionada por vídeo, máscara e texto. Versões 1.3B e 14B publicadas sob Apache-2.0. | Comparar a base sem SVOR para medir o ganho da especialização. Preservação de detalhes e duração exigem avaliação; não usar geração do quadro inteiro como entrega sem composição. [Projeto e licenças por variante](https://github.com/ali-vilab/VACE). |
| VideoPainter | Inpainting e edição de duração variável; código, pesos e conjunto de avaliação públicos. | Referência de pesquisa. A licença própria restringe uso a pesquisa/educação e proíbe uso comercial e produção. [Projeto](https://github.com/TencentARC/VideoPainter), [licença](https://github.com/TencentARC/VideoPainter/blob/main/LICENSE). |
| EffectErase | Código e checkpoint publicados para remoção de objetos e efeitos associados. | Acompanhar como pesquisa; CC BY-NC 4.0, uso comercial proibido. Não é prioridade para letras pequenas sobre roupa. [Projeto](https://github.com/FudanCVL/EffectErase). |
| STTN / video-subtitle-remover | STTN oferece reconstrução temporal; o aplicativo de YaoFANGUK reúne detecção e opções STTN, LaMa e ProPainter. | Baseline e fonte de implementação de máscaras. Instalar outra interface não garante qualidade melhor. Conferir algoritmo e pesos realmente executados. [STTN](https://github.com/researchmm/STTN), [aplicativo](https://github.com/YaoFANGUK/video-subtitle-remover). |
| LaMa | Modelo de inpainting de imagem. | Útil como comparação espacial; minha avaliação é que não deve ser o único motor para cenas em movimento, pois não recebe a sequência temporal. [Projeto](https://github.com/advimman/lama). |

Um caso concreto de nomes enganosos: o README de SysAdminDoc informa que seu modo denominado ProPainter é um híbrido TBE + LaMa, não o modelo ICCV 2023. Não comparar resultados apenas pelo nome mostrado na interface. [Declaração do próprio projeto](https://github.com/SysAdminDoc/VideoSubtitleRemover).

## Memória e tempo: números publicados, não medidos aqui

| Motor / configuração dos autores | VRAM publicada | Tempo publicado |
| --- | --- | --- |
| ProPainter, 640×480, 50 quadros, FP16 | 6 GB | Não adotado como estimativa local |
| ProPainter, 1280×720, 50 quadros, FP16 | 19 GB | Não adotado como estimativa local |
| DiffuEraser, 640×360 | 12 GB | 92 s para 250 quadros (~10 s), GPU L20 |
| DiffuEraser, 960×540 | 20 GB | 175 s para o mesmo teste |
| DiffuEraser, 1280×720 | 33 GB | 314 s para o mesmo teste |
| SVOR, configuração padrão | Cerca de 33 GB | Não estabelecido nesta pesquisa |

Fontes: [ProPainter, memória](https://github.com/sczhou/ProPainter#-memory-efficient-inference), [DiffuEraser, inferência](https://github.com/lixiaowen-xw/DiffuEraser), [SVOR, instruções](https://github.com/xiaomi-research/svor#quick-test). O SVOR documenta execução em 24 GB com `model_cpu_offload` e redução adicional de resolução. Isso pode aumentar latência.

Recomendação operacional: manter a RTX 2060 para preparação e experimentos pequenos; começar a avaliação pesada em 24 GB com configurações controladas, ou 48 GB para maior folga. Essas capacidades são escolhas para testar, não garantias de execução de qualquer configuração. Não estimar custo por minuto a partir de VRAM. Medir tempo de aquecimento, inferência, transferências, composição e retries; calcular custo total da sessão dividido pelos minutos de saída aprovados.

## Mudanças propostas no nosso pipeline

1. **Máscara fiel por quadro.** Detectar letras e incluir contorno/sombra. Separar legenda de logo. OCR como localização, com refinamento visual; SAM2 pode auxiliar objetos, mas não substituir automaticamente segmentação de letras finas. [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [SAM2](https://github.com/facebookresearch/sam2).
2. **Recorte estável por cena.** Calcular a região que contém a legenda e uma margem de contexto; recortar vídeo e máscaras com as mesmas coordenadas. Começar comparando margens de 64 e 128 pixels originais, valores experimentais. Evitar recorte que salte a cada palavra e união de logos distantes numa região enorme.
3. **Contexto temporal.** Manter quadros anteriores/posteriores à janela entregue, respeitando cortes de cena. O trecho a comparar pode ter 5 s, mas a inferência pode usar contexto adicional do original sem incluir cenas diferentes.
4. **Composição.** Recolocar apenas a região mascarada no original; verificar bordas da máscara. Comparar pixels preservados antes da compressão: H.264 pode alterar valores mesmo fora da máscara.
5. **Seleção de resultado.** ProPainter, SVOR e DiffuEraser recebem o mesmo original e as mesmas máscaras de referência. Não aplicar motores sucessivamente sobre uma saída já danificada. O uso de ProPainter como prior interno de DiffuEraser é parte do método oficial, uma situação distinta.
6. **Auditoria.** Texto residual, cintilação, deformação de roupa/rosto, bordas e integridade audiovisual. Um score heurístico alto não certifica qualidade.

## Experimento de comparação

Primeira rodada: trecho comum original/Vmake, com alinhamento temporal verificado. Uma máscara manual revisada isola a qualidade do motor; depois repetir com máscaras automáticas para medir perdas de detecção.

| Variante | Objetivo |
| --- | --- |
| Saída antiga | Documentar defeito conhecido, sem atribuir motor |
| ProPainter atual, quadro completo | Estabelecer baseline real do código atual |
| ProPainter, recorte com contexto | Medir efeito da preservação de resolução local |
| SVOR, mesmo recorte e máscara | Avaliar candidato novo |
| VACE base, mesmo material | Medir ganho do SVOR sobre sua base |
| DiffuEraser | Comparação adicional se houver recursos e enquadramento de licença |

Registrar hashes do vídeo, máscaras e pesos; revisão do código; parâmetros; seed quando aplicável; resolução efetiva; quadros; áudio; pico VRAM; tempo; erros; saída visual. Revisar em velocidade normal e lenta, com avaliadores sem identificar o motor.

Ampliar depois para um piloto proposto de 20–30 trechos distintos: fundo parado, câmera em movimento, roupa estampada, rosto, karaoke, texto persistente e cortes. Separar vídeos por origem entre ajuste e avaliação. Meta inicial proposta: nenhuma legenda residual visível, nenhuma faixa/borrão forte e nenhuma mudança perceptível fora da área solicitada nos trechos aprovados. Reportar taxa de aprovação e falhas por categoria, não apenas média.

PSNR/SSIM contra o Vmake não medem recuperação verdadeira: sua saída também é reconstruída e pode mudar cor, compressão ou tempo. Para métricas de fidelidade, adicionar legendas sintéticas a vídeos limpos e usar o limpo como referência; avaliar região apagada, região preservada e consistência temporal separadamente. PROVE é uma referência adicional de avaliação de remoção, não um substituto do nosso conjunto de legendas. [PROVE](https://github.com/xiaomi-research/prove).

## Treinamento: quando vale a pena

Primeiro testar modelos existentes. Se falhas se concentrarem em fontes, bordas e karaoke, investir no detector/máscaras. Se máscaras corretas ainda produzirem textura incorreta, considerar fine-tuning do reconstrutor com pares próprios: vídeo limpo + legenda adicionada com alpha, sombra, movimento, compressão e tipografia variadas. Manter o conjunto final de teste fora desse ajuste.

O vídeo Vmake é referência de qualidade visual, não ground truth nem um conjunto de treinamento suficiente. Repetir seus quadros não cria diversidade. Volume de dados e GPU de treinamento devem ser dimensionados por piloto e curva de validação; não há base aqui para prometer número de horas ou equivalência.

## Divergências documentais encontradas

`MODEL_LICENSES.md` precisa de revisão de proveniência: atribui Apache-2.0 ao STTN genericamente, mas o repositório original publica MIT; a variante ONNX deve ter sua origem identificada. Também afirma uma licença não comercial genérica para os pesos LaMa sem fonte individual; o repositório original publica Apache-2.0. Não concluir que um export ONNX muda direitos do checkpoint de origem. Registrar URL, revisão, hash e licença de cada artefato antes de atualizar a classificação. [STTN LICENSE](https://github.com/researchmm/STTN/blob/master/LICENSE), [LaMa LICENSE](https://github.com/advimman/lama/blob/main/LICENSE).

A tabela também resume DiffuEraser como S-Lab/Stable Diffusion, enquanto seu adaptador já distingue corretamente a licença Apache do repositório e a restrição do prior ProPainter. A pesquisa não alterou permissões nem habilitou providers.

## Entrega seguinte recomendada

Um pacote de comparação de 5 segundos com máscaras revisadas, ProPainter atual e ProPainter por recorte, parâmetros e avaliação em movimento. Em seguida, adicionar um adaptador SVOR isolado e compará-lo no mesmo protocolo. Decidir o motor comercial a partir de qualidade medida, custo por saída aprovada e proveniência de licenças.

## Complemento: ComfyUI, Hostear e RunPod

A proposta de decompor vídeo em quadros é compatível com o caminho recomendado. O ponto decisivo é se o modelo vê a sequência ou se cada imagem vira uma inferência independente. Um batch de imagens enviado a um modelo de imagem continua sem contexto temporal. Fixar seed ou escrever “remova a legenda” não cria esse contexto. Minha avaliação é que inpainting independente pode funcionar em fundos simples, mas oferece risco alto de cintilação, mudanças na roupa e detalhes inconsistentes.

ComfyUI organiza a execução e facilita inspeção de máscaras e parâmetros. Não é um modelo de remoção e, por si só, não aumenta a qualidade do mesmo modelo com as mesmas entradas. Há quatro caminhos verificáveis:

- [ProPainter Nodes](https://github.com/daniabib/ComfyUI_ProPainter_Nodes): recebe quadros e máscaras; expõe vizinhos, referências, tamanho de subvídeo, RAFT e FP16. Preserva a restrição de licença do modelo.
- [ComfyUI-SVOR](https://github.com/Foxerity/ComfyUI-SVOR): integração comunitária que declara manter o pipeline original; carrega vídeo/máscara, executa SVOR e exporta MP4. Ainda deve ser comparada à implementação oficial antes de ser adotada.
- [ComfyUI DiffuEraser](https://github.com/smthemex/ComfyUI_DiffuEraser): integração comunitária disponível; fixar revisão e dependências do workflow validado, sem presumir compatibilidade de qualquer JSON antigo.
- [VACE na documentação oficial ComfyUI](https://docs.comfy.org/tutorials/video/wan/vace): exemplos de edição com vídeo e máscara. O modelo e a resolução escolhidos continuam determinantes.

O [worker-comfyui da RunPod](https://github.com/runpod-workers/worker-comfyui) oferece execução serverless de workflows. Isso confirma a viabilidade da integração, não a compatibilidade já testada com nossos vídeos ou custom nodes.

### Arquitetura proposta

1. Hostear recebe o original, preserva o áudio e timestamps, detecta cenas e prepara máscaras/recortes. Reaproveitar o contrato de chunks já presente em `runpod_handler.py`.
2. Enviar um trecho com contexto e suas máscaras por job. Extrair os quadros junto da GPU ou transportar um pacote, evitando uma chamada de rede por imagem. Máscaras devem manter valores e alinhamento; preferir PNG ou codificação sem perdas validada.
3. RunPod executa o modelo temporal, diretamente ou via ComfyUI. Testar inicialmente um job por GPU. Janelas longas devem ter overlap e respeitar mudanças de cena; tamanho da janela depende do motor, VRAM e movimento.
4. Hostear recebe a região reconstruída, recompõe no original, remove contexto excedente e reúne áudio/vídeo. Verificar número de quadros, timestamps, duração, orientação e cores. Cortes entre chunks precisam de avaliação em movimento, mesmo com overlap.

Exemplo de escala: 80,68 s a 30 fps representam cerca de 2.420 quadros. Enviar cada quadro como tarefa isolada multiplica uploads, agendamento e remontagem, e remove o contexto necessário. Mesmo quando a extração em quadros é usada internamente, a unidade de inferência deve ser uma janela temporal.

### Alternativas por tipo de cena — avaliação de engenharia

| Estratégia | Melhor uso proposto | Limite relevante |
| --- | --- | --- |
| Recuperar pixels reais de quadros vizinhos | Legendas intermitentes, fundo que reaparece | Falha quando o fundo permanece coberto ou há oclusões/movimento mal estimados |
| Quadro limpo de referência + propagação | Cenas difíceis com correção manual assistida | Exige referências adicionais em mudança de pose, oclusões ou câmera |
| Inpainting de imagem independente | Baseline, fundo uniforme ou imagem parada | Não impõe estabilidade entre quadros |
| ProPainter/STTN/E2FGVI temporal | Baselines de reconstrução com sequência | Fluxo e textura podem falhar; testar o artefato exato |
| SVOR/VACE/DiffuEraser | Reconstrução generativa em regiões sem pixels recuperáveis | Pode criar detalhes plausíveis mas diferentes; custo e estabilidade precisam de medição |
| Fine-tuning especializado em legendas | Falhas recorrentes após validar máscaras e configuração | Exige pares diversos e avaliação separada; não é treinamento com um único vídeo |
| Recuperar a versão original sem legenda | Quando o arquivo limpo existe | Única opção que evita inferir pixels ocultos; não presumir que está disponível |

[E2FGVI](https://github.com/MCG-NKU/E2FGVI) é mais um baseline temporal, sem evidência nesta pesquisa de que justifique substituir primeiro os adaptadores existentes. [Ebsynth](https://github.com/jamriska/ebsynth) é referência de síntese guiada por exemplos para estudar propagação de correções; o repositório antigo e o aplicativo atual não devem ser tratados como o mesmo produto/licenciamento. A estratégia assistida não está implementada aqui.

### Escolha e experimento que resolve a dúvida

Usar ComfyUI em ambiente RunPod isolado para experimentar, mantendo Hostear como coordenador. Depois que o workflow vencer a comparação, automatizá-lo no worker ou portar a configuração para o adaptador direto. Escolher entre essas duas implementações por operação e manutenção, sem presumir ganho visual da interface.

Primeiro comparar no trecho comum: (A) inpainting independente de imagens como controle, (B) ProPainter temporal por recorte, (C) SVOR temporal e (D) VACE ou DiffuEraser como comparação adicional. Usar máscara revisada equivalente, parâmetros registrados e composição idêntica. Cada motor parte do original. Testar depois máscaras automáticas e outros vídeos. Escolher pelo menor custo por saída aprovada, não pelo quadro mais bonito isoladamente.

Uma máscara desenhada numa faixa pode servir como região de busca. Para karaoke, a máscara efetiva deve acompanhar as letras e seu halo por quadro. O contexto espacial pode ser amplo enquanto a área efetivamente substituída permanece pequena. Prompts são condicionamento auxiliar; não substituem essa máscara.

Não há evidência de paridade ou superioridade sobre Vmake neste complemento. Não foi instalado ComfyUI, nem iniciada GPU, nem alterado o serviço de produção. A recomendação combina ComfyUI para experimentos com o pipeline temporal já proposto.

## Decisão com prioridade de prazo curto

Com a restrição explícita de evitar semanas ou meses de construção, priorizar o caminho já integrado: **ProPainter oficial por recorte com contexto, comparando DiffuEraser nas cenas que continuarem ruins**. SVOR permanece alternativa se essa rodada falhar. ComfyUI é opcional e não é pré-requisito para essa amostra.

Revisão visual adicional: foram extraídas sequências a 4 quadros por segundo dos primeiros ~5 segundos, preservando os vídeos. Arquivos em `G:\dowloand\teste\comparacao-vmake-20260908\vmake-sequencia-4fps.png` e `nossa-sequencia-4fps.png`. São amostragens para inspeção, não playback completo nem alinhamento temporal exato. Confirmam faixas persistentes na janela e cintura na saída antiga, ausentes com essa aparência na referência. A referência tem 147 quadros, 1080×1920, duração declarada de 4,928 s. Há diferenças de timing e aparência fora da legenda; não atribuir tudo a inpainting.

Entrega mínima que decide viabilidade: um MP4 novo do trecho comum, com áudio, máscaras revisadas e reconstrução GPU por cena. Comparar inicialmente as regiões da janela e cintura. Não construir interface, dataset de treinamento ou adaptadores de vários modelos antes dessa prova. Só expandir para o vídeo de 80 s após aprovar a amostra e testar as junções.

A mudança de recorte deve manter coordenadas estáveis, contexto temporal, composição mascarada e validação de FPS/quadros. Usar a Hostear para preparação/montagem e RunPod para inferência. O registro de falha da imagem RunPod continua sendo um bloqueio de infraestrutura a resolver; não confundir código existente com endpoint operacional.

Pode-se limitar a prova a 1–2 dias de trabalho após disponibilidade de GPU/ambiente: é um limite proposto para decisão, não promessa de qualidade ou prazo de produção. Se a amostra reprovar, fazer uma única comparação SVOR antes de ampliar o desenvolvimento. A restrição comercial do prior ProPainter continua aplicável ao conjunto DiffuEraser; a escolha final do produto depende da autorização correspondente ou de alternativa compatível.
