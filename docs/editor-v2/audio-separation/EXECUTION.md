# Execução por pacotes — handoff para Sol medium/high

Estado inicial de todos os pacotes: **TODO**. Esta entrega preparou o plano; não executou AUD-00. Entradas: [README](README.md), [CONTRACTS](CONTRACTS.md), [BENCHMARK](BENCHMARK.md).

A recomendação de modelo/esforço abaixo é operacional, não benchmark de custo dos modelos. Não muda configuração do Codex nem inicia agentes. Usar Sol medium para componentes com contrato fechado; high para áudio/tempo, concorrência, exportação e interpretação experimental. Subir para revisão arquitetural somente quando houver conflito concreto que os testes não resolvam.

## Regras comuns a cada sessão

1. Ler `AGENTS.md`, este pacote e o último checkpoint. Conferir `git status --short` e diff dos arquivos que serão editados. Há trabalho não relacionado na árvore; preservar tudo.
2. Revalidar símbolos/arquivos citados: a árvore pode ter evoluído após 13/09/2026. Localizar com `rg`, ler intervalos necessários. Não carregar todo o Cleaner para trabalhar em áudio.
3. Registrar pacote, dependências aprovadas, contrato, arquivos sob responsabilidade, riscos e testes antes da alteração. Aplicar as skills de áudio/estado/design relevantes, sem ativar toda a coleção.
4. Implementar um incremento revisável. Não aumentar escopo para IA visual, redesign global ou infraestrutura de tokens.
5. Rodar testes do contrato e verificar UI quando houver mudança de UI. Mocks não aprovam inferência; screenshot não aprova som.
6. Atualizar checkpoint com comandos/resultados/artefatos, limitações e próximo passo. `DONE` exige gate, não apenas código escrito.
7. Não publicar, instalar no servidor, lançar GPU paga ou mudar modelo padrão como consequência automática de concluir testes locais. Preparar artefatos reviewáveis; liberação é AUD-09.

Os caminhos marcados **novo** são sugestões de organização a criar no pacote responsável. Primeiro procurar equivalente existente. Não criar duas implementações do mesmo serviço para preservar estes nomes.

## AUD-00 — verdade de avaliação e baseline

**Sol high** para congelar contrato; medium para gerar fixtures/instrumentação delimitada. Sem dependência além deste plano.

Responsabilidade: `scripts/benchmark_audio_separation.py`, `scripts/validate_audio_stems.py`, `backend/tests/test_audio_separation.py`; diretório **novo** `research/audio-separation/` para manifests e relatórios pequenos, com WAV grandes fora de git.

Tarefas:

- Congelar `git` revision + diff/hash dos arquivos locais relevantes. Registrar versões do Python, FFmpeg e Demucs quando disponíveis, sem instalar no ambiente ativo automaticamente.
- Auditar artefatos A–D e phase5 existentes; identificar se contêm inferência real, fixture sintética ou teste de mix. Preservar evidências históricas e esclarecer classificação.
- Criar manifest de fixtures com licenças/hashes/GT/split/ganhos/PTS e exclusões. Produzir misturas difíceis antes do modelo; manter originais imutáveis.
- Fazer o harness aceitar manifest, device explícito, modelos allowlisted, timeout/cancelamento, diretórios por run, logging e falha por braço. O script atual retornar sucesso quando um único modelo passa não pode aprovar o ensaio inteiro.
- Adicionar controles-oráculo e negativos de BENCHMARK. Corrigir/renomear o uso enganoso de `--check-muted`: só declarar mix testado quando PCM foi efetivamente renderizado e comparado.
- Executar controle B0 em amostra curta se runtime/fixtures autorizadas estiverem disponíveis; registrar `NOT_RUN` e causa caso contrário, sem inventar baseline.

Entrega: `fixture-manifest.json`, `baseline.json`, `BASELINE.md`, tests do harness. Gate: controle válido e controles ruins recusados; relação de volumes verificável na entrada. Ausência de fonte licenciada bloqueia benchmark perceptual, mas não os testes de engenharia.

