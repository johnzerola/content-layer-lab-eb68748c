# Focal Transformer

Ano: 2021. Repositório: https://github.com/microsoft/Focal-Transformer.
Revisão consultada: `57bb3031582a2afb2d2a6916612bc4311316f9fc`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Backbone visual com atenção local fina e global agregada.

O projeto é um backbone de visão; seus resultados incluem classificação, detecção e segmentação. Atenção focal reduz custo de contexto amplo por granularidade variável.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/microsoft/Focal-Transformer/blob/57bb3031582a2afb2d2a6916612bc4311316f9fc/LICENSE)
- [classification/focal_transformer.py](https://github.com/microsoft/Focal-Transformer/blob/57bb3031582a2afb2d2a6916612bc4311316f9fc/classification/focal_transformer.py): `Mlp`, `window_partition`, `window_partition_noreshape`, `window_reverse`, `get_roll_masks`, `get_relative_position_index`, `WindowAttention`, `FocalTransformerBlock`, `PatchMerging`, `BasicLayer`, `PatchEmbed`, `FocalTransformer`, `profile`, `__init__`

## Estratégia temporal, máscaras e limitações

Não é um engine pronto de remoção de vídeo, nem deve ser confundido com todos os modelos chamados FGT/FocalNet. Benefício para Cleaner é indireto e exige projeto/treino próprio.

## Pesos, requisitos e licença

Pesos/modelos: Backbones Focal-T/S/B; não são pesos de video inpainting.
Licença de código: MIT no código; checkpoints/dados separados. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Manter como referência de mecanismo de atenção, abaixo das ablações dos engines existentes.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/focal-transformer.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2107.00641.
