# Proposta Editor V2

## Visão

Um editor de vídeo web com shell claro, timeline multitrack, canvas editável, inspector contextual, templates com preview real e um documento único que serve preview, persistência e exportação.

## Arquitetura recomendada

```text
UI shell
  -> commands/selection/focus
  -> EditorProjectV2 store + history
  -> time map + composition resolver
      -> preview adapter
      -> thumbnail/template adapter
      -> export manifest/render adapter
  -> asset registry (storage, proxy, waveform, stems)
```

Manter o render worker atual como adaptador até que testes provem uma substituição segura. A primeira versão não precisa trocar React, Tailwind, Radix, Supabase ou o decoder atual.

## Fases

### Fase 0 — contrato e baseline

Congelar fixtures, capturar screenshots e exportações atuais, documentar divergências e adicionar testes de save/load, undo/redo, playback e export.

### Fase 1 — relógio e comandos

Introduzir `ProjectTime`, time map, command bus e seleção única. Adaptar uma operação (split) sem mudar o visual.

### Fase 2 — timeline multitrack

Rows de vídeo, overlay, captions, voice, music e SFX; ripple, snapping, trim e atalhos; virtualização e painel redimensionável.

### Fase 3 — canvas/inspector/keyframes

Seleção direta no canvas, handles acessíveis, keyframes por propriedade, easing e transições com contrato exportável.

### Fase 4 — templates e legendas

Registry tipado, previews reais, aplicação como comando, captions por cue/word e presets com motion reduzível.

### Fase 5 — áudio e performance

Assets de stems, waveform cacheada, envelopes, solo/mute/ducking, workers, métricas e recuperação de erros.

### Fase 6 — rollout

Feature flag por projeto, migração v1->v2, comparação visual e de áudio, rollout gradual e remoção somente após estabilidade.

## Critérios de aprovação

- nenhuma mudança nesta fase toca Cleaner/Fase 6;
- preview e export usam o mesmo manifest;
- todos os comandos têm undo/redo e serialização;
- o projeto recarrega sem data URLs grandes;
- atalhos, foco, contraste e reduced motion passam a11y;
- templates têm thumbnail e frame de aplicação reproduzíveis;
- uma fixture de áudio valida voz/música em solo e mix.

## Riscos

O maior risco é tentar redesenhar shell e estado simultaneamente. A mitigação é migrar por adaptadores, manter o editor atual disponível e promover cada fase somente após evidência automatizada e visual.
