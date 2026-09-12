# LaMa ONNX: export relevante ao provider local

O provider `backend/app/providers/lama_provider.py` referencia `Carve/LaMa-ONNX`
e `lama_fp32.onnx`. O [model card](https://huggingface.co/Carve/LaMa-ONNX) declara
Apache-2.0, export com input fixo 512×512, opset 17 e uma implementação adaptada de
FourierUnit. A equivalência com PyTorch é alegação do exportador, ainda não reproduzida
no laboratório. O card distingue um segundo arquivo `lama.onnx` que não recomenda.

Consequência experimental: registrar nome e hash do export, padding/resize e
recomposição. Não atribuir perda de detalhe ao LaMa antes de separar os efeitos
de uma entrada 512×512 e da conversão. VRAM/velocidade/qualidade locais: não medidas.
