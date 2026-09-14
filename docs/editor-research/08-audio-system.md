# Sistema de áudio

## Modelo

Cada faixa declara papel (`original`, `voice`, `music`, `sfx`), clip source, envelope de volume, fades, mute/solo e roteamento. O projeto guarda `assetId`/storage URL; stems não devem ser embutidos como data URL salvo para fixtures pequenas.

## Mixer

- ganho por clip e por track;
- envelope com pontos de volume;
- solo/mute com feedback na timeline;
- ducking opcional guiado por janelas de fala;
- limiter/compressor no master somente quando escolhido;
- medidor RMS/peak e aviso de clipping;
- waveform lazy, cacheada por hash de asset e resolução.

## Separação de voz/música

A separação continua sendo um serviço assíncrono. O editor deve receber estados `queued/running/partial/ready/error`, mostrar confiança/limitações e permitir A/B com original. O resultado é um par de assets versionados, não dois blobs inline.

## Aceitação

Fixtures com voz alta/música baixa e o inverso devem permitir: solo de voz audível sem música, solo de música sem voz, mix com ducking e exportação coerente com a prévia. O relatório deve incluir duração, sample rate, canais e revisão do stem.
