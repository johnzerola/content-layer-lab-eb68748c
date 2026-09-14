# AUD-04 — benchmark preliminar de diálogo e música

Data: 14/09/2026. Estado: **B2_LEADS_ALL_CONTROLLED_TTS_QUALITY_SCENARIOS / MODEL_NOT_SELECTED**.

## Pergunta testada

O separador preserva duas vozes na trilha Diálogo e reduz o acompanhamento
melhor que o baseline Demucs quando a música está acima, equilibrada ou abaixo
da fala?

Foi criada uma fixture controlada de 12,250 s com duas vozes TTS distintas em
três turnos e acompanhamento gerado. Diálogo e música existem separadamente,
portanto as duas saídas têm ground truth. A matriz mede três razões de energia:
-15 dB, 0 dB e +10 dB de diálogo em relação à música.

## Matriz de qualidade

| Diálogo/música | Motor | SI-SDR Diálogo | SI-SDR Música | Erro relativo Diálogo | Erro relativo Música |
|---:|---|---:|---:|---:|---:|
| -15 dB | B0 `htdemucs` CPU | 6,740 dB | 20,519 dB | 0,4182 | 0,0938 |
| -15 dB | **B2 MelBand-RoFormer CUDA** | **14,700 dB** | **30,792 dB** | **0,1870** | **0,0289** |
| 0 dB | B0 `htdemucs` CPU | 12,527 dB | 7,201 dB | 0,2302 | 0,4187 |
| 0 dB | **B2 MelBand-RoFormer CUDA** | **20,763 dB** | **22,002 dB** | **0,0912** | **0,0792** |
| +10 dB | B0 `htdemucs` CPU | 16,152 dB | -2,555 dB | 0,1539 | 1,1968 |
| +10 dB | **B2 MelBand-RoFormer CUDA** | **25,250 dB** | **16,376 dB** | **0,0547** | **0,1501** |

B2 venceu as seis comparações de SI-SDR. O ganho de B2 sobre B0 foi de
7,960/8,236/9,098 dB no diálogo e 10,273/14,801/18,931 dB na música, nas razões
-15/0/+10 dB respectivamente. A soma dos stems B2 teve erro relativo entre
`8,29e-9` e `2,59e-8`; isso comprova complementaridade das saídas, enquanto o
SI-SDR mede a separação contra o ground truth.

## Tempo e memória

| Diálogo/música | B0 CPU | B2 CUDA | aceleração B2 |
|---:|---:|---:|---:|
| -15 dB | 30,389 s | 12,609 s | 2,410× |
| 0 dB | 28,523 s | 29,719 s | 0,960× |
| +10 dB | 20,426 s | 11,250 s | 1,816× |
| mediana das três execuções | 28,523 s | 12,609 s | 2,262× |

O pico CUDA alocado reportado pelo B2 foi 2.240,60 MiB nos três casos. A
execução equilibrada do B2 foi mais lenta que B0 e destoa das outras duas; ela
permanece na matriz. Três processos curtos permitem comparar esta amostra, mas
não definem throughput, P50/P95 ou SLA. Um benchmark aquecido e repetido é gate
da AUD-08.

Classificação: **B2_LEADS_ALL_CONTROLLED_TTS_QUALITY_SCENARIOS**. O resultado
mantém B2 como candidato principal econômico. Ele ainda não seleciona o modelo
de produção: TTS e acompanhamento gerado não representam microfones, fala
natural, canto, reverberação real ou compressão de redes sociais.

## Evidências

- manifest e WAVs: `output/audio-separation/aud04-controlled-tts/fixtures/`;
- seis execuções: `output/audio-separation/aud04-controlled-tts/b0-*/` e `b2-*/`;
- matriz estruturada reproduzível: `output/audio-separation/aud04-controlled-tts/comparison.json`;
- agregador: `scripts/aggregate_audio_benchmark_matrix.py`;
- escuta sincronizada do trecho real e do caso mais difícil: `output/audio-separation/aud04-b0-b2-listening-review.html`.

O QA do comparador abriu os dez monitores, trocou fontes, fez seek e não recebeu
erros de console ou recursos ausentes.

## Próximo gate

1. Consultar o controle humano licenciado concluído em
   `AUD-04-HUMAN-SPEECH-BENCHMARK.md`.
2. Registrar escuta comparativa: palavras perdidas, música residual, canto
   residual, voz metálica e ambiente removido.
3. Acrescentar conversa espontânea/sobreposta, reverberação, compressão e música com canto.
4. Selecionar B2 somente se vencer os gates objetivos e a escuta. Abrir outro
   MDX/RoFormer apenas diante de uma falha específica e reproduzível; não criar
   média fixa entre modelos.
