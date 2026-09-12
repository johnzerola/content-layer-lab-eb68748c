# Arquitetura da Library

## Componentes

- `LibraryItem`: item único com tipo, preview, definição, compatibilidade e licença;
- `LibraryRegistry`: valida, indexa, pesquisa, filtra e pagina;
- `LibraryProvider`: contrato assíncrono para busca, detalhe e download;
- `AssetCache`: chave por provider item, hash e versão;
- `LibraryUserState`: favoritos, recentes e baixados fora do projeto;
- `LibraryPack`: agrupamento por ids, sem duplicar assets;
- `MyLibraryRecord`: referência por usuário para mídia, presets e brand assets;
- definitions: transições, efeitos e templates separados das instances.

## Categorias

Templates, transitions, video effects, filters, text, captions, animations, music, SFX, stock video/images, stickers, GIFs, overlays, shapes e backgrounds. O contrato reserva LUTs, fonts, brand kits, user presets, community packs e plugins.

## Fluxo

Busca não baixa o arquivo. O card usa thumbnail/preview sob demanda. Selecionar registra recente. Favoritar altera estado do usuário. Adicionar cria um comando reversível no projeto. Downloads futuros validam mime, tamanho, duração e codec antes de copiar para storage.

## Built-ins

São definições programáticas originais: 14 transições, 10 animações, 8 textos, 8 captions, 9 efeitos não destrutivos, 4 formas e 2 templates de demonstração. Nenhum conteúdo proprietário externo foi baixado.
