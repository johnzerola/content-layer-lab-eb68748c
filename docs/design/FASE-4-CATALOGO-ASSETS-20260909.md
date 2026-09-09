# Fase 4 — catálogo de conteúdo e proveniência

O editor já possui presets internos de transição, efeitos, layouts, legendas, stickers e música. A Fase 4 passa a tratá-los como uma biblioteca de conteúdo com categoria, preview, licença, origem e compatibilidade com o renderer.

## Fontes pesquisadas

- [OpenVideo Editor](https://github.com/openvideodev/react-video-editor): referência de timeline, asset management, efeitos e transições; possui licença dual, portanto o código não entra diretamente sem análise comercial.
- [Rendiv](https://github.com/thecodacus/rendiv): referência Apache-2.0 para primitives de transição/easing; usar adaptador próprio, sem copiar a identidade visual.
- [GL Transitions](https://github.com/gl-transitions/gl-transitions): coleção de shaders MIT; exige renderer WebGL separado do caminho Canvas 2D atual.
- [Pixabay API](https://pixabay.com/api/docs/) e [licença de conteúdo](https://pixabay.com/service/license-summary/): candidatos para música, SFX e mídia; conteúdo não pode ser redistribuído isoladamente e a chave deve ficar no backend.
- [Google Fonts](https://fonts.google.com/): fontes OFL devem ter família/pesos registrados e carregados antes da exportação.

## Conteúdo inicial por categoria

- Transições: fade, zoom, slide, whip, punch, drift, swing e flash já compatíveis com Canvas 2D; próximas coleções: blur, wipe, film burn e glitch shader, atrás de feature flag.
- Efeitos: impacto, movimento, cor e textura; cada efeito precisa de intervalo, intensidade, preview curto e bypass.
- Templates: podcast, notícia, educativo, UGC, comentário, storytelling e minimal; cada modelo deve informar formato, fontes, duração esperada, área segura e bindings.
- Legendas: linha limpa, palavra destacada, karaoke, caixa editorial, notícia e comentário; cada estilo precisa de exemplo real e fallback de fonte.
- Áudio: música, voz e SFX com waveform, licença, duração, preview, volume, fade, loop e remoção individual/em lote.
- Fontes: famílias com licença, pesos disponíveis e teste de render antes de publicar o preset.

## Contrato de uma biblioteca moderna

Todo asset deve possuir `id`, categoria, thumbnail/preview, origem, licença, versão, proporção suportada, tags, dependências e fallback. O botão Aplicar deve executar uma única operação reversível, registrar a origem no documento e mostrar se o item é interno, baixado ou remoto.

O arquivo `src/lib/editor/asset-catalog.ts` contém o registro inicial de proveniência. Ele é deliberadamente separado dos presets: adicionar uma fonte não torna automaticamente seu conteúdo permitido para redistribuição.

## Ordem de integração

1. Catalogar e versionar presets internos.
2. Criar preview real sobre o vídeo do usuário.
3. Integrar Google Fonts com carregamento e fallback verificáveis.
4. Integrar Pixabay no backend com cache de metadados, licença e atribuição.
5. Criar adaptador WebGL opcional para shaders aprovados; manter Canvas 2D como fallback.
6. Adicionar favoritos, recentes, busca, tags, filtros por proporção e estado vazio/erro.

Não copiar código de repositórios com licença incompatível ou incerta. A licença deve ser armazenada junto ao asset importado e aparecer nos detalhes do item.
