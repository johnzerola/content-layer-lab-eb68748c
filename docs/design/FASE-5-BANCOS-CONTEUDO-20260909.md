# Fase 5 — bancos de conteúdo, tipografia e legendas

## Bancos pesquisados

- [Google Fonts](https://fonts.google.com/): famílias OFL para títulos e legendas. Deve-se registrar família, peso e licença por preset.
- [OpenMoji](https://openmoji.org/faq): stickers CC BY-SA 4.0, uso comercial permitido com atribuição e ShareAlike.
- [IconStash](https://iconstash.com/about.html): packs com licenças diferentes; cada pack precisa de validação individual.
- [LottieFiles License](https://lottiefiles.com/page/license): arquivos públicos podem usar a Lottie Simple License, mas cada asset deve ser conferido e não pode ser redistribuído isoladamente ou usado para compilar um serviço concorrente.
- [Pixabay license](https://pixabay.com/service/license-summary/): música, SFX, imagens e vídeos podem entrar em uma obra maior; o editor não deve distribuir o arquivo original isoladamente.

## Conteúdo que entra no produto

`src/lib/editor/content-banks.ts` registra bancos, licença, atribuição, uso comercial e finalidade. Também define seis direções modernas de legenda para orientar presets reais: palavra em destaque, legenda limpa, caixa editorial, pilha cinética, nome do falante e rodapé seguro.

Essas direções devem virar presets com preview sobre um vídeo real, contraste mínimo, área segura, quebra de linha, fallback de fonte e comportamento em textos longos. Um cartão não pode representar um estilo como pronto antes de ele renderizar corretamente.

## Critérios para incorporar um asset

1. A licença e a atribuição ficam salvas no metadata do asset.
2. A família de fonte tem pesos disponíveis e foi carregada antes do render.
3. O preview usa a mesma tipografia e animação do exportador.
4. O asset pode ser removido do catálogo sem quebrar projetos existentes.
5. Assets remotos têm cache, timeout, erro visível e fallback local.
6. O usuário consegue ver origem/licença antes de aplicar.

## Próximos incrementos de implementação

- Criar o painel “Banco de assets” com abas Fontes, Legendas, Stickers e Motion.
- Adicionar busca por finalidade: podcast, notícia, educativo, UGC, comentário e Reels.
- Registrar `sourceId`, licença e versão em cada camada importada.
- Adicionar importador de SVG/Lottie com sanitização e limite de tamanho.
- Criar uma galeria de seis presets de legenda com exemplos em português e aplicação global/selecionada.
- Criar fallback de fonte e alerta de fonte ausente antes de exportar.
