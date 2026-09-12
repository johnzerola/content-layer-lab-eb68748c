# Arquitetura Editor V2 — Phase 0

## Fronteira

O V2 vive em `src/lib/editor-v2` e `src/components/editor-v2`. O editor V1 continua sendo o caminho principal. `/editor-v2` só mostra a fundação quando `EDITOR_V2_ENABLED`/`VITE_EDITOR_V2_ENABLED` está ativa.

```text
EditorProjectDoc V1 --adapter somente leitura--> EditorProjectV2
                                                |
                                   EditorCommandBus + history
                                                |
                                      CompositionClock
                                                |
                       preview / timeline / captions / audio / save / export
```

## Documento

`EditorProjectV2` contém assets, tracks, clips, caption cues, transitions, template instances, seleção, settings e revisões. Arquivos grandes ficam referenciados em `MediaAsset`; não entram no JSON.

## Revisões

- `document`: qualquer comando persistível;
- `render`: comando com impacto visual, temporal ou de áudio;
- `saved`: futura confirmação do backend.

## Migração

O adapter V1 converte os segmentos mantidos em clips contíguos no tempo do projeto, preservando `sourceIn`, `sourceOut` e velocidade. Ele não salva V2 e não modifica o documento original.

## Pendências intencionais

Persistência V2, render manifest V2, captions completas e áudio V1 ainda não foram migrados. A Phase 0 cria o contrato e prova comandos isolados.
