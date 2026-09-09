# Fase 7 — exportação, desempenho e liberação

## Implementado

- Cancelamento real da renderização com `AbortController`.
- Progresso preservado durante o render e limpeza do controller ao finalizar.
- Mensagem separada para cancelamento e falha.
- Relatório de saída considera velocidade por segmento, incluindo duração compactada e taxa aplicada.
- Fallback de qualidade continua explícito quando o navegador não sustenta a resolução escolhida.
- Compressor de áudio usa fallback quando o ambiente de teste/navegador não expõe `createDynamicsCompressor`.

## Checklist de liberação

- Importar fixture local curta e longa.
- Cortar, dividir, acelerar, legendar, aplicar template e exportar.
- Cancelar no início, no meio e próximo do fim.
- Reabrir o projeto depois de salvar e repetir a exportação.
- Conferir duração, resolução, áudio, legendas e transições no arquivo final.
- Testar desktop largo, desktop estreito e viewport móvel; conferir teclado, foco, overflow e `prefers-reduced-motion`.
- Medir seek, memória e tempo de exportação em uma máquina de referência antes de publicar uma promessa de desempenho.

Não foi executada exportação audiovisual real nesta sessão porque isso exige um arquivo local e um navegador com WebCodecs. O código está preparado para o teste; os itens de mídia permanecem pendentes de evidência real.
