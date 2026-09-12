# Catálogo inicial de modelos

| Modelo/artefato | Relação local | Identidade a registrar antes do teste |
|---|---|---|
| ProPainter.pth | Gerador exigido por adapter oficial | SHA do peso e licença S-Lab |
| raft-things.pth | Flow do pipeline ProPainter | Snapshot/treinamento e precisão |
| recurrent_flow_completion.pth | Completação de flow | Versão compatível com código |
| DiffuEraser BrushNet / unet_main | Ramo max | [Model card oficial](https://huggingface.co/lixiaowen/diffuEraser), SHA de ambos |
| SD1.5 / VAE / PCM | Condições e sampling do ramo max | IDs, revisões, safetensors e licenças independentes |
| SAM2 / SAM2.1 | Candidato de máscara; provider local distinto | [Checkpoints oficiais](https://github.com/facebookresearch/sam2#download-checkpoints), versão e tipo |
| LaMa ONNX / STTN ONNX | Providers locais condicionais | Exportador, opset, shapes, peso base, licença e paridade |
| VideoPainter | Candidato acadêmico | [Modelos do projeto](https://github.com/TencentARC/VideoPainter), restrições comerciais |

O comando `search_models` foi exercitado contra a API pública Hugging Face. As
rodadas JSON neste diretório preservam os resultados e a URL consultada. Busca
por palavra-chave não comprova identidade ou adequação; confirme autor e SHA.

VRAM, FPS, custo e qualidade locais dos modelos acima: **não medidos nesta etapa**.
Como referência de dimensionamento publicada, o README DiffuEraser estima 12 GB
em 640×360, 20 GB em 960×540 e 33 GB em 1280×720 para 250 frames numa L20; esses
valores não são requisitos universais nem um benchmark RunPod deste repositório.
[Fonte e contexto](https://github.com/lixiaowen-xw/DiffuEraser/blob/8e6f279ac7531e27ad1849c6f8dab5372a8597e7/README.md).
