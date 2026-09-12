# LaMa

Ano: 2021. Repositório: https://github.com/advimman/lama.
Revisão consultada: `786f5936b27fb3dacd2b1ad799e4de968ea697e7`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Inpainting de imagem com convoluções Fourier para contexto amplo.

bin/predict.py carrega configuração/checkpoint, binariza máscara, executa modelo ou refinamento opcional e remove padding ao salvar. saicinpainting/training/modules/ffc.py implementa a mistura de componentes locais e espectrais. Não há memória de vídeo nessa entrada de inferência.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/advimman/lama/blob/786f5936b27fb3dacd2b1ad799e4de968ea697e7/LICENSE)
- [bin/predict.py](https://github.com/advimman/lama/blob/786f5936b27fb3dacd2b1ad799e4de968ea697e7/bin/predict.py): `main`
- [saicinpainting/training/modules/ffc.py](https://github.com/advimman/lama/blob/786f5936b27fb3dacd2b1ad799e4de968ea697e7/saicinpainting/training/modules/ffc.py): `FFCSE_block`, `FourierUnit`, `SpectralTransform`, `FFC`, `FFC_BN_ACT`, `FFCResnetBlock`, `ConcatTupleLayer`, `FFCResNetGenerator`, `FFCNLayerDiscriminator`, `__init__`, `forward`, `__init__`, `forward`, `__init__`

## Estratégia temporal, máscaras e limitações

Aplicação frame a frame não garante estabilidade temporal. O export Carve/LaMa-ONNX referenciado localmente tem proveniência própria; licença do código upstream não basta para certificar o export.

## Pesos, requisitos e licença

Pesos/modelos: big-lama; export ONNX do provider local requer auditoria.
Licença de código: Apache-2.0 no código; conferir pesos e export ONNX individualmente. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Usar como controle espacial para separar problemas de textura de problemas temporais; medir flicker em sequência, não só imagem parada.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/lama.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2109.07161.
