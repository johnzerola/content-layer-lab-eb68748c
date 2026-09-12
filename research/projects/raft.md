# RAFT

Ano: 2020. Repositório: https://github.com/princeton-vl/RAFT.
Revisão consultada: `2888e15a51fa41140771d3f498ed8023cff098d1`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Optical flow de pares de imagens com volumes de correlação e atualização recorrente.

RAFT.forward normaliza RGB para [-1,1], extrai features/contexto, cria CorrBlock e atualiza coordenadas com BasicUpdateBlock. O flow sai da diferença de grids; upsample_flow usa combinação convexa aprendida. core/corr.py inclui caminho alternativo CUDA para correlação.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/princeton-vl/RAFT/blob/2888e15a51fa41140771d3f498ed8023cff098d1/LICENSE)
- [core/raft.py](https://github.com/princeton-vl/RAFT/blob/2888e15a51fa41140771d3f498ed8023cff098d1/core/raft.py): `RAFT`, `__init__`, `freeze_bn`, `initialize_flow`, `upsample_flow`, `forward`, `autocast`, `__init__`, `__enter__`, `__exit__`
- [core/corr.py](https://github.com/princeton-vl/RAFT/blob/2888e15a51fa41140771d3f498ed8023cff098d1/core/corr.py): `CorrBlock`, `AltCudaCorr`, `AlternateCorrBlock`, `__init__`, `__call__`, `corr`, `forward`, `backward`, `__init__`, `__call__`
- [core/update.py](https://github.com/princeton-vl/RAFT/blob/2888e15a51fa41140771d3f498ed8023cff098d1/core/update.py): `FlowHead`, `ConvGRU`, `SepConvGRU`, `SmallMotionEncoder`, `BasicMotionEncoder`, `SmallUpdateBlock`, `BasicUpdateBlock`, `__init__`, `forward`, `__init__`, `forward`, `__init__`, `forward`, `__init__`
- [demo.py](https://github.com/princeton-vl/RAFT/blob/2888e15a51fa41140771d3f498ed8023cff098d1/demo.py): `load_image`, `viz`, `demo`

## Estratégia temporal, máscaras e limitações

Não reconstrói pixels nem identifica legendas. Flow em oclusões ou texto sobreposto pode apontar correspondência errada; EPE em benchmark de flow não mede qualidade de inpainting.

## Pesos, requisitos e licença

Pesos/modelos: Pesos por domínio, incluindo raft-things usado pelo adapter ProPainter.
Licença de código: BSD-3-Clause no código; pesos/datasets precisam de evidência própria. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Investigar confiança forward/backward e máscaras de oclusão antes de trocar o estimador. Medir VRAM da correlação e erros de warping.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/raft.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2003.12039.
