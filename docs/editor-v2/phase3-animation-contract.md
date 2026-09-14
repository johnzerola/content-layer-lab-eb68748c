# Editor V2 — contrato de animação e transições

## Tempo dos keyframes

Keyframes pertencem ao clipe e usam segundos locais a partir do início dele. Mover o clipe preserva a animação. Trim limita pontos ao novo intervalo. Split mantém os pontos anteriores no clipe esquerdo e desloca o tempo local dos pontos posteriores para o clipe direito.

As propriedades animáveis nesta fase são posição X/Y, escala, rotação e opacidade. Largura e altura continuam estáticas para evitar interpolação ambígua durante a primeira integração.

## Interpolação

O resolvedor suporta `linear`, `easeIn`, `easeOut` e `easeInOut`. Uma propriedade sem keyframes usa o valor estático. Antes do primeiro ponto e depois do último, o valor é mantido. O cálculo usa tempo contínuo e não depende do FPS.

Editar o canvas ou o inspector em uma propriedade já animada cria ou atualiza o ponto no tempo corrente. O arraste de um keyframe na timeline gera um único comando ao soltar, preservando undo/redo.

## Transições

Uma transição liga dois clipes consecutivos da mesma trilha. O contrato contém tipo, duração, easing, parâmetros e fallback `cut`. A duração não pode superar metade do menor clipe envolvido. Remover qualquer clipe também remove suas transições.

O preview e `createEditorRenderManifest` usam os mesmos dados e `resolveCompositionFrame`. A implementação inicial resolve dissolve, slide e zoom; o manifest preserva tipos adicionais para adaptadores de exportação posteriores.

## Canvas acessível

- setas movem o item em 1%; `Shift` usa 5%;
- a alça de tamanho aceita setas, com `Shift` para passos maiores;
- a alça de rotação aceita setas, com `Shift` para 15°;
- movimento, resize e rotação por ponteiro só registram o comando no final do gesto;
- foco, seleção e handles não dependem apenas de cor.
