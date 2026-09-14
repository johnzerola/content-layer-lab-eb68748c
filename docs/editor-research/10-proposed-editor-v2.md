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

**Estado em 13/09/2026:** implementada e validada atrás da feature flag. Importação persistente, waveform real e mix permanecem corretamente alocados à Fase 5; detalhes e evidências estão em `docs/editor-v2/phase2-timeline-report.md`.

### Fase 3 — canvas/inspector/keyframes

Seleção direta no canvas, handles acessíveis, keyframes por propriedade, easing e transições com contrato exportável.

**Estado em 13/09/2026:** implementada e validada atrás da feature flag. O mesmo resolvedor alimenta o canvas e o manifest de render; detalhes estão em `docs/editor-v2/phase3-report.md`.

### Fase 4 — templates e legendas

Registry tipado, previews reais, aplicação como comando, captions por cue/word e presets com motion reduzível.

**Estado em 13/09/2026:** implementada e validada atrás da feature flag. Templates incorporam um `TemplateDoc`, exibem a composição real do documento e são aplicados como um comando atômico. Legendas mantêm cues e palavras temporizadas no projeto, com presets e motion respeitando `prefers-reduced-motion`. Contrato e evidências estão em `docs/editor-v2/phase4-templates-captions-contract.md` e `docs/editor-v2/phase4-report.md`.

### Fase 5 — áudio e performance

Assets de stems, waveform cacheada, envelopes, solo/mute/ducking, workers, métricas e recuperação de erros.

**Estado em 13/09/2026:** implementação funcional concluída atrás da feature flag. O projeto agora serializa mix, stems versionados e envelopes; a timeline usa waveform real analisada em worker e a reprodução consome o mesmo resolvedor do manifesto. Testes funcionais passaram. Na medição local, a waveform apareceu em 525 ms no primeiro carregamento e 71 ms com cache; a meta exploratória fria de 500 ms ficou 25 ms acima e permanece registrada para otimização durante o rollout. Detalhes em `docs/editor-v2/phase5-audio-contract.md` e `docs/editor-v2/phase5-report.md`.

### Fase 6 — rollout

**Dependência de áudio detalhada em 13/09/2026:** o [roadmap AUD-00 a AUD-09](../editor-v2/audio-separation/README.md) complementa a Fase 5. A evidência anterior cobre a fundação de mix/waveform; não comprova extração e separação neural conectadas no V2, persistência durável nem exportação final. A auditoria atual encontrou essas integrações pendentes, além de limites de ganho/velocidade da prévia e dados de faixa ausentes no manifest. O novo pacote especifica arquivos, contratos, testes e handoff para implementar o fluxo completo antes da liberação.

Feature flag por projeto, migração v1->v2, comparação visual e de áudio, rollout gradual e remoção somente após estabilidade.

### Expansão criativa antes do rollout

**Estado em 13/09/2026:** pacote funcional implementado e validado no navegador. O V2 agora reaproveita mais de 60 estilos de legenda, 14 stickers vetoriais, 12 efeitos, 12 filtros, 19 animações e 12 presets de texto do acervo interno, além de importar SRT/VTT e chamar o serviço existente de geração automática com tempo por palavra. Vídeo e imagem receberam inspector de velocidade, animação, ajustes de cor/qualidade e pilha de efeitos. O canvas e o manifesto consomem o mesmo resolvedor temporal. O workspace completo de correção da transcrição e a prova do arquivo final continuam pendentes. Evidências e limites estão em `docs/editor-v2/creative-completeness-report.md`.

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
