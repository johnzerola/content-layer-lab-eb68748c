# Chatterbox PT-BR V3 — instalação e limite do catálogo

O checkpoint oficial `ResembleAI/Chatterbox-Multilingual-pt-br` é um modelo de
síntese condicionado por áudio de referência. Ele não contém 50 locutores
PT-BR prontos, nem garante idades vocais (criança, adolescente ou idoso).
Os presets atuais de atuação e transformação continuam disponíveis, mas
variações de pitch/velocidade não contam como identidades distintas.

## Instalação isolada

Use o mesmo ambiente Python do serviço de clonagem e uma pasta nova, sem
sobrescrever `models`:

```bash
python backend/chatscene_voice/download_ptbr_v3.py \
  --directory /opt/chatscene-voice/models-ptbr-v3 \
  --base-directory /opt/chatscene-voice/models
```

O instalador fixa a revisão `b3952f18bc2eaa72b9bd7c17d2c4653bcad4770d`
e verifica SHA-256 de todos os pesos e assets exigidos. O worker seleciona o
modelo com `CHATSCENE_VOICE_MODEL_VARIANT=ptbr-v3` e
`CHATSCENE_VOICE_MODEL_PATH=/opt/chatscene-voice/models-ptbr-v3`. Sem essas
variáveis, usa V2. O serviço e o relay precisam receber `worker.py` e
`ptbr_v3.py` juntos antes de ativar. O health check informa `modelVariant`.

## Catálogo de locutores

Para oferecer 50 vozes reais, cada entrada precisa de uma amostra PT-BR de
locutor distinto, com autorização de uso para síntese/clonagem, qualidade
audível aprovada e arquivo de referência protegido por conta. Não publicar
amostras de pessoas de datasets públicos só porque o arquivo é aberto:
licença de áudio e consentimento para clonagem são verificações separadas.
Não inventar “vozes infantis” por efeito de pitch; a voz deve soar adequada
em teste de escuta e o uso da referência deve ser autorizado.

O teste técnico usa apenas `output/chatscene-voice-cloning/synthetic-reference.wav`
(fala gerada por Piper). Ele não demonstra semelhança com uma pessoa nem
valida qualidade de catálogo. Manter V2 e os templates existentes como
reversão até testes auditivos e de latência no fluxo completo.

## Estado em 2026-09-20

- Pesos V3 instalados e verificados em `G:\VaiViral\chatscene-voice\models-ptbr-v3`
  e `/opt/chatscene-voice/models-ptbr-v3`; o diretório V2 foi preservado.
- Smoke isolado: CUDA produziu WAV mono 24 kHz de 2,84 s; CPU no Hostear
  produziu WAV de 3,08 s, com 44,99 s de inferência.
- Serviço privado no Hostear ativado em `ptbr-v3`. O fluxo completo
  upload de referência sintética → síntese → remoção passou via relay CUDA.
  Health autenticado: `installed=true`, `modelVariant=ptbr-v3`,
  `modelLoaded=true` após aquecimento.
- Backup pré-ativação: `/opt/chatscene-voice/pre-ptbr-v3-20260920.tgz`.
  A configuração local anterior está em
  `backend/data/chatscene-voices/runtime.pre-ptbr-v3.json` (ignorado pelo Git).
- O fluxo da interface publicada ainda precisa de teste manual com uma conta
  autenticada. Nenhum catálogo de 50 locutores foi publicado.
