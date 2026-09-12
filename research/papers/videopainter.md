# VideoPainter: paper card

Fonte primária: https://arxiv.org/abs/2503.05639. Ano: 2025. Consultado em 10/09/2026.
Código: https://github.com/TencentARC/VideoPainter.

**Problema/core idea:** Inpainting/edição de vídeo com controle de contexto em backbone de difusão.

**Arquitetura e inferência:** [análise do código e fontes](../projects/videopainter.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** Não declarar equivalência com Cleaner ou uso comercial permitido. A licença do projeto restringe uso a pesquisa/educação e inclui termos de CogVideoX; a cadeia de permissões deve ser avaliada inteira.

**Código/modelo/licença:** Licença customizada não comercial; CogVideoX também possui termos próprios. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** Comparar apenas quando houver licença aplicável e recursos de laboratório; primeiro completar auditoria de inferência.

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
