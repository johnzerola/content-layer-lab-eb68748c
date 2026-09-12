# Controle: texto residual em identity

Classe: synthetic-harness-control, não incidente de produção.
Input/mask/ground truth: `research/benchmarks/data/static/`, gerados por
`research/bootstrap.py`. Output/engine/parâmetros/hashes: registro identity em
[smoke-results](../benchmarks/smoke-results.json).

Observação: a legenda permanece integralmente porque identity devolve os frames
de entrada. Root cause é conhecida pela definição do controle, não inferida por OCR.
Este caso verifica se métricas contra GT distinguem preservação de entrada de
remoção. Não serve como falha representativa de um engine de IA.
