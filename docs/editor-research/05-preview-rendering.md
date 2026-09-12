# Preview, composição e render

## Contrato único

O mesmo `EditorProjectV2` deve alimentar três consumidores:

1. **Preview:** HTMLVideoElement/WebCodecs + canvas de composição.
2. **Snapshot:** frame determinístico para thumbnail/template.
3. **Export:** render worker/servidor com as mesmas regras de time mapping, layers, captions, efeitos e áudio.

O preview pode usar proxy e resolução reduzida, mas não pode trocar a ordem das camadas, easing, crop ou mistura de áudio.

## Proposta técnica incremental

- manter `<video>` como decoder inicial;
- adicionar um `CompositionClock` que publica `projectTime`, `sourceTime`, `isPlaying` e `renderRevision`;
- renderizar overlays em canvas apenas onde a composição exige; manter DOM para controles;
- gerar thumbnails em worker e cachear por `assetId + time + transformRevision`;
- registrar `saveRevision` e `renderRevision` no job de exportação;
- exportar um frame de prova e um manifesto antes do vídeo completo.

## Gatilhos de invalidação

Media, clip timing, transform, effects, captions, audio mix e template registry devem ter revisões separadas. Preview e thumbnail só recalculam a região afetada.

## Aceitação

Para uma fixture fixa, o frame no playhead, a imagem exportada e o thumbnail do template devem concordar dentro da tolerância definida para proxy/codec. Divergência vira falha de qualidade, não ajuste visual manual.
