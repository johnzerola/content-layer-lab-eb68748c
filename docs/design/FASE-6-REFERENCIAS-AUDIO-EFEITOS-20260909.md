# Fase 6 — referências e implementação de áudio/efeitos

## Referências verificadas

- [MDN DynamicsCompressorNode](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode): compressor reduz picos e ajuda a evitar clipping quando várias trilhas são somadas.
- [Web Audio API](https://www.w3.org/TR/webaudio-1.0/): referência do grafo de áudio, `GainNode`, compressor e automação.
- [GL Transitions](https://github.com/gl-transitions/gl-transitions): especificação de transições entre duas texturas com `progress` de 0 a 1; o repositório informa licença MIT, mas arquivos individuais devem ser conferidos.
- [Lottie Player Web Component](https://lottiefiles.github.io/lottie-player/license.html): player MIT; os arquivos de animação têm licenças próprias e não devem ser confundidos com a licença do player.
- [Sprocket](https://github.com/SprocketVideo/Sprocket): referência de acabamento de NLE, ajustes, transições, títulos e avisos de terceiros; não importar FFmpeg/licenças desktop para o editor web sem revisão.

## Implementado nesta fase

- Compressor master opcional na mixagem offline de exportação, com parâmetros conservadores para evitar clipping.
- Controle “Proteção” no painel de áudio, com estado persistido no documento.
- Compatibilidade com projetos antigos: áudio sem esse campo usa proteção por padrão.
- Mantida a separação entre efeitos Canvas 2D atuais e futuros shaders WebGL; não há download automático de shaders de terceiros.

## Conteúdo externo

Não foram baixados binários ou coleções de terceiros para dentro do repositório. As referências ficam documentadas para integração controlada, com licença, cache, attribution e fallback. A próxima integração segura é um adaptador de transições GL com allowlist e preview, seguido de importação Lottie sanitizada.

## Critérios de aceitação

- Exportação com voz + música + SFX não clipa em picos comuns.
- Desativar Proteção mantém o mix original para comparação.
- Projetos antigos continuam abrindo e exportando.
- Efeitos e transições mantêm preview e exportação equivalentes.
- Asset externo informa origem e licença antes de ser aplicado.
