# ProPainter

Ano: 2023. Repositório: https://github.com/sczhou/ProPainter.
Revisão consultada: `e870e79321c31b733e2031af5aa2fb1fe3ac7eec`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Reconstrução temporal com propagação em imagem/features e Transformer esparso guiado por máscara.

O script lê frames/máscaras, ajusta múltiplos de oito e normaliza tensores. RAFT_bi estima flow; RecurrentFlowCompleteNet completa regiões de flow; img_propagation recupera pixels; InpaintGenerator.forward combina features locais e referências antes de decodificar e compor. A máscara atualizada após propagação é distinta da máscara original.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/LICENSE)
- [inference_propainter.py](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/inference_propainter.py): `imwrite`, `resize_frames`, `read_frame_from_videos`, `binary_mask`, `read_mask`, `extrapolation`, `get_ref_index`
- [web-demos/hugging_face/tracker/inference/inference_core.py](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/web-demos/hugging_face/tracker/inference/inference_core.py): `InferenceCore`, `__init__`, `clear_memory`, `clear_non_permanent_memory`, `clear_sensory_memory`, `update_config`, `_add_memory`, `_segment`, `step`, `get_aux_outputs`, `get_aux_object_weights`
- [model/propainter.py](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/model/propainter.py): `length_sq`, `fbConsistencyCheck`, `DeformableAlignment`, `BidirectionalPropagation`, `Encoder`, `deconv`, `InpaintGenerator`, `Discriminator`, `Discriminator_2D`, `spectral_norm`, `__init__`, `init_offset`, `forward`, `__init__`
- [model/recurrent_flow_completion.py](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/model/recurrent_flow_completion.py): `SecondOrderDeformableAlignment`, `BidirectionalPropagation`, `deconv`, `P3DBlock`, `EdgeDetection`, `RecurrentFlowCompleteNet`, `__init__`, `init_offset`, `forward`, `__init__`, `forward`, `__init__`, `forward`, `__init__`
- [model/modules/flow_comp_raft.py](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/model/modules/flow_comp_raft.py): `initialize_RAFT`, `RAFT_bi`, `smoothness_loss`, `smoothness_deltas`, `second_order_loss`, `charbonnier_loss`, `second_order_deltas`, `create_mask`, `ternary_loss`, `FlowLoss`, `edgeLoss`, `EdgeLoss`, `FlowSimpleLoss`, `__init__`

## Estratégia temporal, máscaras e limitações

Separar qualidade de flow, cobertura de máscara e capacidade generativa. Fundo reaparecendo fora da janela não pode ajudar aquela inferência. Tensores globais e correlações podem consumir memória apesar de subvideo_length pequeno.

## Pesos, requisitos e licença

Pesos/modelos: ProPainter.pth + recurrent_flow_completion.pth + raft-things.pth.
Licença de código: S-Lab 1.0; uso comercial requer autorização específica. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Comparar upstream com o adapter local usando frames/máscaras idênticos; medir dilation efetiva, resize, ref_stride, subvideo_length e composição.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/propainter.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2309.03897.
