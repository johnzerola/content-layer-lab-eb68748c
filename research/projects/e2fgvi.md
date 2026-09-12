# E2FGVI

Ano: 2022. Repositório: https://github.com/MCG-NKU/E2FGVI.
Revisão consultada: `709cbe319edc21b8a365a28e14cba595a93d62cf`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Inpainting end-to-end guiado por flow com propagação e síntese.

test.py prepara referências e vizinhos; InpaintGenerator.forward_bidirect_flow calcula flow local e forward combina propagação/features e síntese. A família inclui variante HQ para tratar resolução diferentemente.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/MCG-NKU/E2FGVI/blob/709cbe319edc21b8a365a28e14cba595a93d62cf/LICENSE)
- [test.py](https://github.com/MCG-NKU/E2FGVI/blob/709cbe319edc21b8a365a28e14cba595a93d62cf/test.py): `get_ref_index`, `read_mask`, `read_frame_from_videos`, `resize_frames`, `main_worker`, `update`
- [model/e2fgvi.py](https://github.com/MCG-NKU/E2FGVI/blob/709cbe319edc21b8a365a28e14cba595a93d62cf/model/e2fgvi.py): `BaseNetwork`, `Encoder`, `deconv`, `InpaintGenerator`, `Discriminator`, `spectral_norm`, `__init__`, `print_network`, `init_weights`, `__init__`, `forward`, `__init__`, `forward`, `__init__`

## Estratégia temporal, máscaras e limitações

Avaliar a variante exata; resultados publicados não substituem benchmark de legendas. Licença não comercial impede tratá-lo como substituto comercial liberado.

## Pesos, requisitos e licença

Pesos/modelos: E2FGVI e E2FGVI-HQ: registrar checkpoint e variante.
Licença de código: CC-BY-NC-4.0. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Referência acadêmica para ablação de propagação/features, mantendo máscaras e resolução fixas.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/e2fgvi.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2204.02663.
