# ChatScene — Voice Transform Engine V1

Data: 2026-09-16.

## 1. Arquitetura encontrada

O ChatScene já possuía `VoiceProviderRegistry`, `VoiceProfile`, presets de identidade/atuação, TTS server-side, cache em memória + IndexedDB, medição por `AudioContext`, `ConversationClock` e render sincronizado por `message.voiceMs`. O V1 estende esse caminho: o provedor gera a voz-base e `VoiceTransformEngine` faz o pós-processamento.

Fluxo efetivo:

`texto → VoiceProvider → WAV/PCM base → VoiceTransformEngine → MP3 final → duração decodificada → message.voiceMs → ConversationClock`.

## 2. Implementação

- Contratos, fórmulas, presets e validação: `src/lib/chatscene/voice-transform.ts`.
- Execução server-side segura com `spawn`, argumentos em array e `shell: false`: `src/lib/chatscene/voice-transform.server.ts`.
- Integração com o gateway TTS: `src/lib/chatscene/voice.functions.ts` e `voice-request.ts`.
- Cache, playback e duração final: `src/lib/chatscene/voice-cast.ts` e `voice.ts`.
- UI no Voice Cast e Voice Lab: `src/components/chatscene/VoicePanel.tsx` e `ChatSceneStudio.tsx`.

O áudio transformado é decodificado apenas uma vez na entrada, processado em PCM no grafo FFmpeg e codificado uma vez para MP3. Nenhum MP3 intermediário é criado.

## 3. Dependência e capacidades

- Dependência adicionada: `ffmpeg-static@5.3.0`.
- Binário detectado: `ffmpeg version 6.1.1-essentials_build-www.gyan.dev`.
- Plataforma validada: Windows.
- Filtros usados: `asetrate`, `aresample`, `atempo`, `loudnorm`, `volumedetect`.
- Modos: `VARISPEED`, `TEMPO_ONLY`, `PITCH_ONLY`, `SPEED_AND_PITCH`, `VARISPEED_THEN_RESTORE_TEMPO`.
- Backend ativo: `FFMPEG_BASELINE`.
- Rubber Band: detectado no binário, mas não usado nem exposto.
- Preservação de formantes: não suportada pelo baseline; controle desabilitado e capacidade declarada como `false`.

## 4. Presets

Foram implementados: `adam_natural`, `adam_young`, `adam_roblox_teen`, `adam_child_male`, `adam_child_cartoon`, `adam_deep`, `adam_mature_character` e `adam_child_pitch_only`.

O JSON de entrega está em `docs/chatscene/voice-transform-presets.v1.json`. As classificações de evidência são explícitas e os textos não apresentam efeitos tonais como idades autênticas.

## 5. Voice Lab

O painel existente ganhou comparação A–E com a frase “Você não vai acreditar no que aconteceu hoje.” para Natural, Young, Roblox Teen, Child-like Male e Normal Speed High Pitch. Cada item é reproduzido isoladamente usando a voz-base já escolhida. Presets experimentais são identificados. Nenhuma chamada paga foi feita durante esta implementação.

## 6. Cache e observabilidade

O cache do navegador inclui toda a seleção de transformação. O cache server-side usa SHA-256 e inclui `sourceAudioHash`, versão do engine, preset, velocidade, tom, pitch vinculado, preservação de tom/formantes, normalização, modo e codec. O engine registra engine, preset, durações, velocidade, tom efetivo, tempo de processamento e cache hit, sem texto, áudio, credenciais ou segredos.

## 7. ConversationClock

Áudio transformado não usa mais correção de duração por `playbackRate`. `decodeClip()` mede o arquivo final e `clipDurationMs()` envia essa duração a `applyVoiceDurations()`. O `ConversationClock` continua sendo a única fonte temporal e usa `message.voiceMs` final.

## 8. Validação e artefatos

- Fórmulas: 1,30 → 4,54214 st; 1,40 → 5,82512 st; conversão reversa validada.
- `buildAtempoChain`: extremos como 0,25 → 0,5 × 0,5 e 4 → 2 × 2.
- Entrada de 10 s: varispeed 1,30 mediu 7,728 s; restauração de tempo mediu 10,032 s.
- Saídas: não vazias, decodificáveis, 24 kHz, mono preservado e sem clipping.
- Build de produção: passou.
- Testes específicos e regressões do Voice Cast: passam.

Os oito MP3s de validação e suas métricas estão em `output/chatscene-voice-transform-v1/`. São tons determinísticos de engenharia, não amostras de voz nem a comparação falada do Voice Lab. O `manifest.json` registra duração, sample rate, canais, pitch-alvo, pico, volume médio, tempo de processamento e cache hit.

## 9. Artefatos conhecidos

O baseline altera pitch por sample-rate + resampling e tempo por `atempo`. Em mudanças maiores podem surgir timbre fino/granulado, transientes suavizados e formantes deslocados. A normalização é one-pass e conservadora; as medições do sinal de teste ficaram perto de pico -14,2/-14,3 dB e volume médio -17,3/-17,4 dB. Qualidade perceptual em fala PT-BR real ainda não foi aprovada por escuta humana.

## 10. Licença e implantação

O pacote/binário instalado é GPL-3.0-or-later. Uso comercial é possível com cumprimento das obrigações GPL, incluindo licença e código-fonte correspondente ao distribuir o binário. A matriz foi atualizada em `VOICE-LICENSE-MATRIX.md`. `FFMPEG_PATH` permite substituir o pacote por uma build própria compatível.

Restrição de implantação: o bundle principal atual usa Cloudflare Workers, que não oferece `child_process` nem executa binários nativos. O engine está validado em Node e precisa rodar em um worker/serviço Node com FFmpeg; não deve ser anunciado como operacional no runtime Cloudflare até esse destino estar configurado. Falhas permanecem visíveis ao usuário.

## 11. Próximo experimento recomendado

Implantar o engine no worker Node de mídia e executar um teste cego com fala PT-BR licenciada nas cinco opções do Voice Lab. Medir preferência, inteligibilidade, sibilância, naturalidade, LUFS e diferença de duração antes de promover qualquer preset experimental para `INTERNAL_VALIDATED`.