Próximo: AUD-01; AUD-03 só começa comparação com manifest/gates congelados.

## AUD-01 — contrato de propriedade do som e tempo

**Sol high**. Depende de AUD-00 no nível de contratos/fixtures técnicas.

Responsabilidade: `src/lib/editor-v2/types.ts`, `project.ts`, `commands.ts`, `audio.ts`, `render-manifest.ts`, `src/lib/__tests__/editor-v2-project.test.ts`. **Novos**, se necessários: `audio-source.ts`, `audio-commands.ts`, `editor-v2-audio-source.test.ts`.

Tarefas:

- Implementar descritor de stream, grupo de áudio e representação ativa de CONTRACTS.
- Evoluir normalização/migração de documento V2 com defaults compatíveis; projeto antigo sem grupo mantém semântica anterior, sem silenciar mídia inesperadamente.
- Criar comandos de extração/aplicação/restauração com snapshot ou mecanismo existente; sem rede dentro de execute/undo/redo.
- Corrigir criação de asset de stem e mapear `dialogue` para role legado `voice` sem reaproveitar metadados de vídeo.
- Resolver som embutido + extraído + stems uma única vez por grupo; usar intervalos semiabertos.
- Serializar informação suficiente das faixas/grupos/enabled. Não duplicar decisões de som no React e no render.

Testes: source 10–22 s em project 30–36 s a 2×; PTS de áudio deslocado; trim; grupo duplicado; undo/redo; JSON roundtrip; original nunca somado aos stems; solo global; faixa locked impede mutação parcial.

Gate: todos os cenários passam com fixtures conhecidas. Ainda não significa que UI, save durável ou exportador foram conectados.

## AUD-02 — extrair áudio e torná-lo editável

**Sol medium** com contrato AUD-01; high se houver bug de codec/timing. Depende de AUD-01.

Responsabilidade: `src/components/editor-v2/InspectorV2.tsx`, `EditorV2Foundation.tsx`, `TimelineV2.tsx`, `src/lib/editor-v2/local-media.ts`, `src/lib/editor/media-store.ts`. **Novos**, se necessários: `AudioInspectorV2.tsx`, `audio-extraction.ts`, `editor-v2-audio-extraction.test.ts`.

Tarefas:

- Mostrar Áudio quando vídeo estiver selecionado, com volume/mute, Extrair áudio e Separar diálogo/música. Menu de contexto delega aos mesmos handlers.
- Extrair áudio completo uma vez; inserir clipe apenas no intervalo/velocidade do vídeo e preservar volume percebido. Para formatos suportados e mídia curta, reaproveitar decoder com teste de taxa real. Para formatos não suportados, estado recuperável; extração backend é adaptador posterior com contrato próprio.
- Separar utilitário de extração de `separateStems`, que hoje exige ticket antes da extração. Extrair não deve depender de disponibilidade do modelo.
- Guardar asset local durável pelo mecanismo existente quando adequado e testar relink/reload. Criar waveform a partir do PCM já decodificado, com cache limitado e cancelamento; evitar segunda decodificação inteira.
- Selecionar/revelar nova faixa, manter vínculo editável e feedback claro. Extrair novamente reutiliza asset/grupo sem áudio duplicado.
- Documentar limite de memória inicial. Arquivo longo não entra no decoder integral sem limite; informar capacidade enquanto AUD-08 não existir.

Testes: vídeo AAC com fala, WAV 48 kHz, mono/estéreo, sem áudio, formato inválido, cancelamento, arquivo perdido, extração repetida, reproduzir e salvar/reabrir. Verificar áudio embutido antes e extraído depois no mesmo nível/tempo. Não aceitar só waveform visível.

Gate: usuário consegue extrair, ouvir, silenciar e restaurar sem duplicação. UI é utilizável por teclado e viewport estreito. Registrar screenshots e áudio de verificação.

## AUD-03 — adapters e registro de modelos

