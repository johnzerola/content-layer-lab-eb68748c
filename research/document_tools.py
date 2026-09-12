"""Generate tool contracts from the actual callable registry."""
import inspect
from lab.core import ROOT
from server import TOOLS, DESCRIPTIONS

lines = ['# MCP tools', '',
         'Servidor `cleaner-research`, transporte stdio. Entrada validada pelo SDK a partir dos tipos Python.',
         'A CLI usa as mesmas funções: `server.py --call TOOL --args-file arquivo.json`.', '',
         'Erros de rede/validação são erros de ferramenta; ausência de fonte não vira resultado positivo.',
         'Caminhos de benchmark são relativos a `research/benchmarks`; source inspection usa a raiz do repo.', '',
         '## Contratos', '']
for name, fn in TOOLS.items():
    lines.extend([f'### `{name}`', '', f'`{inspect.signature(fn)}`', '', DESCRIPTIONS[name], ''])
lines.extend(['## Exemplos de argumentos', '', '```json',
              '{"path":"backend/app/workers/tasks.py","symbol":"run_pipeline"}',
              '{"query":"ProPainter","limit":10}',
              '{"manifest":"data/static/case.json","engine":"opencv-telea","radius":3}',
              '{"report_paths":["runs/ID_A/report.json","runs/ID_B/report.json"]}',
              '```', '', 'Use cada objeto com sua ferramenta correspondente. IDs vêm das respostas; não são exemplos executáveis literais.', '',
              '## Limites', '',
              '- GitHub API pública pode atingir rate limit; coleta e rodadas registram indisponibilidade.',
              '- arXiv e Hugging Face são os provedores implementados para papers/modelos. Outros catálogos exigem pesquisa da skill.',
              '- O índice comercial é curado; o nome da ferramenta não significa busca geral na web.',
              '- Análises de paper/repositório fornecem evidência para a skill; não são síntese semântica autônoma.',
              '- benchmark_engine executa somente controles CPU; import_result avalia resultados externos com proveniência.',
              '- Métricas de percepção ausentes, runtime GPU e permissões comerciais continuam explícitos.',
              '- Não há chamadas ao Cleaner em produção ou escrita fora dos registros do laboratório.', ''])
(ROOT / 'research/MCP_TOOLS.md').write_text('\n'.join(lines), encoding='utf-8')
print('MCP_TOOLS.md generated from registry')
