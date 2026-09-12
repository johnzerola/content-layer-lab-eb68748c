# Experimentos isolados

`create_experiment` grava problema, hipótese, baseline, mudança, dataset, métricas
e `result: null`, estado `DESIGNED`. Cada registro tem ID único e não sobrescreve
anteriores. O resultado entra em novo `record_research` com referência ao ID do
experimento e aos relatórios; assim decisão e execução permanecem auditáveis.

Fluxo: DESIGNED → RUNNING → MEASURED → ACCEPTED / REJECTED / INCONCLUSIVE.
Esses estados são evidência documental; não há promoção automática de código.
Anexe parâmetros exatos, hashes, falhas, regressões, custo e critérios definidos
previamente. Hipótese sem GT ou sem amostragem suficiente pode permanecer inconclusiva.

O diretório `runs/` é ignorado no Git para mídia e intermediários. Cards e resumos
devem ser versionáveis. Alterações reais em engines ficam em um checkout isolado
somente depois dos gates de evidência; rollback é descartar esse experimento,
mantendo a baseline. Nenhum fallback é removido por este laboratório.
