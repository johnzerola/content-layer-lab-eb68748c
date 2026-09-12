# ProPainter: paper card

Fonte primária: https://arxiv.org/abs/2309.03897. Ano: 2023. Consultado em 10/09/2026.
Código: https://github.com/sczhou/ProPainter.

**Problema/core idea:** Reconstrução temporal com propagação em imagem/features e Transformer esparso guiado por máscara.

**Arquitetura e inferência:** [análise do código e fontes](../projects/propainter.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treino e avaliação publicados:** YouTube-VOS (3.471 sequências de treino),
frames 432×240 e máscaras sintéticas estacionárias/de objetos. RFC usa L1 e suavidade
de segunda ordem; inpainting combina L1 e discriminador temporal. A seção 4 descreve
700 mil iterações por módulo, batch 8 e oito V100. A tabela 1 reporta PSNR 34,43
no YouTube-VOS e 34,47 no DAVIS; o protocolo DAVIS usa 50 clipes. Esses resultados
não são avaliações de legendas do Cleaner. As ablações de propagação têm orçamento
de treino diferente, então não misturar linhas como se fossem o mesmo experimento.
Métricas publicadas incluem PSNR, SSIM, VFID e erro de warping; nosso proxy temporal
não implementa essa última métrica.
[Fonte: paper, §§3.4–4 e tabela 1](https://arxiv.org/html/2309.03897v1).

**Limitações para Cleaner:** Separar qualidade de flow, cobertura de máscara e capacidade generativa. Fundo reaparecendo fora da janela não pode ajudar aquela inferência. Tensores globais e correlações podem consumir memória apesar de subvideo_length pequeno.

**Código/modelo/licença:** S-Lab 1.0; uso comercial requer autorização específica. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Comparar upstream com o adapter local usando frames/máscaras idênticos; medir dilation efetiva, resize, ref_stride, subvideo_length e composição.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
