# FuseFormer: paper card

Fonte primária: https://arxiv.org/abs/2109.02974. Ano: 2021. Consultado em 10/09/2026.
Código: https://github.com/ruiliu-ai/FuseFormer.

**Problema/core idea:** Inpainting por Transformer com interação de patches sobrepostos.

**Arquitetura e inferência:** [análise do código e fontes](../projects/fuseformer.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** A implementação consultada contém formas de referência fixas em módulos; portabilidade de resolução exige validação. Não há licença raiz clara na seleção coletada: confirmar antes de adoção.

**Código/modelo/licença:** UNKNOWN; não foi identificado LICENSE raiz na coleta. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Estudar composição de patches como conceito; não copiar módulos antes de resolver licença e equivalência.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
