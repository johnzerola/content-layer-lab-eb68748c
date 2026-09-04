# Novos superpoderes do editor: stickers, efeitos, corte de silêncio e separação de áudio

Estudo do que existe hoje no VaiViral e do que projetos open source de edição de vídeo (Diffusion Studio Core, Twick, editores locais com WebCodecs, auto-editor, Demucs, gl-transitions, Lottie) já resolvem — e como trazer isso para o nosso editor sem quebrar nada.

## O que já temos (verificado no código)

- Render próprio em WebCodecs/MP4 (`src/lib/editor/render-template.ts`, `mp4-muxer`) — não precisamos trocar de motor.
- Camadas de composição: texto, imagem, vídeo, forma e legenda (`src/lib/video-template/types.ts`).
- Detecção de pausas na fala a partir da transcrição (`silenceRanges`) com botão de remover pausas no painel de corte.
- Trilhas de áudio com volume, fade, loop e ducking (`src/lib/editor/audio.ts`), acervo de músicas e narração pt-BR.
- Backend Python próprio (FastAPI + Celery + torch/torchaudio + ffmpeg) já usado pelo LimpaVídeo — é onde a IA pesada deve rodar.

## O que falta e será construído

### Fase 1 — Stickers animados ("Inscreva-se", seta, curtir, siga a página)

- Novo tipo de camada `sticker`, animada, com tempo de entrada/saída na timeline.
- Acervo pronto com pacotes por objetivo: Inscreva-se (YouTube), Siga (Instagram/TikTok), Curtir, Compartilhar, Seta/aponte, Contagem regressiva, Selo "novo", Emojis reativos.
- Cada sticker aceita personalização: cor da marca (puxa do Brand Kit), texto (@seuperfil, nome do canal), tamanho, posição e velocidade.
- Renderizados por animação vetorial (Lottie via runtime WASM que desenha em canvas), então funcionam igual na prévia e no MP4 exportado, inclusive dentro do worker.

### Fase 2 — Efeitos e transições de verdade

- Biblioteca de efeitos por shader (base gl-transitions, licença MIT): glitch, zoom burst, flash, RGB split, whip pan, film burn, luz vazada, tremor, VHS, slow zoom.
- Efeitos de clipe (aplicados a um trecho) além das transições entre cortes, com prévia no palco e no timeline.
- Presets "1 clique" com intensidade ajustável, para não exigir conhecimento técnico.

### Fase 3 — Removedor de silêncio profissional (estilo auto-editor)

- Análise real da onda de áudio (não só da transcrição): detecta pausas, respiração e trechos abaixo do limiar.
- Painel com controles: limiar, duração mínima da pausa, margem antes/depois, e escolha entre remover, acelerar (2x–8x) ou apenas marcar.
- Prévia do resultado ("de 12:40 para 8:05, 137 cortes") e aplicação reversível na timeline.

### Fase 4 — Separar voz, música e efeitos do vídeo

- Roda no nosso backend GPU com Demucs (htdemucs), que devolve as trilhas: voz, música, baixo, outros.
- No editor: botão "Separar áudio" → as trilhas voltam como faixas independentes, com volume próprio.
- Usos diretos: tirar a música original e colocar outra, isolar a voz para legenda mais precisa, karaokê/instrumental, limpar ruído de fundo.
- Enquanto processa, o editor continua utilizável (fila, igual ao LimpaVídeo).

### Fase 5 — Extras que vêm de graça no mesmo caminho

- Forma de onda real na timeline (ajuda a cortar no ritmo).
- Batidas da música detectadas para alinhar cortes ao beat.
- Normalização de volume e redução de ruído na exportação.

## Detalhes técnicos

- Stickers: runtime Lottie em WASM com renderer canvas (funciona em `OffscreenCanvas` do worker de render); assets CC0/MIT armazenados no bucket privado e cacheados; camada nova `type: "sticker"` em `src/lib/video-template/types.ts` com desenho em `render-template.ts` e no worker, mantendo a versão do documento compatível (campo opcional).
- Efeitos: passe WebGL sobre o frame antes do encode; shaders portados de gl-transitions (MIT) para um módulo `src/lib/editor/effects.ts`, com fallback em canvas 2D quando WebGL não estiver disponível.
- Silêncio: decodificação do áudio com Web Audio (`decodeAudioData`) em worker, RMS por janela de 20 ms, histerese de ataque/liberação; gera segmentos aplicados ao `preedit.segments` já existente.
- Demucs: novo endpoint no backend (`/audio/separate`) reaproveitando fila Celery, storage e segurança já existentes; cliente em `src/lib/editor/stems.ts` + server function autenticada; as trilhas resultantes entram como `AudioClip` com `kind` próprio.
- Licenças: só bibliotecas MIT/Apache/MPL e assets CC0 — nada de conteúdo proprietário de terceiros.
- Nada de mudança em rotas, publicação, planos ou schema existente além das adições descritas.

## Ordem sugerida

Fase 1 e 2 primeiro (impacto visual imediato nos cortes), depois 3 (economia de tempo), depois 4 (a mais pesada, depende do backend GPU ligado).
