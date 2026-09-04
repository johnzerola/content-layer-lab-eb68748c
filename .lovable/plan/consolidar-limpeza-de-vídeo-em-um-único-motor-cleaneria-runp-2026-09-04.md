# Consolidar limpeza de vídeo em um único motor (CleanerIA + RunPod)

## Situação atual (verificado no código)

Existem 3 pontos de limpeza:

| Tela | Arquivo | Estado |
|---|---|---|
| `/limpar-ia` | `src/routes/limpar-ia.tsx` → usa `CleanerIAStudio.tsx` | Completo: máscaras desenhadas à mão, filtros, prévia, histórico de jobs, **Turbo GPU com chunks no RunPod já integrado** |
| `/remover` | `src/routes/remover.tsx` → usa o mesmo `CleanerIAStudio.tsx` | Mesmo motor, fluxo mais direto (sobe → processa → abre no editor) |
| `CleanupStudio` | `src/components/CleanupStudio.tsx` (usado só em `src/routes/index.tsx`) | Versão simples/antiga, 440 linhas, sem orquestração de chunks GPU |

O RunPod (endpoint `km860ju9ded2e0`, protocolo Queue, testado e funcionando) já está ligado ao `CleanerIAStudio` via `startCleanerGpuJob` → `cleaner-chunks.server.ts` → `cleaner-gpu.server.ts`.

## Decisão

O `CleanerIAStudio` é o correto e mais completo. Não vale a pena integrar o RunPod ao `CleanupStudio` — seria duplicar trabalho e manter dois motores divergentes.

## Plano

1. **Motor único**: `CleanerIAStudio` passa a ser o único estúdio de limpeza. Nenhuma mudança na integração RunPod — ela já está certa (secrets server-side, source_url assinada, chunks com overlap).
2. **CleanupStudio (página inicial)**: substituir a versão simplificada por um cartão/CTA que leva ao `/limpar-ia` (ou embutir o próprio `CleanerIAStudio` no modo simples). Remover código morto do motor antigo.
3. **Rotas**: manter `/remover` (fluxo rápido: sobe → processa → editor) e `/limpar-ia` (fluxo completo com histórico), ambas sobre o mesmo componente — sem duplicação de lógica.
4. **Garantir paridade**: conferir que o fluxo `/remover` também oferece o toggle Turbo GPU e respeita plano/créditos do usuário antes de enviar à GPU.
5. **Limpeza**: remover `CleanupStudio.tsx` se ficar sem uso; validar que nenhum link aponta para motor antigo.

## Validação

- Build OK.
- Teste real: subir vídeo de 5s com legenda em `/limpar-ia`, ligar Turbo GPU, confirmar chunks `done` e resultado sem legenda.
- Repetir via `/remover` confirmando chegada ao editor.

## Fora de escopo

Sem mudanças de layout, billing ou no worker RunPod.
