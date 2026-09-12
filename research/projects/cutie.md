# Cutie

Ano: 2024. Repositório: https://github.com/hkchengrex/Cutie.
Revisão consultada: `main (mutable; immutable SHA not collected: GitHub API rate limit)`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Video object segmentation com memória e identidade de objeto.

InferenceCore.step recebe imagem, máscara opcional e IDs, codifica features, lê memória e devolve probabilidades. mem_every controla inserção de memória; clear_memory permite reiniciar estado. O código não preenche o fundo: o demo pode combinar outro engine para inpainting.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [README](https://github.com/hkchengrex/Cutie/blob/main/README.md) e [LICENSE](https://github.com/hkchengrex/Cutie/blob/main/LICENSE); coleta sem revisão imutável.

## Estratégia temporal, máscaras e limitações

Texto que muda palavra/cor não é um objeto rígido. A estabilidade de identidade pode não preservar strokes; controlar drift e reinicialização por cena.

## Pesos, requisitos e licença

Pesos/modelos: cutie-base conforme release; conferir licença do checkpoint.
Licença de código: MIT no núcleo; RITM/demo/ProPainter e pesos separados. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Teste de propagação de máscara contra Farneback com anotações e detector fixos.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

API GitHub limitada; fontes públicas consultadas manualmente. Inspeção por SHA e levantamento de issues/forks pendentes.
Paper: https://arxiv.org/abs/2310.12982.
