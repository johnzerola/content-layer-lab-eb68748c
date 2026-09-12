# ChatScene — Phase 4 Report (Voice Cast, TTS e sincronização)

## Escopo entregue

- **Voice Cast**: cada participante recebe uma voz sintética genérica (`VOICE_PRESETS`),
  um jeito de falar (`VOICE_STYLES`) e velocidade 0.8–1.2x. Persistido em
  `ChatParticipant.voice` com normalização retrocompatível.
- **VoiceProvider abstrato** (`voice-cast.ts`): contrato injetável; o adapter atual é o
  gateway server-side. Nenhum provider externo é chamado do browser.
- **TTS server-side** (`voice.functions.ts`): server function autenticada, validação Zod,
  limite de 600 caracteres, tratamento de 402/429, chave lida apenas no handler.
- **Cache por hash** (`voiceKey`): mesmo texto + voz + estilo + velocidade não re-sintetiza.
- **Batching**: `generateCast` roda em lotes (3), reporta progresso, aceita cancelamento e
  devolve falhas por mensagem sem derrubar o lote.
- **Duração real**: cada clipe é decodificado (`AudioContext`) e a duração medida alimenta
  `message.voiceMs`, que o `ConversationTimingEngine` usa em `hold = max(leitura, voz)`.
- **Mixer** (`audio-mix.ts`): `OfflineAudioContext` 48 kHz estéreo, falas posicionadas no
  frame de entrada da bolha, ganho por participante, ducking de música (0.22, fade 0.18s)
  e normalização de pico (0.89).
- **Exportação com som**: `encode-frames.ts` adiciona faixa AAC quando `AudioEncoder`/
  `AudioData` existem; sem suporte, o MP4 sai só com vídeo em vez de falhar.
- **Presets de exportação**: 720p30, 1080p30 e 1080p60.

## Fora de escopo (mantido)

Sem voice cloning, sem imitação de pessoas reais, sem IA de roteiro, pagamentos, créditos,
API pública, colaboração, timeline profissional completa ou integração Editor V2.
Cleaner IA, RunPod, Editor V1 e internals do Editor V2 não foram tocados.

## Gates

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsgo --noEmit`) | limpo |
| Vitest ChatScene | 45 testes, 5 arquivos, todos passando |
| Browser QA desktop 1280×1800 | `/chatscene` sem overflow horizontal, sem erro de console |
| Painel de vozes | visível, presets e mixagem operando |

## Limitações conhecidas

- A faixa AAC depende de `AudioEncoder` no navegador; Safari antigo exporta sem som.
- Áudio embutido em vídeos de mídia ainda não entra na mixagem (só falas + música).
- O cache de falas é de sessão; recarregar a página exige gerar de novo.
- Benchmark de voz com números medidos em produção ainda não foi executado.
