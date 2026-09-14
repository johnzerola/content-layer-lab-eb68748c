# AUD-04 — controle com fala humana licenciada

Data: 14/09/2026. Estado: **B2_LEADS_CONTROLLED_HUMAN_READ_SPEECH / MODEL_NOT_SELECTED**.

## Contrato e proveniência

O controle usa duas gravações humanas do `test-clean` do LibriSpeech, locutores
61 e 121, combinadas em três turnos com acompanhamento gerado. O corpus é
licenciado em CC BY 4.0. O pacote oficial `test-clean.tar.gz` foi baixado do
OpenSLR e seu MD5 `32fa31d27d2e1cad72775fee3f4849a9` coincidiu com o checksum
oficial.

Trechos selecionados:

- `61-70968-0004`: “ALSO THERE WAS A STRIPLING PAGE WHO TURNED INTO A MAID”;
- `121-121726-0004`: “HEAVEN A GOOD PLACE TO BE RAISED TO”.

Os FLACs foram convertidos para WAV mono float32 a 44,1 kHz antes da montagem.
Os hashes dos WAVs fonte, da mistura, do diálogo e da música estão no manifest.
Licença e README do corpus foram copiados ao lado da fixture. A fala é humana,
mas lida de audiobook; não é conversa espontânea.

## Matriz de qualidade

Cada mistura tem 11,155 s. O diálogo e a música de referência existem
separadamente, permitindo medir os dois stems.

| Diálogo/música | Motor | SI-SDR Diálogo | SI-SDR Música | Erro relativo Diálogo | Erro relativo Música |
|---:|---|---:|---:|---:|---:|
| -15 dB | B0 `htdemucs` CPU | 6,272 dB | 23,325 dB | 0,4369 | 0,0680 |
| -15 dB | **B2 MelBand-RoFormer CUDA** | **14,442 dB** | **30,511 dB** | **0,1871** | **0,0299** |
| 0 dB | B0 `htdemucs` CPU | 11,989 dB | 13,382 dB | 0,2440 | 0,2095 |
| 0 dB | **B2 MelBand-RoFormer CUDA** | **18,639 dB** | **19,600 dB** | **0,1162** | **0,1043** |
| +10 dB | B0 `htdemucs` CPU | 15,615 dB | 6,725 dB | 0,1636 | 0,4238 |
| +10 dB | **B2 MelBand-RoFormer CUDA** | **19,701 dB** | **10,531 dB** | **0,1030** | **0,2923** |

B2 venceu as seis comparações. Os ganhos sobre B0 foram 8,170/6,650/4,086 dB
no diálogo e 7,186/6,218/3,806 dB na música, nas razões -15/0/+10 dB. O ganho
foi maior quando a música dominava, que é o caso prioritário do produto.

| Diálogo/música | B0 CPU | B2 CUDA | aceleração B2 |
|---:|---:|---:|---:|
| -15 dB | 20,800 s | 10,125 s | 2,054× |
| 0 dB | 19,743 s | 17,234 s | 1,146× |
| +10 dB | 22,514 s | 9,656 s | 2,332× |
| mediana | 20,800 s | 10,125 s | 2,054× |

O pico CUDA alocado do B2 foi 2.240,60 MiB. Os tempos são o campo interno do
runner e não incluem toda a inicialização do processo Python; AUD-08 deverá
medir tempo de parede, processo residente, aquecimento e repetição.

## Decisão

**B2_LEADS_ALL_CONTROLLED_HUMAN_READ_SPEECH_QUALITY_SCENARIOS.** B2 permanece
como primeiro candidato. A evidência agora inclui fala humana licenciada, mas
continua insuficiente para selecionar produção porque faltam:

- escuta humana registrada contra o diálogo limpo;
- conversa espontânea, sobreposição de pessoas e reverberação;
- música real instrumental e com canto, com licença e stems;
- compressão típica de vídeo social;
- repetição para distribuição de latência.

Não abrir ensemble com base neste resultado. Um novo motor só entra quando um
caso aprovado revelar uma falha específica do B2.

## Evidências

- manifest: `output/audio-separation/aud04-human-librispeech/fixtures/fixture-manifest.json`;
- matriz: `output/audio-separation/aud04-human-librispeech/comparison.json`;
- seis execuções e métricas: `output/audio-separation/aud04-human-librispeech/b0-*/` e `b2-*/`;
- licença: `output/audio-separation/aud04-human-librispeech/LICENSE-LIBRISPEECH.txt`;
- comparador: `output/audio-separation/aud04-human-listening-review.html`;
- captura QA: `output/audio-separation/aud04-human-listening-review.png`.

O QA abriu os sete monitores, alternou todos os arquivos, reproduziu, fez seek e
terminou sem erro de console ou recurso ausente.
