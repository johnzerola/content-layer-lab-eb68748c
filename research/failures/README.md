# Casos de falha

Registre input, máscara efetiva, saída, engine, parâmetros, revisão, timestamps,
cortes, tipo de falha, hipóteses e experimentos relacionados. Mídia fica em
`benchmarks/data/` com direitos documentados; não incluir dados privados em cards.

`analyze_video_failure` usa palavras-chave de sintomas em inglês (`residual`,
`halo`, `flicker`, `ghost`, `cut`, `blur`, `outside`) para sugerir inspeções. Ele
não abre vídeo nem confirma root cause. A confirmação exige artefatos e ablação.
Use `record_research(category="failures", ...)` para preservar a observação.

Não importar a página de comparação aberta no IDE como se ela já comprovasse
melhoria. É necessário identificar vídeos, máscaras, configurações e origem de
cada coluna antes de converter a comparação em um benchmark.
