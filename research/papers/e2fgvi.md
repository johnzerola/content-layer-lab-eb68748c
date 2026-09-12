# E2FGVI: paper card

Fonte primária: https://arxiv.org/abs/2204.02663. Ano: 2022. Consultado em 10/09/2026.
Código: https://github.com/MCG-NKU/E2FGVI.

**Problema/core idea:** Inpainting end-to-end guiado por flow com propagação e síntese.

**Arquitetura e inferência:** [análise do código e fontes](../projects/e2fgvi.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** Avaliar a variante exata; resultados publicados não substituem benchmark de legendas. Licença não comercial impede tratá-lo como substituto comercial liberado.

**Código/modelo/licença:** CC-BY-NC-4.0. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Referência acadêmica para ablação de propagação/features, mantendo máscaras e resolução fixas.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
