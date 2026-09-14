# Comparação de UX

## Diagnóstico do editor atual

A inspeção estática mostra bons blocos isolados, mas uma experiência fragmentada:

- `TimelinePro` já tem trilhas, seleção aditiva, trim, zoom, snapping básico, waveform e volume, porém as operações chegam por callbacks diferentes e não formam uma transação de projeto.
- `EditorProjectDoc` guarda `preedit`, `composition` e `audio` como subdocumentos; captions, canvas e timeline podem divergir.
- `AudioPanel` pode persistir stems como data URL, o que aumenta o documento e o tempo de salvar.
- Templates e presets existem, mas o contrato de preview precisa ser o mesmo contrato usado para inserir e renderizar.
- Undo/redo é local a superfícies; não há evidência de uma fronteira única para uma edição que cruza canvas, áudio e timeline.

## Padrões transferíveis

| Padrão | Benefício | Risco |
|---|---|---|
| OpenVideo: timeline + canvas sincronizados | reduz surpresa ao arrastar/trimar | WebCodecs/Pixi aumentam complexidade |
| Captiony: atalhos e feedback de playhead | acelera edição repetitiva | precisa foco e labels acessíveis |
| Keyloom: preview real de template | decisão antes de aplicar | render de muitos previews pode pesar |
| Clypra: monitor de performance | torna lentidão explicável | painel não deve competir com edição |
| WaveSurfer: regiões/envelope | áudio compreensível | waveform deve ser cacheada e lazy |

## UX V2 proposta

1. Shell de três zonas: biblioteca contextual, canvas central e inspector; timeline inferior persistente.
2. Barra de ferramentas com estados explícitos: selecionar, cortar, dividir, ripple, snapping, zoom e magnetismo.
3. Inspector mostra apenas propriedades do item selecionado; múltipla seleção exibe operações comuns.
4. Cada ação oferece feedback imediato: preview do resultado, status salvo, erro recuperável e atalho visível.
5. Templates exibem thumbnail/render real, duração, formato, fontes e assets antes de aplicar.
6. Modo compacto e foco no teclado; suporte a `prefers-reduced-motion`, foco visível, ARIA e hit targets grandes.

## Critério de sucesso

Um usuário deve conseguir importar, aplicar template, ajustar legenda, cortar com ripple, alterar volume, salvar, recarregar e exportar sem trocar de fonte de verdade nem reaprender o estado em cada painel.
