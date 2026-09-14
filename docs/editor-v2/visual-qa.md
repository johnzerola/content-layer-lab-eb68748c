# Editor V2 — QA visual da Fase 1

Data: 13/09/2026
Navegador: Google Chrome, execução headless com Playwright.

| Viewport | Evidência | Resultado |
|---|---|---|
| 1440×1000 | `output/playwright/editor-v2-phase1/editor-v2-1440x1000.png` | PASS — quatro regiões visíveis, resize e timeline legível |
| 1920×1080 | `output/playwright/editor-v2-phase1/editor-v2-1920x1080.png` | PASS — canvas mantém foco e inspector ganha espaço |
| 1366×768 | `output/playwright/editor-v2-phase1/editor-v2-1366x768.png` | PASS — operação cabe sem overflow da página |
| 430×932 | `output/playwright/editor-v2-phase1/editor-v2-430x932.png` | PASS — navegação por superfícies e timeline com scroll próprio |

## Fluxo automatizado

1. abriu `/editor-v2` com feature flag;
2. arrastou um modelo da Library para o canvas;
3. confirmou seleção no canvas, timeline e inspector;
4. alterou posição, desfez e refez;
5. aparou o fim do clipe na timeline e desfez;
6. inseriu texto, criou seleção múltipla por teclado, removeu e restaurou;
7. iniciou playback e pausou com Espaço;
8. redimensionou o painel;
9. repetiu abertura/captura nos quatro viewports e verificou overflow;
10. confirmou zero erros no console.

## Inspeção visual

O vídeo permanece no centro da hierarquia. Violeta aparece em seleção, agulha e ações primárias. Painéis usam divisões finas em vez de pilhas de cards. Texto pequeno essencial mantém contraste maior que os metadados. A timeline móvel deliberadamente rola dentro da superfície.

O detector mecânico do Impeccable não encontrou padrões novos nos componentes V2. Três avisos vieram de regras antigas em `src/styles.css` (gradient text e bounce de legendas), fora das linhas adicionadas nesta fase.

## Limites da evidência

As capturas usam presets programáticos e não provam decode de vídeo, sincronização de áudio real, exportação ou persistência remota. Esses fluxos permanecem fora do escopo da Fase 1.
