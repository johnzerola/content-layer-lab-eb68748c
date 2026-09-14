# Continuidade — AUD-00 / AUD-01

STATUS: **AUD-00_TECHNICAL_HARNESS_READY / AUD-01_BROWSER_SMOKE_PASS / AUD-02_PERSISTENCE_RELINK_BROWSER_PASS / AUD-03_B0_B2_RUNTIME_PASS / AUD-04_B2_LEADS_CONTROLLED_TTS_AND_HUMAN_READ_SPEECH / AUD-05_REMOTE_WORKER_SMOKE_PASS_MIGRATION_READY_NOT_DEPLOYED / AUD-06_CLIENT_FLOW_IMPLEMENTED_BROWSER_REGRESSION_PASS / AUD-07_BROWSER_MP4_EXPORT_PASS**.
Não promover qualidade neural nem liberação do produto.

AUD-03 adicionou um registro imutável e fail-closed em
`research/audio-separation/model-registry.json`, adapters de subprocesso em
`backend/app/audio_engines/` e scripts de preflight, execução e avaliação. O
wrapper nunca é importado pelo endpoint atual e nenhuma seleção experimental
entrou em produção. O runner recusa pesos sem HTTPS, SHA-256 e licença de
pesquisa aprovada; também recusa troca silenciosa de device, saída incompleta,
timeout e cancelamento.

O baseline B0 foi congelado com Demucs 4.1.0, `htdemucs.yaml` e o peso oficial
`955717e8-8726e21a.th`. O preflight verificou os hashes e o smoke CPU processou
`technical--15`: 88.200 samples, dois canais, 44.100 Hz, dois segundos, saída
PCM float32. Tempo do subprocesso: 56,473 s. A primeira tentativa não iniciou
inferência porque o adapter enviou `--segment 7.0`; o Demucs exige inteiro. A
serialização foi corrigida, coberta por teste e a repetição passou.

As métricas dos tons foram SI-SDR -60,779 dB para o papel sintético de diálogo,
15,983 dB para música e erro relativo de reconstrução 0,004339. Essa falha de
classificação não é julgamento de voz: o sinal é um seno matemático e o Demucs
foi treinado para voz/música. Resultado: `TECHNICAL_SMOKE_ONLY`; qualidade
humana e seleção de modelo continuam pendentes. Evidências locais:
`output/audio-separation/aud03-b0-technical--15/` e
`output/audio-separation/aud03-b0-runtime-preflight.json`.

O único MP4 de pesquisa versionado também passou como smoke sem GT: 5,016 s
foram processados em 17,797 s com o modelo aquecido (`RTF=3,548`), mantendo taxa,
canais e 221.184 samples nas duas saídas. O erro relativo da soma foi 0,01719.
Sem referência limpa nem escuta registrada, a qualidade é
`PENDING_HUMAN_LISTENING`, não PASS.

O primeiro candidato RoFormer elegível também foi executado. B2 usa
`audio-separator` 0.47.0, `vocals_mel_band_roformer.ckpt` e sua configuração
congelada. Os dois arquivos passaram SHA-256; o checkpoint coincide com o hash
publicado na origem atribuída a Kimberley Jensen. O catálogo mínimo é criado a
partir do registry e o subprocesso bloqueia downloads durante a inferência.
O runtime Windows/Python 3.11 separado usa PyTorch 2.14.0+cu130 e detectou a RTX
2060. O smoke sintético processou 2,000 s em 10,188 s. No mesmo recorte real do
B0, B2 processou 5,016 s em 11,453 s (`RTF=2,284`), pico CUDA alocado de
1.754,55 MiB, taxa/canais/duração idênticos e erro relativo da soma de
4,30e-9. A soma exata mede consistência, não vazamento musical ou preservação
da conversa. Resultado: `B2_RUNTIME_PASS / PENDING_HUMAN_LISTENING`.

AUD-04 foi iniciada com o comparador sincronizado
`output/audio-separation/aud04-b0-b2-listening-review.html`. Ele permite alternar
Original, Diálogo e Música/ambiente dos dois motores preservando a posição e
exportar observações. Nenhum vencedor foi escolhido.

