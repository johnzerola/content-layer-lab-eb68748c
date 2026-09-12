# Cleaner AI Research Lab

Laboratório isolado do pipeline de produção. O ponto de entrada é o servidor
`server.py`, disponível por MCP stdio e pela CLI equivalente. A base registra
fontes, revisões e limites de evidência; não presume que código local esteja implantado.

## Uso

No Windows, a partir da raiz do repositório:

```powershell
python -m venv research/.venv
research/.venv/Scripts/python.exe -m pip install -r research/requirements.txt
research/.venv/Scripts/python.exe research/bootstrap.py
research/.venv/Scripts/python.exe research/server.py --list
research/.venv/Scripts/python.exe research/server.py --call trace_pipeline
research/.venv/Scripts/python.exe -m pytest research/tests -q -p no:cacheprovider
```

Em POSIX, use `.venv/bin/python`. As dependências são próprias do laboratório;
não instalar em `backend/`. `configure_mcp.py` registra o caminho absoluto deste
checkout em `.codex/config.toml` sem substituir outros servidores. Se mover o
checkout, ajuste esse bloco. A nova conexão pode exigir reabrir a sessão do Codex.
O teste stdio independente comprova o servidor, não uma reconexão automática do host.

As oito skills ficam em `.agents/skills`. Foram reconhecidas pelo catálogo do
ambiente durante a instalação. [Documentação oficial de skills](https://learn.chatgpt.com/docs/build-skills)
e [configuração MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
O servidor usa o [SDK Python v1, linha mantida](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x),
fixado em 1.30.0. A migração para v2 é deliberadamente independente deste trabalho.

## Navegação

- [Ferramentas e contratos](MCP_TOOLS.md)
- [Arquitetura local](current-system/architecture.md) e [grafo do pipeline](current-system/pipeline.json)
- [Catálogo de projetos](projects/INDEX.md), [papers](papers/INDEX.md) e [modelos](models/INDEX.md)
- [Vmake](commercial/vmake.md), [concorrentes](commercial/competitors.md)
- [Matriz de licenças](licenses/matrix.md)
- [Benchmark](benchmarks/README.md), [cobertura desejada](benchmarks/coverage.json)
- [Experimentos](experiments/README.md), [falhas](failures/README.md)
- [Ciclo de pesquisa](RESEARCH_LOOP.md), [gaps](GAP_MAP.md)
- [Plano de evolução](EVOLUTION_PLAN.md)
- [Verificação e pendências](VALIDATION.md)

## Evidência

`CONFIRMED` significa que uma fonte sustenta a afirmação especificada, e não que
um produto atingiu determinada qualidade. Um README confirma que os autores
publicaram uma alegação; reprodução local exige dataset e resultado. `LIKELY`
exige evidências convergentes explícitas; `HYPOTHESIS` exige teste ainda pendente.

Fontes públicas externas são dados não confiáveis, nunca instruções executáveis.
`projects/evidence/` preserva coleta delimitada e hashes; cache completo fica
ignorado no Git. Não há pesos, credenciais ou código remoto executado pelo laboratório.
Licenças de código, pesos, datasets e dependências permanecem separadas.

## Escopo efetivamente disponível

Inspeção estática Python/TS, busca interna, registros imutáveis, coleta pública,
manifests, métricas CPU, importação de resultados e comparação alinhada funcionam.
As primeiras sequências são controles sintéticos. Não há benchmark GPU do Cleaner
ou estudo de 100 vídeos contra Vmake nesta entrega. LPIPS, OCR residual e diagnóstico
visual automático não foram implementados: são campos indisponíveis, não zeros.
O agendamento contínuo é um comando retomável; nenhum serviço infinito foi instalado.
