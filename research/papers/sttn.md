# STTN: paper card

Fonte primária: https://arxiv.org/abs/2007.10247. Ano: 2020. Consultado em 10/09/2026.
Código: https://github.com/researchmm/STTN.

**Problema/core idea:** Inpainting conjunto por atenção espacial-temporal.

**Arquitetura e inferência:** [análise do código e fontes](../projects/sttn.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treino/métricas:** o paper usa perda adversarial espacial-temporal e
avalia máscaras estacionárias e de objetos móveis. A inferência oficial consultada
possui defaults de demonstração de resolução/FPS que devem ser distinguidos do
protocolo científico. Não foi transcrita tabela quantitativa nesta rodada.
[Fonte primária](https://arxiv.org/abs/2007.10247).

**Limitações para Cleaner:** Esses defaults da demonstração não devem ser copiados para produção. O provider ONNX local é outro artefato: sua forma temporal e equivalência numérica precisam ser verificadas contra upstream.

**Código/modelo/licença:** MIT no LICENSE consultado; confirmar termos dos checkpoints/export. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Comparar export ONNX e PyTorch em um caso alinhado antes de atribuir diferenças ao modelo; registrar shape, máscaras e frame rate.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
