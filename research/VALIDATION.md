# Verificação e limites da primeira versão

## Evidências realizadas

- Oito skills criadas e reconhecidas no catálogo do ambiente; validador oficial
  `quick_validate.py` executado com sucesso nas oito.
- Servidor SDK stdio testado por cliente MCP independente: initialize, tools/list,
  tools/call, inspeção real de `run_pipeline`, trace e erro de caminho inválido.
- Dezenove ferramentas registradas, com contratos gerados do mesmo registry usado pelo servidor.
- Ambiente Python independente instalado; `pip check` sem conflitos. Lock completo
  em `requirements-lock.txt` reflete Windows/Python 3.13, não o runtime do worker.
- Três sequências sintéticas × dois controles CPU realmente executados;
  [relatórios resumidos](benchmarks/smoke-results.json) preservam tempos e métricas.
- Coleta real de metadados arXiv, Hugging Face e busca GitHub; segunda rodada
  respeitou cooldown. Rodadas ficam em `research-runs/`.
- Nove repositórios com revisão imutável e arquivos selecionados arquivados.
  VideoPainter/Cutie complementados por fontes públicas, com cobertura menor indicada.
- Baseline de 471 arquivos de código comparada por SHA-256, sem mudanças introduzidas
  pelo laboratório. [Verificação de artefatos](artifact-validation.json).

## Testes

`research/.venv/Scripts/python.exe -m pytest research/tests -q -p no:cacheprovider`

A suíte cobre inspeção sem importação do backend, caminhos confinados, registros
sem sobrescrita, bloqueio de destinos externos ao allowlist e de redirecionamento,
cache com hash, parsing de paper, métricas, truncamento, FPS incompatível, SSIM
com GT perfeito, protocolo MCP e extração FFmpeg de vídeo CFR/VFR.

Resultado final registrado nesta rodada: **13 testes passaram** (12,06 s).

Foi detectada e corrigida rejeição indevida de timestamps CFR quantizados em
Matroska: agora a tolerância considera o time base do contêiner e verifica drift
contra o grid temporal. Os frames não são reamostrados.

## O que ainda não foi comprovado

Não há reconexão confirmada do host Codex ao novo MCP nesta sessão; o servidor
foi testado pelo protocolo real em subprocesso. Reabrir a sessão pode ser necessário.

Não foram executados modelos GPU, provisionados endpoints, baixados pesos ou
medidos resultados do Cleaner implantado. A comparação aberta no IDE não foi
tratada como dataset nem alterada. O conjunto real de 100+ casos ainda não está
montado; os três controles sintéticos validam o harness.

Os catálogos são iniciais: treinamento/tabelas completos foram aprofundados
principalmente em ProPainter e DiffuEraser. A auditoria de todos os forks, issues,
datasets e pesos continua aberta. Coletas de alguns endpoints GitHub receberam
403 por rate limit; isso não foi ocultado como ausência de projetos ou evidência.

LPIPS, OCR residual, erro temporal com flow e diagnóstico visual automático são
extensões pendentes. O coletor contínuo faz rodadas finitas; nenhum scheduler foi
instalado. O MCP de análise entrega fontes estruturadas e requer interpretação da skill.

Vmake não foi submetida a teste black-box: os termos consultados restringem uso
para melhorar outro serviço de IA. O relatório comercial registra essa condição.
Nenhuma equivalência de qualidade com serviço comercial foi alegada.

## Critério de avanço

O laboratório pode ser usado para pesquisa, preservação de casos e controles
locais. Para mudar produção, completar baseline implantada, permissões dos pesos,
dataset real e experimento controlado com resultados reproduzíveis. O
`EVOLUTION_PLAN.md` ordena esses trabalhos sem converter hipóteses em aprovação.
