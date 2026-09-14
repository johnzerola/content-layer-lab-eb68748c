# Arquitetura de timeline

## Modelo proposto

```ts
type ProjectTime = number;
type TrackId = string;
type ClipId = string;

interface EditorProjectV2 {
  version: 2;
  media: MediaAssetRef[];
  tracks: Track[];
  markers: Marker[];
  captions: CaptionDocument;
  selection: SelectionState;
  settings: ProjectSettings;
}

interface Clip {
  id: ClipId;
  assetId: string;
  trackId: TrackId;
  sourceIn: number;
  sourceOut: number;
  projectStart: ProjectTime;
  projectEnd: ProjectTime;
  transforms: TransformTrack;
  effects: EffectInstance[];
  audio?: AudioClipState;
}
```

O relógio do projeto é a única coordenada pública. Cada clip mantém mapeamento `project -> source`; intervalos removidos são uma operação de montagem que recalcula esse mapa, não um segundo relógio escondido.

## Comandos

`addClip`, `moveClip`, `trimClip`, `splitClip`, `rippleDelete`, `setTrackMute`, `setVolume`, `addKeyframe`, `applyTemplate`, `setCaptionStyle` e `setSelection` devem implementar `execute`, `undo`, `redo`, `serialize`, `selectionAfter` e `renderImpact`.

## Ripple e snapping

- ripple delete move apenas clips elegíveis da mesma sequência/track group;
- locks e sync locks impedem deslocamento acidental;
- snapping usa playhead, bordas de clips, markers, keyframes e transições;
- a tolerância depende do zoom e é anunciada visualmente;
- trim não deve criar duração negativa nem perder o vínculo source/project.

## Migração segura

1. Criar adaptador `EditorProjectDoc v1 -> V2` somente leitura.
2. Rodar V2 em fixture paralelo e comparar preview/serialização.
3. Migrar uma operação por vez atrás de feature flag.
4. Só remover caminhos antigos após undo/redo, save/load e export equivalentes.
