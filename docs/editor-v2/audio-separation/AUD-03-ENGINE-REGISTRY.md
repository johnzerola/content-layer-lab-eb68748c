# AUD-03 — registry e adapters de separação

Data: 13/09/2026. Classificação: **B0_B2_RUNTIME_PASS / AUD-04_BENCHMARK_REQUIRED / MODEL_QUALITY_NOT_SELECTED**.

## Reuso e código novo

O sistema não está sendo criado do zero. Continuam valendo a API autenticada,
o job de duas trilhas, o armazenamento, o Demucs usado na Hostear, o documento
único do Editor V2, os comandos, a timeline, a extração WAV e o render manifest.

O código novo é uma camada substituível entre o job e os motores:

- `backend/app/audio_engines/registry.py`: valida receita, origem, hashes,
  licença, device, precisão e cache;
- `adapters.py`: traduz a mesma entrada em comando Demucs ou
  `python-audio-separator`, supervisiona timeout/cancelamento e valida artefatos;
- `audio_separator_runner.py`: importa o wrapper só no subprocesso, impede
  download durante a inferência e verifica o device realmente selecionado;
- scripts de preflight, execução e avaliação: produzem evidência sem alterar o
  endpoint de produção.

Isso permite trocar Demucs por MDX/RoFormer depois do benchmark sem reescrever a
timeline, a interface ou o protocolo público.

## Registry atual

| Receita | Estado | Motivo |
|---|---|---|
| B0 `htdemucs` CPU | `READY_FOR_RESEARCH` | pacote, configuração e peso oficial congelados e verificados |
| B1 `htdemucs_ft` CPU | `BLOCKED_REGISTRY_INCOMPLETE` | quatro pesos/config e licença ainda precisam ser congelados |
| B2 MelBand-RoFormer CUDA | `READY_FOR_RESEARCH` | checkpoint/config, origem e hashes congelados; dois smokes concluídos na RTX 2060 |
| B3 MDX Inst HQ5 CUDA | `BLOCKED_REGISTRY_INCOMPLETE` | nome confirmado; peso e termos ainda não congelados |

O wheel `audio-separator` 0.47.0 foi baixado da PyPI e conferido com SHA-256
`756f3b620d78e581a117c6b6d96fe4f0eafc3432ab2824cb11532b4868bfd9a8`.
Ele foi instalado apenas num runtime Python 3.11 isolado. O checkpoint B2 tem
SHA-256 `87201f4d31afb5bc79993230fc49446918425574db48c01c405e44f365c7559e`
e a configuração tem SHA-256
`b958b29c8f7195f0d86bee6759a33980db675c4ecaf2fcaa80fa125828e6cd38`.
O hash do checkpoint coincide com a origem atribuída ao autor. A alteração de
licença para MIT permite pesquisa sob o registry, mas uso comercial,
redistribuição e composição do conjunto de treinamento continuam em revisão.

## Preflight local

- GPU visível: NVIDIA GeForce RTX 2060, 6.144 MiB;
- driver: 610.47;
- Python principal: 3.13.5;
- PyTorch principal: 2.11.0 CPU, `cuda_available=false`;
- FFmpeg/ffprobe: 8.1.1;
- ambiente B0 isolado em `G:`: Demucs 4.1.0, sem CUDA;
- ambiente B2 isolado: Python 3.11.9, `audio-separator` 0.47.0,
  PyTorch 2.14.0+cu130 e CUDA disponível;
- B2 detectou RTX 2060, compute capability 7.5, driver 610.47;
- VPS e GPU paga: não usados.

O ambiente principal continua sem PyTorch CUDA. O B2 usa ambiente próprio e
não altera o backend de produção. O manifesto está em
`research/audio-separation/runtime-audio-separator-gpu.json`; o freeze completo
fica em `output/audio-separation/aud03-b2-runtime-freeze.txt`.

## Smoke B0

