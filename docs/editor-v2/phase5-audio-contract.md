# Editor V2 — contrato de áudio e performance

## Documento

Cada clipe de áudio persiste ganho, mute, fades, loop, papel do stem e envelope local. Cada faixa persiste ganho, mute e solo. As configurações do projeto persistem ganho master e ducking.

Stems são `MediaAsset` versionados com papel `voice` ou `music`, referência ao asset original, revisão e estado assíncrono. `createStemAsset` remove URLs transitórias do mix original para impedir fallback silencioso.

## Mix compartilhado

`resolveAudioMixFrame(project, projectTime)` é a fonte de verdade para reprodução e render. Ele resolve:

- source time considerando corte e velocidade;
- ganho do clipe e da faixa;
- interpolação do envelope;
- fade in/out;
- mute e solo;
- redução da música enquanto uma voz está ativa;
- ganho master.

`createEditorRenderManifest` serializa assets e clipes de áudio completos. O preview usa o mesmo resolvedor.

## Waveform

O arquivo é decodificado pelo Web Audio. Os canais PCM são transferidos para um Worker que calcula picos, RMS e peak. O cache usa `nome:tamanho:lastModified:resolução`; os picos ficam fora do documento para evitar crescimento do save, enquanto o asset registra chave, estado, sample rate, canais e duração da análise.

Falhas deixam o áudio utilizável, marcam `audioAnalysis.status=error` e apresentam feedback em vez de travar a importação.

## Limites

O navegador limita `HTMLMediaElement.volume` a 100%; ganhos acima disso permanecem no contrato de render e são limitados apenas no monitor local. A separação neural continua no serviço assíncrono existente e entrega URLs persistentes para os assets de stem.