**Sol high**. Depende de AUD-00. Pode acontecer antes de AUD-02, sem mudar a produção.

Estado em 13/09/2026: **B0_B2_RUNTIME_PASS / B1_B3_BLOCKED_REGISTRY_INCOMPLETE / AUD-04_STARTED**. Registry, adapters, preflight, runner e avaliação existem. Demucs B0 executou em CPU; MelBand-RoFormer B2 executou em CUDA no RTX 2060 a partir de checkpoint/config verificados e catálogo local congelado. Ambos passaram o smoke técnico e o mesmo recorte real sem GT. Qualidade humana não foi aprovada.

Responsabilidade: **novos** `backend/app/audio_engines/`, `backend/requirements-audio-research.txt`, `backend/tests/test_audio_engine_contract.py`, registry e manifests em `research/audio-separation/`. Serviço atual mantém seu adapter default.

Tarefas:

- Registrar checkpoints exatos e licenças conforme BENCHMARK. Primeiro os quatro braços B0–B3; B4 só com licença/runtime elegíveis. Sem nome/hash verificado, não seguir para inferência desse candidato.
- Criar ambiente Python/container isolado com dependências fixadas; não atualizar Torch/FFmpeg do Cleaner. Auditar pacote/conteúdo antes de incorporar.
- Interface mínima: capabilities, prepare/load, separate(input, interval, cancel, report), validate, release. Preferir processo filho cancelável inicialmente; residência de modelo é otimização medida posterior.
- Adapter Demucs preserva receita baseline. Adapter `python-audio-separator` traduz nomes nativos para semântica interna e persiste stems brutos/config/tempo.
- Fixar device e precisão; falha não troca silenciosamente CPU/GPU/modelo. Verificar saída sem normalização separada indevida e contagem exata após padding/latência.
- Criar smoke para silêncio/fala/música de poucos segundos, verificando PCM finito, arquivos e cancelamento. Checkpoint real só em smoke marcado, separado de unit tests.

Gate: B0 equivalente ao caminho de referência; cada candidato elegível produz stems corretos tecnicamente e relatório reproduzível. Runtime pronto não elege qualidade.

## AUD-04 — escolher o modelo com evidência

**Sol high**. Depende de AUD-03.

Responsabilidade: harness/fixtures/relatórios; sem alterar front ou modelo de produção.

Tarefas:

- Executar piloto sequencial, descartar falha de engenharia e então conjunto congelado. Medir qualidade, memória e tempo por receita.
- Arquivar stems brutos, tabela por cenário, falhas e escuta cega. Nunca usar holdout para retunar overlap/threshold.
- Separar avaliação instrumental de música com canto. Se vocals mantém canto, registrar limitação do braço em vez de “voz limpa”.
- Avaliar fonte de diálogo de todas as pessoas, sem preferência pelo mais alto. Mostrar passagens críticas ao usuário para escuta.
- Selecionar uma receita por qualidade elegível e custo; registrar `MODEL_SELECTED` somente após gates. Se nenhuma passa, `NO_ELIGIBLE_MODEL`, com diagnóstico e próximo experimento delimitado.
- Ensemble ou denoiser só abrem experimento novo por erro complementar observado; não anexar automaticamente à receita vencedora.

Gate: decisão revisável com WAVs, métricas e notas humanas. Modelo proposto para produção continua desligado até AUD-09.

## AUD-05 — job confiável, persistência e recuperação

**Sol high**. Depende de AUD-01 e AUD-03; desenvolvimento pode usar adapter fake explícito.

Responsabilidade: `backend/app/audio_separation.py`, `src/lib/audio.functions.ts`, `src/lib/editor/stem-service.ts`, testes respectivos. **Novos**, se necessários: cliente V2 de jobs, repositório de ownership e assets de áudio. Auditar storage/auth existentes antes de criar tabela ou serviço.

Tarefas:

