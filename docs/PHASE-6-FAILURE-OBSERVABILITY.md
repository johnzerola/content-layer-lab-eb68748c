# Fase 6 — diagnóstico de falha e observabilidade do worker

Data: 11/09/2026

Estado: **OBSERVABILIDADE IMPLEMENTADA E VALIDADA EM CPU; NENHUMA GPU PAGA INICIADA**

Classificação do smoke anterior: **REGRESSION_FIX_INCONCLUSIVE_EXECUTION_FAILED**

Este trabalho não muda engine, preset, política de qualidade, acabamento ou produção. A persistência é opt-in por `CLEANER_PERSIST_FAILURE_ARTIFACTS=1`; o valor padrão da imagem continua `0`.

## 1. Diagnóstico do job histórico

Job: `d8c19e40-24c3-42a1-967d-ad8e951a428a-u2`

Imagem: `docker.io/nivaldo12/leaneria-runpod@sha256:44639b431b939ec8638852f574048ae97895fa4fbc418b7381e1cf89086c409d`

O provedor registrou `COMPLETED`, 587,677 s de execução e 0,131 s de fila. O harness registrou que recebeu um objeto sem `ok=true`, mas descartou o conteúdo original ao sanitizar a falha; uma consulta posterior retornou `output=null`. O diretório temporário do job foi apagado pelo `finally`. Não existem traceback, stdout/stderr, arquivo upstream, master ou delivery dessa execução.

A exceção histórica exata não foi recuperada. As consultas de status/stream preservadas não contêm logs, e não há endpoint REST de logs por job disponível no harness usado. A página de logs do console pode reter logs do endpoint, mas nenhum texto do job foi arquivado nesta rodada.

O estágio mais provável é **11_subtitle_junctions**, com confiança moderada e sem prova conclusiva. A inferência anterior do mesmo clipe levou cerca de 374,88 s; esta execução terminou em 587,677 s, muito perto do limite de execução configurado de 600 s. No ensaio local controlado, `subtitle-junctions-v1` sozinho levou 424,96 s para os 150 frames. A soma desses tempos ultrapassa amplamente 600 s, embora CPU, ROI e carga do worker possam diferir. A evidência histórica ainda não permite excluir falha na restauração/composição ou falha tardia do próprio motor.

Nenhum output foi retornado porque o pipeline não chegou ao contrato final `output.mp4` ou falhou antes de o handler conseguir devolvê-lo. Em seguida, a limpeza removeu os intermediários. `COMPLETED` é o estado do job no provedor; não comprova sucesso funcional do payload.

## 2. Checkpoints implementados

O worker agora registra início, fim, duração e estado para:

1. `01_download`
2. `02_probe`
3. `03_scene_detection`
4. `04_mask_generation`
5. `05_subtitle_policy`
6. `06_roi_extraction`
7. `07_engine_input`
8. `08_diffueraser`
9. `09_engine_output`
10. `10_roi_restore`
11. `11_subtitle_junctions`
12. `12_selective_composition`
13. `13_encode`
14. `14_upload`

Em falha, o relatório contém `last_successful_stage`, `failed_stage`, tipo/mensagem da exceção, traceback completo, timestamps, duração total, commit, digest informado pelo ambiente, revisão, engine, perfil, GPU, VRAM total/pico observável, RAM pico, entrada, ROI, geometria enviada e retornada, FPS, frames e indicação de resize.

Arquivos principais:

- `backend/app/observability.py`: checkpoints e bundle persistente;
- `backend/runpod_handler.py`: download, probe, upload e captura antes da limpeza;
- `backend/app/workers/tasks.py`: estágios do pipeline e geometria;
- `backend/app/engines/diffueraser_official.py`: subprocesso e telemetria;
- `backend/app/services/subtitle_junctions.py`: relatório incremental e falha parcial;
- `backend/app/services/subtitle_policy.py`: auditoria explícita das duas máscaras.

## 3. Failure bundle

Com a flag habilitada, uma falha cria fora do diretório descartável do job:

- `failure-report.json`;
- `failure-traceback.txt`;
- ZIP do bundle;
- `state.json`;
- máscaras brutas e máscaras de inferência/composição;
- `subtitle-junctions.report.json`, `report.json` e frames diagnósticos disponíveis;
- relatório, stdout, stderr e log combinado do DiffuEraser;
- hashes e tamanhos dos vídeos intermediários/finais disponíveis.

Arquivos individuais acima de 4 MiB são registrados por caminho, tamanho e SHA-256 sem serem copiados para o ZIP. Isso evita que um vídeo grande elimine a possibilidade de devolver o bundle inline. O limite é ajustável por `CLEANER_FAILURE_ARTIFACT_MAX_BYTES`. O ZIP é devolvido em base64 até 8 MiB; acima disso o relatório informa que não foi incluído inline e preserva o caminho no volume.

