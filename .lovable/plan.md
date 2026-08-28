# Acabar com a lentidão extrema depois de editar (corte + layout)

## O que está causando as horas de processamento

Achado principal, confirmado no código de desenho (`src/lib/draw.ts`):

Os layouts com fundo preenchido (`blur`, `spotlight`, `centered`, `split`) desenham, **em cada quadro**, o vídeo inteiro uma segunda vez com um desfoque gigante aplicado pelo canvas (`filter: blur(34px)` em cima de um frame 1080x1920). Esse é um dos filtros mais caros que existe em canvas: sozinho pode custar centenas de milissegundos por quadro. Em um vídeo de 1 minuto a 30 fps são ~1800 quadros — daí "horas".

Ou seja: não é o corte que pesa, é o **fundo desfocado do layout** sendo recalculado 30 vezes por segundo, sempre em resolução cheia, mesmo quando o fundo praticamente não muda entre quadros.

Fatores secundários que somam:
- Cada quadro desenha a fonte duas vezes (fundo + vídeo em contain), ambos em resolução final.
- O corte multi-trecho (remover silêncio) força reposicionamentos no decodificador; hoje isso não é medido, então não dá para saber quanto custa de verdade.

## O que vou fazer

### 1. Fundo desfocado em cache e em baixa resolução (ganho principal)
- Gerar o fundo desfocado em um canvas auxiliar pequeno (cerca de 1/4 da resolução final) e ampliá-lo na saída. Desfoque em imagem pequena custa uma fração do custo e o resultado visual é praticamente idêntico, porque o fundo já está borrado.
- Reaproveitar esse fundo por um intervalo curto (~0,15 s de vídeo) em vez de recalcular a cada quadro; ele só é regenerado quando a imagem realmente mudou o suficiente.
- Vale para `blur`, `spotlight`, `centered` e `split`, e também para o desfoque de bordas/plate.
- Expectativa: quadros que hoje custam centenas de ms passam à casa de poucos ms.

### 2. Não desenhar o que não aparece
- Quando o vídeo em primeiro plano cobre toda a área (layout `fill`, ou zoom que já preenche a caixa), pular o fundo por completo.
- Reutilizar o filtro base (brilho/saturação) em vez de remontar a string de filtro por quadro.

### 3. Medir de verdade e degradar sozinho
- Registrar tempo médio por quadro e por etapa (decodificar, desenhar, codificar) e mostrar no dock: caminho em uso + fps real.
- Se o desenho ficar abaixo de um limite (por exemplo, menos de 8 fps de renderização), reduzir automaticamente a qualidade do fundo (menos atualizações, escala menor) e avisar na interface, em vez de deixar o usuário esperando horas sem explicação.

### 4. Corte multi-trecho
- Instrumentar os reposicionamentos do decodificador para saber quanto custam com "cortar pausas" ativo, e agrupar trechos próximos para evitar reposicionamento desnecessário quando o salto é pequeno.

### 5. Validação
- Script de benchmark local: mesmo vídeo de ~20 s exportado com layout `fill` e com layout `blur`, antes e depois, comparando tempo total e ms/quadro.
- Conferir visualmente um quadro exportado com fundo desfocado antes/depois para garantir que a aparência não mudou.
- Rodar typecheck, testes e build.

## Detalhes técnicos
- Arquivos afetados: `src/lib/draw.ts` (cache de fundo, escala reduzida, pular fundo oculto), `src/lib/encode-core.ts` e `src/lib/encode.ts` (telemetria por etapa, degradação automática), `src/lib/render-pool.ts` e `src/components/BatchProgressDock.tsx` (exibir fps/caminho real), `src/lib/preedit.ts` (agrupar trechos próximos).
- O cache do fundo é por instância de desenho (canvas de saída), então workers em paralelo não compartilham estado.
- Nada muda no formato do template nem nos projetos já salvos.
