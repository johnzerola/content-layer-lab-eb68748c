# Performance e escalabilidade

## Orçamento inicial

| Operação | Meta de interação |
|---|---:|
| arrastar clip/keyframe | p95 < 50 ms por frame de interação |
| seek no proxy | p95 < 150 ms |
| abrir projeto salvo | p95 < 2 s sem decodificar todos os assets |
| inserir template | feedback visual < 300 ms; render completo assíncrono |
| waveform | primeira faixa visível < 500 ms após idle |

Metas são hipóteses de produto; medir em máquina de referência antes de fixar SLO.

## Estratégias

- virtualizar clips, cues e rows fora da viewport;
- atualizar playhead com `requestAnimationFrame`, não por renders globais;
- usar selectors finos em store e comandos imutáveis;
- decodificar proxy/thumbnail sob demanda;
- cachear waveform e frames por hash/revisão;
- mover análise, waveform e export para workers;
- limitar partículas/glows e desligá-los em reduced motion ou baixo desempenho;
- evitar regravar o documento inteiro a cada pointer move; persistir no fim do comando.

## Observabilidade

Registrar tempo de decode, seek, composição, save, render e tamanho do projeto. A UI deve explicar “aguardando proxy”, “renderizando frame” e “exportando”, em vez de parecer travada.
