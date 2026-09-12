# SAM 2: paper card

Fonte primária: https://arxiv.org/abs/2408.00714. Ano: 2024. Consultado em 10/09/2026.
Código: https://github.com/facebookresearch/sam2.

**Problema/core idea:** Segmentação promptável de vídeo com memória de inferência.

**Arquitetura e inferência:** [análise do código e fontes](../projects/sam2.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** Segmentação de objeto não equivale a segmentação precisa de strokes, glow ou alpha de legendas. O provider local pode executar GrabCut: medir como SAM2 seria um erro de atribuição.

**Código/modelo/licença:** Apache-2.0 para código/model checkpoints conforme README; SA-V e terceiros separados. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Testar estabilidade e cobertura de texto fino com detector fixo; recomeçar estado por cena. Comparar memória e qualidade sem modificar o worker atual.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