Entrada: `technical--15`, fixture matemática de dois segundos em que o sinal
marcado como música está 15 dB acima do sinal marcado como diálogo. Ela testa a
engenharia e não contém voz.

| Medida | Resultado |
|---|---:|
| execução do subprocesso | 56,473 s |
| saída | dois WAV PCM float32 |
| geometria | 44.100 Hz, estéreo, 88.200 samples, 2,000 s |
| SI-SDR do papel diálogo | -60,779 dB |
| SI-SDR do papel música | 15,983 dB |
| erro relativo da soma contra entrada | 0,004339 |

A primeira chamada foi recusada pelo CLI antes da inferência porque o adapter
serializou `segment=7` como `7.0`. O contrato agora exige `7`, há teste de
regressão e a segunda chamada concluiu. A classificação ruim do seno como
“diálogo” é esperada e impede transformar esse smoke em aprovação neural.

Um segundo smoke usou o único MP4 de pesquisa já versionado no repositório. O
AAC foi extraído para WAV e o B0 quente processou 5,016 s em 17,797 s
(`RTF=3,548`). Original, diálogo e música têm os mesmos 221.184 samples; a soma
dos stems apresentou erro relativo 0,01719 contra a entrada. Como não existem
stems limpos desse vídeo, a classificação é `REAL_SMOKE_NO_GROUND_TRUTH` e a
qualidade fica `PENDING_HUMAN_LISTENING`. Os WAVs estão em
`output/audio-separation/aud03-b0-real-smoke/` para revisão local.

## Smokes B2

O primeiro lançamento válido do B2 revelou três falhas de integração antes do
resultado final: o subprocesso externo não recebia o `PYTHONPATH` do backend; o
wrapper tentava buscar `download_checks.json`; e o resolvedor não reconhecia os
nomes canônicos `dialogue.wav`/`music.wav`. Os três caminhos foram corrigidos e
cobertos por testes. O runner agora cria um catálogo mínimo somente com o
checkpoint/config aprovados no registry e mantém a rede bloqueada durante a
inferência.

| Medida | Sintético técnico | Recorte real sem GT |
|---|---:|---:|
| duração da entrada | 2,000 s | 5,016 s |
| processamento | 10,188 s | 11,453 s |
| RTF | 5,094 | 2,284 |
| dispositivo | RTX 2060 / CUDA | RTX 2060 / CUDA |
| pico CUDA alocado | não registrado na primeira execução | 1.754,55 MiB |
| erro relativo da soma | 2,56e-8 | 4,30e-9 |
| classificação | `TECHNICAL_SMOKE_ONLY` | `REAL_SMOKE_NO_GROUND_TRUTH` |

A fixture sintética usa senos, não fala humana. O B2 enviou quase toda a energia
matemática à música, o que reforça que ela serve apenas para contrato. No recorte
real, taxa, dois canais, 221.184 samples e duração foram preservados. A soma
quase exata dos stems comprova integridade do modelo complementar, mas não prova
que a música saiu da conversa. A qualidade permanece
`PENDING_HUMAN_LISTENING`.

## Próximo gate

1. Registrar a escuta sincronizada do recorte B0×B2 já produzido.
2. Adicionar pelo menos três fixtures curtas com fala e música autorizadas,
   incluindo conversa e música alta e, quando possível, stems limpos.
3. Executar B0 e B2 nessas fixtures e congelar qualidade, RTF e VRAM.
4. Comparar o mesmo conjunto sem ensemble e sem pós-filtro.
5. Integrar ao job V2 somente após um modelo vencer os gates de fala, vazamento,
   tempo, memória e escuta humana.

Testes executados nesta etapa: 22 testes do endpoint + adapters e 31 testes dos
scripts de áudio passaram. O conjunto inclui a avaliação de real sem GT. Nenhum arquivo funcional do endpoint
`backend/app/audio_separation.py` foi alterado.
