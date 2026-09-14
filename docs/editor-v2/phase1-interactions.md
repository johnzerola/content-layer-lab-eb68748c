# Editor V2 — interações da Fase 1

## Seleção

Um clique seleciona um item. `Shift` + seleção adiciona ou remove o item da seleção múltipla. A seleção via Library usa o mesmo `SelectionState`; ao inserir, o novo clipe vira a seleção principal. `Esc` limpa a seleção.

## Library e inserção

O botão **Inserir** e o drag/drop criam o mesmo comando. No canvas, o item entra na posição atual da agulha. Na timeline, entra no tempo correspondente ao ponto de drop. Tipo do recurso decide uma trilha compatível: legenda, vídeo, overlay, música ou SFX. Recursos que exigem contexto, como uma transição, não criam um clipe falso.

## Canvas

Arrastar o objeto altera `x/y`; o handle inferior direito altera largura e altura. Durante o gesto existe apenas um draft transitório; no pointer-up uma única `UpdateClipCommand` registra o resultado. Centro e limites seguros oferecem snapping visual. Inspector e canvas leem a mesma transformação.

## Timeline

O ruler posiciona a agulha. Arrastar um clipe muda seu início; as bordas fazem trim. **Dividir** corta a seleção principal na agulha. **Ajuste** aproxima a operação de frames e bordas de outros clipes. **Ripple** fecha ou abre espaço nas operações suportadas. Zoom altera pixels por segundo e a área mantém rolagem horizontal.

## Estados e recuperação

- projeto vazio: canvas orienta a começar pela Library;
- Library sem resultado: sugere mudar busca/filtro;
- operação incompatível: mantém o documento e explica o contexto necessário;
- comando inválido: erro aparece no status inferior;
- qualquer alteração persistente suportada pode ser desfeita/refeita;
- exportação futura aparece desabilitada, sem prometer funcionamento inexistente.

## Responsividade

Acima de `lg`, Library, canvas, inspector e timeline coexistem e redimensionam. Abaixo de `lg`, uma barra troca entre as quatro áreas. A timeline conserva sua largura de trabalho dentro de rolagem própria; o documento não cria overflow horizontal na página.
