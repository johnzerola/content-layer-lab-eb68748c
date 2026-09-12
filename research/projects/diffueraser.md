# DiffuEraser

Ano: 2025. Repositório: https://github.com/lixiaowen-xw/DiffuEraser.
Revisão consultada: `8e6f279ac7531e27ad1849c6f8dab5372a8597e7`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Inpainting generativo de vídeo com prior ProPainter, Stable Diffusion, BrushNet, motion UNet e PCM.

run_diffueraser.main constrói prior e diffusion; DiffuEraser.forward codifica o prior no VAE, prepara ruído e faz inferência temporal. read_mask executa erosão seguida de dilation. A composição usa máscara suavizada quando blended=True. read_priori apaga o intermediário após lê-lo: preserve uma cópia para diagnóstico.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [LICENSE](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/LICENSE)
- [propainter/inference.py](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/propainter/inference.py)
- [run_diffueraser.py](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/run_diffueraser.py): `main`
- [diffueraser/diffueraser.py](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/diffueraser/diffueraser.py): `import_model_class_from_model_name_or_path`, `resize_frames`, `read_mask`, `read_priori`, `read_video`, `DiffuEraser`, `__init__`, `forward`, `decode_latents`

## Estratégia temporal, máscaras e limitações

O prior e as condições limitam alucinação, mas não provam recuperação do fundo real. Há requisito de ao menos 22 frames e alinhamento de FPS; clipes curtos e cortes exigem atenção. A expansão e o blur da máscara podem afetar pixels próximos à borda.

## Pesos, requisitos e licença

Pesos/modelos: BrushNet + UNet + SD1.5 + VAE + PCM + prior ProPainter.
Licença de código: Apache-2.0 no projeto; ProPainter e demais pesos mantêm licenças próprias. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Comparar prior isolado e saída diffusion sobre o mesmo caso, preservando máscaras antes/depois do preprocessing, seed e resolução.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

[Coleta estruturada](evidence/diffueraser.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.
Paper: https://arxiv.org/abs/2501.10018.
