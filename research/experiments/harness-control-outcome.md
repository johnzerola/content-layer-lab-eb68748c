# Resultado do controle do instrumento

Relacionado ao registro `validate-measurement-harness-99362b9c7713`.
Estado: MEASURED — controle de instrumentação, registro retrospectivo; não é um
experimento de melhoria do Cleaner pré-registrado.

Os três casos sintéticos foram executados com identity e OpenCV Telea. Identity
preservou texto e teve MSE contra GT maior que Telea. Nos seis resultados,
outside-mask MAE foi zero. O teste com alteração deliberada fora da máscara
detectou erro positivo; truncamento e FPS divergente foram rejeitados.

Evidência: [relatórios medidos](../benchmarks/smoke-results.json) e
`research/tests/test_lab.py`. Decisão: harness adequado para esses controles.
Não há decisão sobre ProPainter/DiffuEraser, qualidade comercial ou novos defaults.
