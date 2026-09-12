# Cutie: paper card

Fonte primária: https://arxiv.org/abs/2310.12982. Ano: 2024. Consultado em 10/09/2026.
Código: https://github.com/hkchengrex/Cutie.

**Problema/core idea:** Video object segmentation com memória e identidade de objeto.

**Arquitetura e inferência:** [análise do código e fontes](../projects/cutie.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** Texto que muda palavra/cor não é um objeto rígido. A estabilidade de identidade pode não preservar strokes; controlar drift e reinicialização por cena.

**Código/modelo/licença:** MIT no núcleo; RITM/demo/ProPainter e pesos separados. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Teste de propagação de máscara contra Farneback com anotações e detector fixos.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