- Integrar interface de engines preservando contrato legado; congelar receita no início do job em vez de reler ambiente no download.
- Adicionar metadados e estados negociados por versão. No modo sem fila, tratar 429 honestamente. Não chamar lock em memória de fila persistente.
- Persistir dono/projeto/intervalo/receita e resultRevision; validar ownership em consulta/renovação de tickets e download.
- Tornar start/apply idempotentes, separar erro de rede de erro de inferência, cancelar subprocesso e verificar liberação do slot/disco.
- Persistir ambos os resultados fora do TTL temporário; não salvar tokens ou URLs transitórias no projeto. Retry de transferência não repete modelo.
- Testar job terminal depois de desconectar/recarregar e impedir resultado tardio de alterar fonte modificada/excluída.

Testes: 401/403 ownership, 409 conflito, 413 tamanho, 422 formato, 429 ocupado, 507 disco, timeout, rede interrompida, TTL expirado, reinício, download parcial, double start e cancel durante validação. Produzir códigos de erro seguros; logs detalhados ficam privados.

Gate: nenhuma aplicação parcial/perda de original. Compatibilidade do editor antigo passa testes. Se não há armazenamento de projeto durável, completar esse caminho restrito de assets/documento antes de marcar recuperação como pronta.

## AUD-06 — duas trilhas e experiência de comparação

**Sol medium**, high ao resolver conflito com comandos/ripple. Depende de AUD-02/AUD-05; AUD-04 para uso de modelo aprovado.

Responsabilidade: componentes V2 do áudio/timeline/inspector; comandos AUD-01; testes de integração/QA de navegador. **Novo** `scripts/editor-v2-audio-separation-qa.mjs` se os scripts existentes não cobrirem o fluxo.

Tarefas:

- Atalho Separar no vídeo reutiliza extração/cache; no áudio usa diretamente o asset original.
- Painel de job com etapas/cancel; resultado disponível para comparar Original/Diálogo/Música no mesmo intervalo. Um monitor único evita dois players tocando juntos.
- Aplicar resultado cria ambas as trilhas na posição correta e desativa representação anterior por grupo. Respeitar mudanças compatíveis feitas durante o job.
- Implementar volume/dB, waveform, mute/solo, excluir, restaurar e vincular/desvincular. Não alterar grupos de outros vídeos.
- Split/trim/ripple/move/duplicate dos vinculados preservam tempos e envelopes. Exclusão de Música deixa apenas Diálogo; original não retorna sozinho.
- Feedback acessível e visual conforme CONTRACTS. Sem números de confiança inventados nem nomes de modelos como escolha obrigatória.

Testes: fluxo completo com serviço fake e stems reais conhecidos; depois smoke com candidato. Repetir com dois vídeos de fontes diferentes, fonte reutilizada duas vezes, clipe cortado/acelerado, delete durante job, undo/redo, zoom 200% e reduced motion.

Gate: fluxo observado em navegador e som verificado. Teste fake é aceitação do fluxo, não da separação.

## AUD-07 — ouvir, salvar e exportar o mesmo áudio

**Sol high**. Depende de AUD-06. É parte necessária do produto, não acabamento opcional.

Responsabilidade: `audio.ts`, `render-manifest.ts`, `EditorV2Foundation.tsx`, `EditorCanvasV2.tsx`, adapters de render existentes. **Novos**, se necessários: `audio-transport.ts`, `audio-render.ts`, tests de paridade e persistência.

Tarefas:

- Transporte contínuo com rate/pitch definidos, seek e gain acima de 1 real; corrigir pause/play por render e tratar autoplay/buffering.
- Persistir documento e assets; reabrir em sessão nova sem blob URLs anteriores. Não confundir rev local com salvo.
- Tornar manifest autossuficiente e conectar exportação real V2 ao render existente por adapter. Fazer preflight das capacidades de vídeo/efeitos; não liberar botão que ignora conteúdo não suportado.
- Misturar PCM por mesma regra de faixas/grupos/curvas usada na prévia; render offline deve ter teste independente, não só chamar função e comparar consigo mesma.
- Emitir vídeo de teste com áudio; decodificar a exportação e comparar com referência. PCM intermediário deve ser equivalente; AAC final tem tolerância de codec e atraso medidos, não igualdade bit a bit.

