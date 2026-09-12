# SAM 2

Ano: 2024. Repositório: https://github.com/facebookresearch/sam2.
Revisão consultada: `2b90b9f5ceec907a1c18123530e92e794ad901a4`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Segmentação promptável de vídeo com memória de inferência.

SAM2VideoPredictor.init_state prepara vídeo/estado; add_new_points_or_box e add_new_mask criam condições; propagate_in_video percorre frames, preserva IDs e retorna máscaras na resolução original. Há propagação reversa e opções de offload de vídeo/estado para CPU.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/facebookresearch/sam2/blob/2b90b9f5ceec907a1c18123530e92e794ad901a4/LICENSE)
- [LICENSE_cctorch](https://github.com/facebookresearch/sam2/blob/2b90b9f5ceec907a1c18123530e92e794ad901a4/LICENSE_cctorch)
- [sam2/build_sam.py](https://github.com/facebookresearch/sam2/blob/2b90b9f5ceec907a1c18123530e92e794ad901a4/sam2/build_sam.py): `build_sam2`, `build_sam2_video_predictor`, `_hf_download`, `build_sam2_hf`, `build_sam2_video_predictor_hf`, `_load_checkpoint`
- [sam2/sam2_video_predictor.py](https://github.com/facebookresearch/sam2/blob/2b90b9f5ceec907a1c18123530e92e794ad901a4/sam2/sam2_video_predictor.py): `SAM2VideoPredictor`, `SAM2VideoPredictorVOS`, `__init__`, `init_state`, `from_pretrained`, `_obj_id_to_idx`, `_obj_idx_to_id`, `_get_obj_num`, `add_new_points_or_box`, `add_new_points`, `add_new_mask`, `_get_orig_video_res_output`, `_consolidate_temp_output_across_obj`, `propagate_in_video_preflight`

## Estratégia temporal, máscaras e limitações

Segmentação de objeto não equivale a segmentação precisa de strokes, glow ou alpha de legendas. O provider local pode executar GrabCut: medir como SAM2 seria um erro de atribuição.

## Pesos, requisitos e licença

Pesos/modelos: SAM2/SAM2.1 conforme snapshot; não presumir pesos ONNX equivalentes.
Licença de código: Apache-2.0 para código/model checkpoints conforme README; SA-V e terceiros separados. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Testar estabilidade e cobertura de texto fino com detector fixo; recomeçar estado por cena. Comparar memória e qualidade sem modificar o worker atual.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/sam2.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2408.00714.