O comando do subprocesso é salvo como lista e valores associados a token, senha, segredo ou autorização são redigidos.

## 4. DiffuEraser

O relatório `diffueraser.report.json` agora registra:

- comando, diretório de trabalho e PID;
- processo iniciado e exit code;
- timestamps e duração;
- stdout e stderr separados, mais log combinado;
- existência e tamanho do arquivo upstream;
- frames, resolução e FPS quando o upstream é legível;
- `model_loaded`, `inference_started` e `inference_finished`.

O upstream atual não fornece callbacks estruturados para separar carregamento de modelo e começo da inferência. Por isso esses dois campos permanecem `null` numa morte precoce e só são confirmados como `true` após saída bem-sucedida com vídeo válido. O relatório declara essa limitação, em vez de inferir progresso a partir do tempo.

Para o job histórico, não é possível afirmar se o DiffuEraser terminou. Também não é possível afirmar que `subtitle-junctions` iniciou; ambas as respostas permanecem **UNDETERMINED**.

## 5. Auditoria das duas máscaras

No frame 30 corrigido, inferência e composição têm 109.684 pixels porque a branch `preserve_partial` foi ativada em `prepare_subtitle_policy`:

- não havia quadro totalmente vazio;
- existia uma sequência de pelo menos três caixas curtas com área abaixo de 18% da banda temporal;
- a política passou a `dynamic_partial_references`;
- nessa branch, `inference = composite.copy()`.

O objetivo dessa branch é deixar visível ao motor o fundo parcial descoberto por palavras curtas. A igualdade é, portanto, comportamento deliberado do código e não prova de regressão. Ela reduz a diferença operacional entre as duas máscaras nesse caso e agora é registrada explicitamente.

O contrato obrigatório passou a ser verificável em todos os frames: `composition_mask` deve ser subconjunto de `inference_mask`. O relatório inclui `dual_mask_distinct`, `equal_frame_count`, `distinct_frame_count` e `reason`. Igualdade legítima é aceita; violação do subconjunto aborta.

## 6. Subtitle junctions

O relatório é escrito antes da validação e atualizado a cada frame. Se houver erro, ele permanece com `completed=false`, `failure`, frames já analisados, donors candidatos, aceitos/rejeitados, motivo, pixels aceitos/substituídos, confiança, gate e tempo observado. As máscaras usadas são incluídas no failure bundle.

Uma execução local interrompida durante a preparação deste diagnóstico demonstrou a utilidade do relatório incremental: o arquivo permaneceu legível com 42 frames analisados, embora o processo externo tivesse sido encerrado. Isso é evidência do mecanismo de persistência, não evidência do job histórico.

## 7. Testes locais

Os testes CPU cobrem:

- ordem e nomes dos 14 checkpoints;
- bundle e traceback sobrevivendo à limpeza do job;
- hash sem cópia de artefato grande;
- resposta do handler contendo o bundle;
- stdout/stderr, exit code e estado do subprocesso DiffuEraser simulado;
- relatório parcial de junções após exceção;
- subconjunto composição/inferência;
- igualdade legítima em `dynamic_partial_references` com motivo explícito.

Validação executada: **212 testes passaram e 1 foi ignorado**, sem falhas. `git diff --check` não encontrou erro de whitespace; os avisos exibidos referem-se apenas à conversão LF/CRLF do Git no Windows.

O ensaio Pedro pós-engine usa o mesmo clipe de 150 frames, regiões e máscaras corrigidas, um output RunPod histórico como substituto do upstream e nenhuma inferência neural. Resultado: **LOCAL_POST_ENGINE_PATH_PASS**. Foram observados 150/150 frames, ROI XYWH `[120,1284,834,626]`, 146 frames com donor, 4 fallbacks, zero pixels da máscara de texto detectada fora da composição, zero pixels da composição fora da inferência e zero alteração fora da máscara final. Junções levaram 424,96 s; o ensaio completo, 482,60 s. Os artefatos ficam em `G:/dowloand/teste/phase6-failure-observability-20260911/pedro-01/`.

## 8. Decisão para o próximo smoke

O sistema de código está pronto para produzir diagnóstico numa repetição, mas **o smoke pago ainda não deve ser iniciado automaticamente**. Antes dele, é necessário publicar uma nova imagem candidata com estas mudanças, fixar o digest, habilitar `CLEANER_PERSIST_FAILURE_ARTIFACTS=1` somente no endpoint de teste e aumentar o limite de execução para comportar DiffuEraser mais junções. O primeiro rerun deve manter um worker máximo, zero workers ativos e o mesmo contrato congelado.

Nenhuma dessas ações de nuvem foi executada nesta rodada.