Fixtures: impulso/tons distintos por fonte para detectar original vazando; fala+musical GT; volume +6 dB; fades/envelope; solo/mute; corte em fronteira; velocidade 0.5×/1×/2×; PTS deslocado; lacunas; faixa bloqueada; seleção de representação e reload.

Gate: ao silenciar Música, PCM renderizado contém somente diálogo esperado; ao excluir Diálogo, só background; com ambos excluídos, silêncio do grupo. O arquivo de vídeo exportado realmente é reproduzível. Documentar limitações de pitch/formatos antes de ampliar suporte.

## AUD-08 — áudio longo e capacidade Hostear

**Sol high**. Depende de AUD-04/AUD-07.

Responsabilidade: extração/worker/job storage/cache; `backend/scripts/audio_preflight.py`, configuração de áudio isolada, tests de carga e cancelamento.

Tarefas:

- Preflight somente leitura da Hostear: capacidade efetiva, imagem, concorrentes, disco e cache. Não inventar RAM a partir de recomendações antigas.
- Extração longa em blocos no backend ou decoder incremental compatível. Não carregar 30 min de vídeo + três WAVs + waveform integral no browser.
- Chunking neural com contexto/overlap e composição consistente; preservar origem/sample offset. Validar transições com fala atravessando a junção. Não dividir em silêncio e truncar caudas.
- Fila durável com claim/lease e concorrência limitada; manter comunicação de estados legados compatível. Aplicar backpressure e limites de disco, não paralelismo 40/100 automático.
- Cache por fonte/receita, retenção e liberação de recursos após cancelamento. Medir modelo residente somente depois de provar estabilidade e custo de memória.
- Contratos progressivos 30 s, 3 min, 10 min e 30 min; aumentar só após gate anterior. Carga de 40/100 itens começa com jobs simulados para fila, seguida de conjunto real limitado e autorizado.

Gate: nenhuma perda/duplicação de job, RAM e disco limitados, retomada correta, ETA somente com dados suficientes. Limites de capacidade da UI sobem apenas com resultado real; enquanto isso, manter seleção de trecho explícita.

## AUD-09 — rollout e conclusão de produto

**Sol high** para decisão; medium para flag/documentação. Depende de AUD-08.

Responsabilidade: `src/lib/editor-v2/feature-flags.ts`, operação de áudio, documentação, E2E e checklist de release do projeto.

Tarefas:

- Revisar holdout e escuta humana; listar cenários aprovados/limitados. Não promover “sem música” quando música ainda é audível no alvo anunciado.
- Flag específica de separação V2, teste interno e habilitação gradual por projeto; editor antigo preservado durante a validação.
- Métricas operacionais: sucesso técnico/aplicação separados, tempo, erro por etapa, recuperação, revisão/rejeição do usuário. Sem gravar áudio privado em telemetria.
- Preparar revisão de código, mudanças de schema, imagens fixadas, compatibilidade e rollback; publicar somente no fluxo autorizado de release.
- Confirmar recuperação do original e exportação de projetos com stems quando novos jobs estiverem desligados.

Gate: qualidade/UX/persistência/export/capacidade/licenças aprovados. Se houver pendência humana ou holdout, status é `RELEASE_PENDING`, não completo.

## Comandos de validação disponíveis hoje

Os comandos abaixo são pontos de partida existentes; não foram executados nesta entrega documental. Executar após mudanças relevantes e registrar resultados atuais. Não alegar testes de modelo a partir destes testes de contrato.

Na raiz do repositório:

```powershell
git status --short
npm run test -- src/lib/__tests__/editor-v2-project.test.ts src/lib/__tests__/audio-mix.test.ts src/lib/__tests__/stem-service.test.ts src/lib/__tests__/stems-cleanup.test.ts
npx tsc --noEmit
npm run build
```

