# DiffuEraser: paper card

Fonte primária: https://arxiv.org/abs/2501.10018. Ano: 2025. Consultado em 10/09/2026.
Código: https://github.com/lixiaowen-xw/DiffuEraser.

**Problema/core idea:** Inpainting generativo de vídeo com prior ProPainter, Stable Diffusion, BrushNet, motion UNet e PCM.

**Arquitetura e inferência:** [análise do código e fontes](../projects/diffueraser.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treino e avaliação publicados:** a seção 4 descreve 3.183.727 clipes
filtrados do Panda-70M, separados por cena. Treinamento em resolução 512: primeiro
BrushNet/UNet sem motion module, depois motion module com sequências de 22 frames.
São 100 mil e 80 mil passos, respectivamente, com L2 e taxa 1e-5. A avaliação
apresentada é principalmente qualitativa. O exemplo de eficiência reporta cerca
de 200 s para 10 s de vídeo 540p/25 FPS numa L20 com PCM em dois passos. O README
consultado informa outro tempo aproximado para 960×540; preservar ambas as fontes
e não atribuir diferença a regressão sem configuração equivalente. Resultados
visuais não estabelecem taxa de vitória nem recuperação fiel de fundo oculto.
[Fonte: relatório técnico, §4](https://arxiv.org/html/2501.10018v1).

**Limitações para Cleaner:** O prior e as condições limitam alucinação, mas não provam recuperação do fundo real. Há requisito de ao menos 22 frames e alinhamento de FPS; clipes curtos e cortes exigem atenção. A expansão e o blur da máscara podem afetar pixels próximos à borda.

**Código/modelo/licença:** Apache-2.0 no projeto; ProPainter e demais pesos mantêm licenças próprias. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Comparar prior isolado e saída diffusion sobre o mesmo caso, preservando máscaras antes/depois do preprocessing, seed e resolução.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
