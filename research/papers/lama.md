# LaMa: paper card

Fonte primária: https://arxiv.org/abs/2109.07161. Ano: 2021. Consultado em 10/09/2026.
Código: https://github.com/advimman/lama.

**Problema/core idea:** Inpainting de imagem com convoluções Fourier para contexto amplo.

**Arquitetura e inferência:** [análise do código e fontes](../projects/lama.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** Aplicação frame a frame não garante estabilidade temporal. O export Carve/LaMa-ONNX referenciado localmente tem proveniência própria; licença do código upstream não basta para certificar o export.

**Código/modelo/licença:** Apache-2.0 no código; conferir pesos e export ONNX individualmente. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Usar como controle espacial para separar problemas de textura de problemas temporais; medir flicker em sequência, não só imagem parada.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
