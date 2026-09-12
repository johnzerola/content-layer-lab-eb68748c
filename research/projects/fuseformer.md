# FuseFormer

Ano: 2021. Repositório: https://github.com/ruiliu-ai/FuseFormer.
Revisão consultada: `e7e461ff0a59aa71bb01654e7e67183872796c78`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Inpainting por Transformer com interação de patches sobrepostos.

InpaintGenerator.forward codifica frames, usa SoftSplit (Unfold), Transformer e SoftComp (Fold), soma features e decodifica. O objetivo técnico é reduzir perda de detalhes nas fronteiras dos tokens.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [test.py](https://github.com/ruiliu-ai/FuseFormer/blob/e7e461ff0a59aa71bb01654e7e67183872796c78/test.py): `get_ref_index`, `read_mask`, `read_frame_from_videos`, `main_worker`
- [model/fuseformer.py](https://github.com/ruiliu-ai/FuseFormer/blob/e7e461ff0a59aa71bb01654e7e67183872796c78/model/fuseformer.py): `BaseNetwork`, `Encoder`, `InpaintGenerator`, `deconv`, `Attention`, `AddPosEmb`, `SoftSplit`, `SoftComp`, `MultiHeadedAttention`, `FeedForward`, `FusionFeedForward`, `TransformerBlock`, `Discriminator`, `spectral_norm`

## Estratégia temporal, máscaras e limitações

A implementação consultada contém formas de referência fixas em módulos; portabilidade de resolução exige validação. Não há licença raiz clara na seleção coletada: confirmar antes de adoção.

## Pesos, requisitos e licença

Pesos/modelos: Checkpoint upstream; licença de pesos pendente.
Licença de código: UNKNOWN; não foi identificado LICENSE raiz na coleta. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Estudar composição de patches como conceito; não copiar módulos antes de resolver licença e equivalência.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/fuseformer.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2109.02974.