A matriz AUD-04 usa duas vozes TTS e acompanhamento gerado com diálogo -15, 0
e +10 dB em relação à música, sempre com ground truth conhecido. B2 venceu as
seis comparações de SI-SDR: os ganhos sobre B0 foram 7,960/8,236/9,098 dB no
Diálogo e 10,273/14,801/18,931 dB na Música. A mediana dos três processos foi
12,609 s no B2 e 28,523 s no B0; uma execução B2 levou 29,719 s e ficou
ligeiramente mais lenta, portanto throughput segue aberto. Pico CUDA:
2.240,60 MiB. Decisão: `B2_LEADS_ALL_CONTROLLED_TTS_QUALITY_SCENARIOS`. TTS não
seleciona modelo de produção; escuta e conversa humana espontânea continuam gates.

Um segundo controle usa dois locutores humanos do LibriSpeech `test-clean`, CC
BY 4.0, com o arquivo oficial verificado pelo MD5 publicado. B2 também venceu
as seis comparações desta matriz: ganhos de 8,170/6,650/4,086 dB no Diálogo e
7,186/6,218/3,806 dB na Música. Mediana: B2 10,125 s, B0 20,800 s. A fala é
humana lida e a música é gerada; conversa espontânea, sobreposição, reverberação,
compressão e música real continuam pendentes. Comparador:
`output/audio-separation/aud04-human-listening-review.html`.

AUD-05 iniciou pelo contrato independente do serviço. `audio-jobs.ts` persiste
somente projeto/grupo/origem/revisão/intervalo/receita/estado e chaves finais;
tokens e URLs transitórias ficam fora. A máquina de estados aceita fila,
cancelamento e confirmação terminal idempotente. Um resultado concluído é
recusado se a revisão, grupo, asset ou fingerprint de origem mudou. O backend
durável, ownership e retomada de download continuam pendentes.

AUD-06 integrou o fluxo cliente ao Inspector V2. A ação extrai o WAV fonte se
necessário, solicita o serviço autenticado existente e aplica Diálogo e Música e
ambiente em um único comando. Os stems preservam início/fim de projeto,
intervalo-fonte e playback rate do vídeo. A fonte original continua restaurável;
mute, solo, exclusão individual e manifest usam o mesmo documento. O cliente
recusa resultado tardio se grupo, revisão ou fingerprint mudarem e não executa o
pós-filtro histórico `suppressMusicBleed`. O job local congela a receita de
`/capabilities`, persiste estados observados sem tickets e grava engine/modelo nos
assets. Tipos, build, 57 testes e os smokes de
navegador passaram. O teste remoto autenticado não foi executado e o B2 não foi
promovido. Relatório: `AUD-06-EDITOR-INTEGRATION.md`.

AUD-07 começou pelo contrato serializado. O manifest agora inclui áudio do clipe
de vídeo e nomes dos clipes. `resolveAudioRenderFrameFromManifest` reconstrói o
documento mínimo depois de JSON e usa o mesmo resolvedor do preview. Os testes
confirmam igualdade exata para representação separada e embutida. Nenhum vídeo
final foi renderizado ou medido; botão Exportar permanece desabilitado. Relatório:
`AUD-07-PREVIEW-EXPORT-EQUIVALENCE.md`.

AUD-00 implementou gerador de misturas técnicas antes da inferência, métricas
básicas com silêncio indefinido explícito, check-muted exigindo PCM real, runner
por manifest/hash, modelo e device explícitos, validação de duas saídas e timeout
com encerramento do processo. O runner preserva mono/estéreo e 48 kHz, testa
antifase e calcula métricas com GT sem aprovar qualidade. Nenhuma engine ou
configuração de produção foi alterada.

AUD-01 implementou grupos de origem de áudio, representações embutida, extraída
e separada, comandos atômicos de registro, aplicação e restauração, undo/redo,
intervalo semiaberto, tempo-fonte com playback rate e serialização de grupos e
estado das faixas no manifest. Vídeos locais novos registram o áudio embutido na
mesma transação da importação. O canvas continua mudo e o monitor único reproduz
a representação resolvida, evitando soma do original com stems. O inspector
mostra a representação ativa e habilita somente as opções disponíveis.

AUD-02 implementou extração local independente da inferência. O caminho lê o
arquivo original da sessão, preserva a taxa decodificada, limita a 128 MiB e 180
segundos, mantém até dois canais, gera WAV PCM16 e waveform na mesma decodificação
e aplica asset, clipe e representação em um comando. Cancelar impede aplicação
tardia; a decodificação nativa em andamento não é interrompível pelo AudioContext.
Reextração substitui apenas o asset derivado anterior do grupo.

