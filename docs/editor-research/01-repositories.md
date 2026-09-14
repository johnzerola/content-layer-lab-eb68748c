# Repositórios e referências estudados

## Seleção principal

| Projeto | O que ensina | Como usar a referência |
|---|---|---|
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | editor local-first, multiplataforma e intenção de separar UI de um core Rust | estudar fronteiras de domínio e offline; não importar a arquitetura inteira agora |
| [OpenVideo React Video Editor](https://github.com/openvideodev/react-video-editor) | WebCodecs, PixiJS, timeline multitrack, snapping, canvas e exportação local | prototipar render de preview e interação em um slice isolado |
| [OpenReel](https://github.com/Augani/openreel-video) | separação por `core`, stores, bridges e services | organizar adaptadores de mídia sem misturar UI e render |
| [Clypra](https://github.com/AIEraDev/Clypra) | Tauri/Rust, FFmpeg, hardware acceleration, waveform, monitor de performance | referência para uma futura rota desktop/worker; não bloquear a web agora |
| [Keyloom](https://github.com/theexperiencecompany/keyloom) | registry de cenas/templates, previews reais, efeitos empilháveis e JSON compartilhado | modelo de banco de templates e contrato de preview |

## Referências especializadas

- [Captiony](https://github.com/zeikar/captiony): editor de legendas com waveform, undo/redo, autosave, atalhos e zoom.
- [Subtitle editor PWA](https://github.com/laubonghaudoi/subtitle-editor): multi-track, waveform, SRT/VTT e edição local-first.
- [SnakeLil subtitle-editor](https://github.com/SnakeLil/subtitle-editor): split/merge, múltiplos idiomas e atalhos.
- [react-timeline-editor](https://github.com/xzdarcy/react-timeline-editor): contrato mínimo de timeline (`row`, `action`, `effectId`).
- [WaveSurfer](https://wavesurfer.xyz/): regiões, minimap, timeline e envelope de volume/fade.
- [Mediabunny](https://mediabunny.dev/): demux/mux e WebCodecs em TypeScript; avaliar MPL-2.0 antes de adoção.
- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm): fallback de mídia no navegador; medir custo antes de usar em lote.
- [floomhq/opencut](https://github.com/floomhq/opencut): engine programática, captions word-level, beats e plugins.

## Padrões recorrentes

1. Um relógio de projeto converte source time em timeline/output time.
2. Um comando transacional atualiza timeline, canvas, áudio, captions e seleção.
3. Preview, serialização e exportação consomem o mesmo documento tipado.
4. Templates são dados registráveis com preview gerado do próprio contrato.
5. Mídia pesada fica em storage/cache; o projeto guarda referências, não data URLs grandes.
