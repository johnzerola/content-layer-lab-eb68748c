# Gaps entre Cleaner IA e referências

Prioridade é estimativa de impacto, ainda não ranking obtido por benchmark GPU.
Evidências locais vêm de [arquitetura](current-system/architecture.md); fontes
externas estão nos cards e na [matriz de licenças](licenses/matrix.md).

| Componente atual | Limitação/risco a medir | Referência/alternativa | Benefício esperado (hipótese) | Custo | Prioridade |
|---|---|---|---|---|---|
| Detector/máscara | Resíduo de outline/glow ou cobertura excessiva | Segmentação de strokes, máscara alpha anotada | Preservar detalhe e remover bordas reais | Médio | P0 |
| Máscara temporal/Farneback | Drift, intermitência, troca de legenda | Revalidação por frame, SAM2/Cutie como estudos | Menos flicker sem apagar objetos | Médio/alto | P1 |
| ProPainter adapter | Resize/dilation/janelas diferem do upstream | Ablation de paridade em mesma entrada | Recuperar potencial do engine existente | Médio | P0 |
| Referências temporais | Fundo válido pode ficar fora do contexto | Busca forward/backward com confiança/oclusão | Recuperar textura real antes de gerar | Alto | P1 |
| ROI/contexto | Crop pequeno pode excluir referências espaciais | Margens graduais e controle de resolução | Equilíbrio detalhe/contexto/VRAM | Médio | P1 |
| Scenes/chunks | Costuras e referências cruzando cortes | Isolamento por cena e timestamps explícitos | Continuidade sem ghosting entre tomadas | Médio | P1 |
| Composição/encoding | Feathering e YUV/codec podem alterar bordas | Braços lossless e encode-only separados | Atribuir corretamente halo e perda externa | Baixo/médio | P0 |
| Métricas atuais | Proxies não calibrados perceptualmente | GT, métricas mascaradas, flow, revisão cega | Menos falso positivo de qualidade | Médio | P0 |
| DiffuEraser max | Custo, seed, máscara transformada, prior licenciado | Prior-only vs diffusion; resolução fixa | Identificar quando geração compensa | Alto | P2 |
| Engines novos | Licenças/pesos/VRAM não resolvidos | E2FGVI, VideoPainter, SEDiT | Capacidade em casos sem fundo observável | Alto | P2/P3 |
| GPU performance | Janelas não limitam todos os tensores | Residência CPU/GPU; PRs ProPainter | Mais contexto por orçamento | Médio/alto | P3 |
| Deploy baseline | Working tree ≠ imagem implantada | Digest, parâmetros efetivos e outputs | Comparações auditáveis | Baixo | P0 |
| Benchmark comercial | Permissão de uso não estabelecida | Acordo aplicável + dataset próprio | Comparação externa defensável | Dependente | Gate separado |

FAST/QUALITY/MAX futuros e roteamento por cena dependem da fronteira medida de
qualidade/custo. Não há dados nesta etapa para criar novos defaults ou score
único de confiança. Antes de um router, calibrar confiança de máscara, resíduo,
fundo e consistência temporal contra revisão humana, incluindo casos fora de domínio.
