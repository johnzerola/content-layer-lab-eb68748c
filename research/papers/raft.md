# RAFT: paper card

Fonte primária: https://arxiv.org/abs/2003.12039. Ano: 2020. Consultado em 10/09/2026.
Código: https://github.com/princeton-vl/RAFT.

**Problema/core idea:** Optical flow de pares de imagens com volumes de correlação e atualização recorrente.

**Arquitetura e inferência:** [análise do código e fontes](../projects/raft.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Resultados publicados:** o abstract informa F1-all 5,10% no KITTI e EPE
2,855 no Sintel final. São métricas de optical flow, não remoção de texto; benchmark
Cleaner exige análise de oclusão e reconstrução. O treino detalhado por domínio
e licenças dos datasets precisam ser vinculados ao checkpoint que será utilizado.
[Fonte primária](https://arxiv.org/abs/2003.12039).

**Limitações para Cleaner:** Não reconstrói pixels nem identifica legendas. Flow em oclusões ou texto sobreposto pode apontar correspondência errada; EPE em benchmark de flow não mede qualidade de inpainting.

**Código/modelo/licença:** BSD-3-Clause no código; pesos/datasets precisam de evidência própria. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Investigar confiança forward/backward e máscaras de oclusão antes de trocar o estimador. Medir VRAM da correlação e erros de warping.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
