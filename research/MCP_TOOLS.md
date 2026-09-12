# MCP tools

Servidor `cleaner-research`, transporte stdio. Entrada validada pelo SDK a partir dos tipos Python.
A CLI usa as mesmas funções: `server.py --call TOOL --args-file arquivo.json`.

Erros de rede/validação são erros de ferramenta; ausência de fonte não vira resultado positivo.
Caminhos de benchmark são relativos a `research/benchmarks`; source inspection usa a raiz do repo.

## Contratos

### `inspect_project`

`(query: 'str' = '', limit: 'int' = 60) -> 'dict'`

Read allowlisted project sources; Python AST symbols/imports and textual references. No source execution. Deployment unverified.

### `inspect_component`

`(path: 'str', symbol: 'str' = '') -> 'dict'`

Inspect a source file and optional Python symbol with hashes, inputs, callees and configuration names. Runtime semantics require review.

### `trace_pipeline`

`(stage: 'str' = 'all') -> 'dict'`

Read the curated Cleaner pipeline graph and verify referenced files exist. Optional stage substring.

### `search_knowledge`

`(query: 'str', limit: 'int' = 20) -> 'dict'`

Search persistent internal research records before repeating external research.

### `record_research`

`(category: 'str', title: 'str', body: 'str', sources: 'list[str]', evidence: 'str' = 'HYPOTHESIS') -> 'dict'`

Create an immutable research record with sources and evidence level in research/category.

### `create_experiment`

`(problem: 'str', hypothesis: 'str', baseline: 'str', change: 'str', dataset: 'str', metrics: 'list[str]') -> 'dict'`

Create a designed, isolated experiment record; does not run or change production.

### `analyze_video_failure`

`(observations: 'str', artifacts: 'list[str]') -> 'dict'`

Generate prioritized investigation hypotheses from English symptom keywords; does not perform visual diagnosis.

### `search_github_projects`

`(query: 'str', limit: 'int' = 10) -> 'dict'`

Search public GitHub repositories through the GitHub API.

### `analyze_github_repository`

`(repository: 'str', paths: 'list[str] | None' = None) -> 'dict'`

Retrieve pinned source files, repository tree and sampled issues/PRs/forks/releases for skill analysis; not automatic semantic understanding.

### `search_papers`

`(query: 'str', limit: 'int' = 8) -> 'dict'`

Search arXiv metadata and abstracts; other proceedings are not covered by this provider.

### `analyze_paper`

`(arxiv_id: 'str') -> 'dict'`

Retrieve arXiv abstract and available HTML for structured skill review; does not invent unavailable paper findings.

### `search_models`

`(query: 'str', limit: 'int' = 10) -> 'dict'`

Search Hugging Face metadata; VRAM/speed/quality remain unmeasured.

### `search_commercial_research`

`(query: 'str') -> 'dict'`

Search the curated public commercial-source index; not general web search.

### `fetch_public_source`

`(url: 'str') -> 'dict'`

Retrieve a bounded HTTPS page from an allowlisted public research host. No redirects, credentials or code execution.

### `inspect_license`

`(repository: 'str') -> 'dict'`

Retrieve repository license evidence; separate weights, models, datasets and commercial permission require review.

### `build_license_dependency_graph`

`(project: 'str' = '') -> 'dict'`

Return the documented artifact/dependency license graph and unresolved commercial blockers; it does not grant permission.

### `detect_associated_effects`

`(video: 'str', overlay_mask: 'str', temporal_window: 'int' = 9) -> 'dict'`

Return the research-gated interface for primary, shadow, glow, reflection and transparency masks. No heuristic detector is claimed or executed yet.

### `benchmark_engine`

`(manifest: 'str', engine: 'str' = 'identity', radius: 'int' = 3) -> 'dict'`

Run CPU identity or OpenCV Telea controls on an aligned PNG case and persist measured metrics; never invokes production/GPU.

### `compare_results`

`(report_paths: 'list[str]') -> 'dict'`

Compare 2..10 reports after verifying identical inputs, masks, GT, FPS and frame counts; no automatic overall quality verdict.

### `import_result`

`(manifest: 'str', output_directory: 'str', engine: 'str', provenance: 'list[str]') -> 'dict'`

Evaluate aligned frames exported from an external engine with provenance; does not fabricate execution telemetry.

### `extract_comparison_frames`

`(video_path: 'str', max_frames: 'int' = 3000) -> 'dict'`

Extract all frames from a local CFR video under research/benchmarks, preserving timestamps and hashes. Reject VFR, truncation and excessive frame budgets. Requires FFmpeg/ffprobe.

## Exemplos de argumentos

```json
{"path":"backend/app/workers/tasks.py","symbol":"run_pipeline"}
{"query":"ProPainter","limit":10}
{"manifest":"data/static/case.json","engine":"opencv-telea","radius":3}
{"report_paths":["runs/ID_A/report.json","runs/ID_B/report.json"]}
```

Use cada objeto com sua ferramenta correspondente. IDs vêm das respostas; não são exemplos executáveis literais.

## Limites

- GitHub API pública pode atingir rate limit; coleta e rodadas registram indisponibilidade.
- arXiv e Hugging Face são os provedores implementados para papers/modelos. Outros catálogos exigem pesquisa da skill.
- O índice comercial é curado; o nome da ferramenta não significa busca geral na web.
- Análises de paper/repositório fornecem evidência para a skill; não são síntese semântica autônoma.
- benchmark_engine executa somente controles CPU; import_result avalia resultados externos com proveniência.
- Métricas de percepção ausentes, runtime GPU e permissões comerciais continuam explícitos.
- Não há chamadas ao Cleaner em produção ou escrita fora dos registros do laboratório.
