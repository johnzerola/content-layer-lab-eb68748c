# Diálogo sobre música cantada — piloto de 15/09/2026

Estado: **INFERENCE_COMPLETE / LISTENING_PENDING / PRODUCTION_UNCHANGED**.

O usuário relatou que o acompanhamento sai, mas o cantor permanece na faixa
Diálogo. O Demucs atual separa vocals/no_vocals: fala e canto compartilham a
primeira saída. Corrigir sample rate não resolve essa limitação semântica.

## Candidato e proveniência

Bandit V2 multilingual separa speech/music/sfx. Essa semântica torna o modelo
um candidato; não garante que todo canto vá para music. A variante de quatro
fontes Facing the Music é mais específica, mas seus pesos do registro Zenodo
13327983 são CC-BY-NC-4.0 e não foram incorporados ao produto comercial.

| Item | Fonte e versão | Licença | Uso/atribuição |
|---|---|---|---|
| bandit-infer, OpenMIRLab; autores originais Karn Watcharasupat e colaboradores | https://github.com/openmirlab/bandit-infer, commit 7ec03cb568811958db65a96a10fdb8879922b2ac | Apache-2.0 | ALLOWED para piloto; checkout com LICENSE preservado. Integração exige créditos/NOTICE aplicáveis |
| checkpoint-multi.ckpt, Karn Watcharasupat e colaboradores | https://zenodo.org/records/12701995, v1 | CC-BY-SA-4.0, confirmado via API oficial | ALLOWED para piloto; manter atribuição e licença, sem redistribuição de pesos neste repositório. Registrar créditos visíveis antes de promoção |
| Facing the Music, mesmos autores | https://zenodo.org/records/13327983, v1 | CC-BY-NC-4.0, confirmado via API oficial | BLOCKED para produto comercial sem autorização específica; não baixado nem executado |

Peso V2 SHA-256: `abcfccf65446752a057f4a302c941479a54b7560ebf8d7bca039d2ea98e64cfc`.
Paper que distingue canto e fala: https://arxiv.org/abs/2408.03588.
Dados de treinamento: família Divide and Remaster multilíngue; termos por fonte
de treinamento não foram reavaliados neste piloto. Nenhum dataset novo baixado.

## Execução real

Origem autorizada pelo usuário: `G:/dowloand/spy/ELBSN_Edit_video_no_watermark.mp4`,
80,178005 s, nome correspondente à captura enviada. Recorte dos primeiros 16 s,
48 kHz estéreo PCM float32, extraído por FFmpeg. Sem GT limpo; SI-SDR e remoção
perceptual de canto não podem ser inferidos de energia ou reconstrução.

Pasta: `G:/dowloand/teste/audio-dialogue-singing-20260915`.
Runner: `backend/scripts/pilot_dialogue_bandit.py`.
Runtime usado: `C:/Users/DINO/AppData/Local/Temp/vaiviral-audio-separator-gpu/Scripts/python.exe`.
PyTorch 2.14.0+cu130, RTX 2060, FP32, janela 8 s/hop 1 s/batch 1 do wrapper.
Checkout upstream intacto e SHA dos pesos conferidos; carregamento offline.

- Candidato completou: 66,750 s incluindo 11,844 s de carregamento.
- Pico CUDA alocado: 2.612,323 MiB. Não é memória total do processo/GPU.
- Amostras de saída idênticas em forma à entrada, valores finitos.
- Erro relativo de reconstrução: 0,0101733. Não é medida de canto removido.
- Saídas nativas arquivadas; `dialogue.wav = speech` e
  `music-and-environment.wav = music + effects`, sem normalização independente.
- Baseline Demucs htdemucs CPU, shifts 0/segment 7/overlap 0,25 executado no
  mesmo recorte; fontes em `baseline/htdemucs/input`.
- Comparador `comparar.html` alterna as fontes preservando a posição de escuta.
- A tentativa CPU do Bandit foi interrompida sem resultado; não há RTF CPU
  ou estimativa válida de custo/latência Hostear.
- O Python em G: com nome runtime-audio-separator-gpu carregava torch sem CUDA.
  O runtime verificado está no caminho Temp acima; não houve reinstalação.

## Gate pendente e próximo passo

Ouvir comparação no trecho com cantor: canto residual, palavras perdidas,
voz robótica e fala vazando para música, com timestamps. O assistente não
realizou julgamento auditivo; não declarar ganho de qualidade.
Se o candidato passar, ampliar ao vídeo completo e controles fala pura,
canto puro e fala sobreposta; medir CPU antes de integração. Se falhar,
avaliar modelo explicitamente treinado para fala versus canto com direitos
adequados, sem recorrer a gate de silêncio que apague os dois.

Nenhuma alteração de engine no endpoint/Hostear, nenhum recurso pago e nenhuma
mudança no projeto do usuário. O piloto não está conectado à função Separar.