O documento V2 agora é salvo no `localStorage` sem URLs `blob:` e as mídias
ficam no IndexedDB já usado pelo editor. Reload recria URLs apenas em runtime,
restaura a waveform cacheada e informa assets ausentes sem apagar clipes. O
inspector oferece relink validado por tipo e tamanho; vídeo selecionado expõe
mute e volume do som embutido. Falha de quota mantém a sessão ativa e informa
que a mídia não ficou durável.

Smoke real: `scripts/editor-v2-audio-source-qa.mjs` criou/importou MP4 H.264 com
AAC mono 48 kHz, confirmou um monitor no áudio embutido, extraiu WAV, exibiu
waveform na faixa Voz, recarregou documento/mídias, removeu o WAV do IndexedDB,
confirmou o estado de arquivo ausente, religou o WAV e restaurou o embutido.
Todas as etapas mantiveram um monitor. Resultado `passed=true`, sem console
errors. Evidência visual em
`output/playwright/editor-v2-audio-source/audio-source-1440x1000.png`.

Evidência AUD-00: `research/audio-separation/BASELINE.md`, `baseline.json` e
`fixture-manifest.json`. WAVs e resultados de mute ficam em
`output/audio-separation/aud00-controls/` e não entram no Git.

Pendente AUD-00: cancelamento solicitado externamente e fontes licenciadas
humanas. B0 e B2 possuem pacote/peso/config/hashes e smokes técnicos. B1 e B3
continuam bloqueados por proveniência incompleta. Pendente após AUD-02:
exportador V2, armazenamento na conta/outro dispositivo, arquivos longos,
estéreo real e fallback backend para codecs recusados pelo navegador. A exclusividade está coberta no estado, resolvedor,
manifest e smoke de preview; ainda não é prova de arquivo exportado.

FEEDBACK_REAL_VMAKE_IA_2026_09_14: no clipe real `VMAKE.IA.mp4`, o usuário
aprovou a separação e preferiu `alternativa-demucs-suave.wav` à referência
MelBand suavizada por considerar o timbre mais humano. O efeito vocal/sonoro
"Brasil" no final permaneceu e sua remoção foi adiada pelo usuário. Esta é uma
preferência perceptual válida para este clipe, sem ground truth; ela não promove
Demucs como padrão nem apaga a vantagem objetiva do B2 nas fixtures controladas.
Evidências e receitas estão em
`output/audio-separation/vmake-ia-naturalness-20260914/`.

REVALIDATION_2026_09_14: 60 testes Vitest de projeto/jobs/persistência local e
10 testes Pytest do contrato dos motores passaram. Eles não executam o smoke
remoto autenticado, persistência durável no backend ou arquivo final exportado.

NEXT_PRODUCT_STEP: concluir a persistência/ownership do job e executar um smoke
autenticado curto do V2 antes da AUD-07. NEXT_RESEARCH_STEP: registrar escuta
B0×B2 em conversa espontânea com música real e stems autorizados. Não promover
B2 nem criar ensemble antes de medir erros complementares.

Modelos de desenvolvimento recomendados: Sol medium em implementação delimitada;
Sol high em métricas, tempo, concorrência e seleção neural; Terra medium para UI
com contrato pronto; Luna low para execução mecânica; Astra high somente para
conflito arquitetural persistente. Não há benchmark monetário desses modelos.
Consulta oficial: https://learn.chatgpt.com/docs/models.

## Atualização final de 14/09/2026

O smoke remoto autenticado passou com HMAC v2, Demucs `htdemucs` em CPU e duas
saídas válidas em 21,902 s para 4,928 s de entrada. O contrato durável, RLS,
transições e armazenamento privado dos dois stems estão implementados; a
migração ainda não foi aplicada ao Supabase remoto.

O botão de exportação V2 produziu no Chrome um MP4 H.264 360×640/15 fps com AAC
estéreo 48 kHz e áudio audível, sem erros de console. O render reconstrói o
manifest uma vez e usa os mesmos resolvedores de composição e mix da prévia.

Próximo passo de produto: aplicar a migração no Supabase conectado e executar um
smoke autenticado dentro da interface publicada. Depois, AUD-08 mede arquivos
longos, fila e operação em lote. Próximo passo de pesquisa: registrar escuta
B0×B2 em conversa espontânea com música real e stems autorizados.
