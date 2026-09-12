# STTN

Ano: 2020. Repositório: https://github.com/researchmm/STTN.
Revisão consultada: `f39f62c5bbbe3e3eba084c487353a2c651bfdcde`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Inpainting conjunto por atenção espacial-temporal.

test.py::main_worker codifica frames mascarados, seleciona vizinhos e referências, chama InpaintGenerator.infer e decodifica frames locais. Sobreposições de janelas são combinadas; o script de demonstração fixa 432×240 e 24 FPS.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/researchmm/STTN/blob/f39f62c5bbbe3e3eba084c487353a2c651bfdcde/LICENSE)
- [test.py](https://github.com/researchmm/STTN/blob/f39f62c5bbbe3e3eba084c487353a2c651bfdcde/test.py): `get_ref_index`, `read_mask`, `read_frame_from_videos`, `main_worker`
- [model/sttn.py](https://github.com/researchmm/STTN/blob/f39f62c5bbbe3e3eba084c487353a2c651bfdcde/model/sttn.py): `BaseNetwork`, `InpaintGenerator`, `deconv`, `Attention`, `MultiHeadedAttention`, `FeedForward`, `TransformerBlock`, `Discriminator`, `spectral_norm`, `__init__`, `print_network`, `init_weights`, `__init__`, `forward`

## Estratégia temporal, máscaras e limitações

Esses defaults da demonstração não devem ser copiados para produção. O provider ONNX local é outro artefato: sua forma temporal e equivalência numérica precisam ser verificadas contra upstream.

## Pesos, requisitos e licença

Pesos/modelos: Checkpoint netG upstream; sttn.onnx local é export separado.
Licença de código: MIT no LICENSE consultado; confirmar termos dos checkpoints/export. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Comparar export ONNX e PyTorch em um caso alinhado antes de atribuir diferenças ao modelo; registrar shape, máscaras e frame rate.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/sttn.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2007.10247.
