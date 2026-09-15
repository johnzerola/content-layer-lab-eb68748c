# ChatScene — validação de 15/09/2026

> Atualização posterior de 15/09: formatos, páginas no Canvas legado, criação e voz avançaram. Estado vigente e limites em [CREATOR_EXPERIENCE_20260915.md](CREATOR_EXPERIENCE_20260915.md) e [MILESTONE_CONTEXT.md](MILESTONE_CONTEXT.md). O conteúdo abaixo registra a etapa inicial.

Escopo: importação de histórias em texto, contratos experimentais de tempo/páginas e reconciliação das referências. Não aprova reconstrução completa do vídeo nem geração vocal.

## Verificações automatizadas

| Verificação | Resultado | Limite |
|---|---|---|
| ChatScene, `node node_modules/vitest/vitest.mjs run src/lib/chatscene/__tests__ --exclude=.codex/**` | **15 arquivos / 114 testes PASS, saída 0**, 35,32 s | Sem chamadas reais de TTS ou exportação |
| TypeScript, `node node_modules/typescript/bin/tsc --noEmit` | PASS, saída 0 | Não valida browser, provider ou áudio |
| ESLint dos arquivos novos/modificados de ChatScene | PASS, saída 0 | Verificação estática direcionada |
| Build final, `npm run build` | PASS, saída 0 após os ajustes finais | Avisos existentes sobre `inputValidator`, resolução de paths e tamanho de chunks; sem deploy. Log local `output/playwright/chatscene-build-final.log` |
| Suíte da raiz, `node node_modules/vitest/vitest.mjs run --exclude=.codex/**` | 66 arquivos / 465 assertions aprovadas, **processo com erro** | Um erro TLS não tratado, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, associado a `src/lib/__tests__/publishing.test.ts`; saída 1. Não declarar suíte global verde |
| `npm test` sem filtro | FAIL | Também executou a cópia `.codex/worktrees/cleaneria-scene-v3`: quatro falhas nos testes de Cleaner/publicação e um erro TLS. Não representa somente o estado desta raiz |
| `git diff --check` | PASS | Avisos de conversão LF/CRLF, sem defeito de whitespace |

A execução filtrada durou 133,12 s. A execução inicial que incluiu worktrees registrou 109 arquivos, 732 testes, quatro falhas e um erro não tratado. Nenhum certificado foi ignorado e nenhum módulo de publicação/Cleaner foi alterado para maquiar o resultado.

Os novos testes cobrem duração medida versus estimada, instante exato de início/fim de fala, retorno no tempo, estado imutável, reset editorial e de sessão, overflow na quinta mensagem, sete mensagens curtas que cabem juntas, mídia maior que o espaço, orçamento inválido, IDs duplicados, recusa de velocidade ainda não suportada, segmentação sem perda de palavras, URL de atribuição, adição sem apagar mensagens e roundtrip completo do narrador/fonte.

## Browser e interface

Harness local em `output/playwright/chatscene-reddit-smoke.html`, servido por Vite isolado em 8092. Importa o **componente real**, o importador, serialização e `useProjectHistory` existentes; não chama backend/TTS nem modifica autenticação. Não é screenshot da rota autenticada completa.

| Cenário exercitado | Resultado |
|---|---|
| Revisar formulário vazio | PASS: alerta legível, nenhuma mensagem adicionada |
| Texto original → revisão de seis blocos → adicionar | PASS: cinco mensagens existentes viraram 11; nenhuma original foi removida |
| Desfazer / refazer pelos controles do histórico | PASS: 11 → 5 → 11 |
| Fonte com query de rastreamento | PASS: URL canônica persistida, query removida, nenhuma busca remota |
| Narrador ao salvar/reabrir | PASS: perfil explícito, roundtrip semanticamente idêntico no navegador e igualdade profunda em teste |
| Teclado: Enter para revisão, Enter para editar, Tab + Enter para adicionar | PASS: foco vai a Editar texto, volta ao título e alcança a ação de adicionar |
| Larguras 1440 / 1366 / 390 px | PASS no painel exercitado; inspeção visual realizada; sem overflow horizontal em 1366/390 |
| Contraste de texto pequeno | Ajustado: números e modo selecionado usam tokens de texto legíveis; violeta continua nos ícones/bordas. Texto secundário observado `rgb(161,170,186)` |
| Console do harness após a recarga | Zero erros e zero warnings nas rodadas finais. O log do servidor registrou um `createRoot` duplicado durante hot reload do próprio harness; a recarga de página eliminou o estado transitório. Não foi erro da rota do produto |
| Rota real `/chatscene` em 8091 | AuthGate exibido; sessão autenticada não disponível no navegador isolado. Smoke autenticado UNDETERMINED |

Screenshots locais, ignorados pelo Git: `output/playwright/reddit-story-review-desktop.png`, `reddit-story-review-mobile.png`, `reddit-story-review-1366.png` e `reddit-story-review-1366-final.png`. Os controles sem acabamento no lado direito pertencem ao harness de teste; não são UI adicionada ao produto.

Ao terminar, o servidor auxiliar 8092 foi encerrado. O servidor do aplicativo em `http://127.0.0.1:8091/chatscene` permaneceu disponível e respondeu HTTP 200; o login continua necessário.

## Layout Canvas real do piloto

Executado no navegador após `document.fonts.ready`, usando `originalReferenceStory`, tema Zap escuro, Canvas 1080×1920, largura de chat 940 e orçamento de conteúdo 1000. São dimensões de teste, não geometria aprovada da referência.

- Duração compilada: **34.580 ms**, com durações sintéticas declaradas na fixture.
- 11 mensagens, três personagens, uma imagem com `mediaAspect=1.5` e um cartão editorial.
- Páginas: **5 / 1 / 5** mensagens; alturas **921 / 91 / 438 px**; motivos START / HEIGHT_THRESHOLD / EDITORIAL.
- Zero mensagens perdidas, zero overflow nesta configuração.
- Altura do adapter igual à chamada direta de `layoutMessages` em todas as páginas.
- No instante do cartão, a página começa em `original-6`.

Isso valida uso de medição real pelo compilador. Não valida pixels de uma exportação V3, pois o piloto ainda não é consumido pelo renderer. A fixture não contém arquivo de imagem real nem falas geradas; a proporção declarada é suficiente somente para este teste de layout.

## Gates ainda abertos

Preview/export nos mesmos frames de fronteira; áudio real e sincronismo; runtime de velocidade/pitch; mídia carregada, GIF/vídeo/áudio; temas claro/escuro e proporções 9:16/16:9/1:1 no renderer integrado; grupos de cinco ou mais participantes; reprodução temporal contínua. Esses itens pertencem à etapa seguinte e ficam **UNDETERMINED**, sem nota visual inventada.

Não houve publicação, nova dependência, inferência GPU ou geração TTS paga nesta rodada. A entrada Reddit usa narrativa em balões; cartão dedicado de post, legendas fora do chat e importação por API ainda não estão implementados.