No diretório `backend`, com o ambiente Python de testes configurado:

```powershell
python -m pytest tests/test_audio_separation.py -q
```

Após criar testes novos, incluí-los explicitamente na validação do pacote. Usar ESLint nos arquivos tocados e checks exigidos pelo repositório; falhas preexistentes devem ser registradas com evidência, não corrigidas por alterações alheias ao escopo. Não usar `npm run format` no repositório inteiro para formatar dois arquivos.

O script `scripts/benchmark_audio_separation.py` existe, mas seu CLI atual não atende ao manifesto proposto. **Não executar um comando futuro de benchmark como se ele já existisse.** AUD-00 deve implementar/documentar `--help`, gerar contrato validado e somente então executar com modelos explicitamente indicados. Não rodar o default que inicia três modelos por acidente.

## Prompt pronto para a próxima sessão

```text
Implemente somente AUD-00 do pacote docs/editor-v2/audio-separation/.
Leia README.md, BENCHMARK.md e a seção AUD-00 de EXECUTION.md.
Primeiro confira o diff atual e preserve todo o trabalho não relacionado.
Reaproveite scripts/benchmark_audio_separation.py e valide os limites reais
de scripts/validate_audio_stems.py. Crie fixtures/manifest e controles do harness.
Não altere Cleaner, UI de produção, modelo padrão, deploy ou recursos pagos.
Não chame teste de RMS/mute de benchmark de separação neural.
Registre evidência real; se faltarem áudios autorizados/runtime, deixe isso explícito
e conclua os testes de engenharia independentes. Não invente scores.
Entregue diff, comandos/resultados, artefatos e MILESTONE_CONTEXT.md.
Pare no gate de AUD-00; indique o próximo pacote e suas dependências.
```

Para pacotes seguintes, trocar ID e incluir somente a seção correspondente + CONTRACTS/BENCHMARK relevantes. Não repetir todo o histórico da conversa. A instrução de parar no gate limita escopo da sessão de implementação; não autoriza marcar concluída uma dependência ausente.

## Checkpoint obrigatório por pacote

Criar `MILESTONE_CONTEXT.md` neste diretório ao iniciar a implementação, com:

```text
GOAL / PACKAGE_ID / STATUS
SOURCE_REVISION_AND_LOCAL_DIFF
DEPENDENCIES_PASSED / DEPENDENCIES_PENDING
DECISIONS / CURRENT_ARCHITECTURE
FILES_CHANGED
TEST_COMMANDS_AND_RESULTS
MODEL_AND_FIXTURE_MANIFESTS
ARTIFACT_PATHS
KNOWN_FAILURES / HUMAN_REVIEW_STATUS
CONSTRAINTS / ROLLBACK
NEXT_SINGLE_STEP
```

Statuses: TODO, IN_PROGRESS, TESTED, ACCEPTED, BLOCKED, REJECTED. TESTED é diferente de ACCEPTED quando falta escuta/holdout. Registrar retry/escalada com causa; falha de download ou quota não é evidência de que precisa de modelo de raciocínio mais forte.

## Rollback preparado desde o início

- Isolar dependências neurais em imagem/ambiente próprio; manter lock/digest anterior. Reverter configuração do adapter sem remover leitura de assets existentes.
- Flags controlam iniciar novos jobs; não apagar stems salvos ao desativar feature.
- Migração de documento versionada, leitura retrocompatível e backup; nunca substituir projeto original pelo migrado sem recuperação.
- Mudanças no endpoint mantêm cliente legado durante transição. Rollback de schema precisa respeitar jobs em andamento.
- Não usar `git reset --hard`, force push ou staging global para juntar esta entrega a outros trabalhos. Commits publicados da Lovable têm histórico preservado.
- Se nenhum candidato passar, manter original recuperável e serviço legado identificado, documentar limitações e voltar ao próximo experimento delimitado. Não esconder fracasso com ensemble ou renomear modo para “profissional”.
