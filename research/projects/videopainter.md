# VideoPainter

Ano: 2025. Repositório: https://github.com/TencentARC/VideoPainter.
Revisão consultada: `main (mutable; immutable SHA not collected: GitHub API rate limit)`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

Inpainting/edição de vídeo com controle de contexto em backbone de difusão.

O paper descreve encoder de contexto para vídeo mascarado e processamento de longa duração; a documentação distingue backbone e componentes de controle. Esta coleta acessou paper/README/LICENSE, mas não concluiu a inspeção do código de inferência por revisão imutável.

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

- [README](https://github.com/TencentARC/VideoPainter/blob/main/README.md) e [LICENSE](https://github.com/TencentARC/VideoPainter/blob/main/LICENSE); coleta sem revisão imutável.

## Estratégia temporal, máscaras e limitações

Não declarar equivalência com Cleaner ou uso comercial permitido. A licença do projeto restringe uso a pesquisa/educação e inclui termos de CogVideoX; a cadeia de permissões deve ser avaliada inteira.

## Pesos, requisitos e licença

Pesos/modelos: Encoder de contexto + backbone; IDs exatos pendentes.
Licença de código: Licença customizada não comercial; CogVideoX também possui termos próprios. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

Comparar apenas quando houver licença aplicável e recursos de laboratório; primeiro completar auditoria de inferência.

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

API GitHub limitada; fontes públicas consultadas manualmente. Inspeção por SHA e levantamento de issues/forks pendentes.
Paper: https://arxiv.org/abs/2503.05639.
