# Focal Transformer: paper card

Fonte primária: https://arxiv.org/abs/2107.00641. Ano: 2021. Consultado em 10/09/2026.
Código: https://github.com/microsoft/Focal-Transformer.

**Problema/core idea:** Backbone visual com atenção local fina e global agregada.

**Arquitetura e inferência:** [análise do código e fontes](../projects/focal-transformer.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** Não é um engine pronto de remoção de vídeo, nem deve ser confundido com todos os modelos chamados FGT/FocalNet. Benefício para Cleaner é indireto e exige projeto/treino próprio.

**Código/modelo/licença:** MIT no código; checkpoints/dados separados. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Manter como referência de mecanismo de atenção, abaixo das ablações dos engines existentes.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
