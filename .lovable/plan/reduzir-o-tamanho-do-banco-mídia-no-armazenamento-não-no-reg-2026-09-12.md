# Reduzir o tamanho do banco: mídia no armazenamento, não no registro

## O que a auditoria mostrou (números reais, só leitura)

O banco está com cerca de 3,7 GB, mas **a maior parte não é dado útil**:

| Onde | Tamanho | O que é |
|---|---|---|
| Histórico de templates | ~3,65 GB | Espaço ocupado por versões **já apagadas** que o banco ainda não liberou. O conteúdo vivo são 5.281 versões de ~3,5 KB cada = ~18 MB |
| Templates | ~34 MB | Imagens coladas dentro do registro (logos, fundos) — 6 templates passam de 1 MB, o maior tem 5 MB |
| Projetos do editor | ~8,4 MB | 1 projeto com áudio colado dentro do registro; os outros têm ~2 KB |
| Miniaturas de exportações | ~5 MB | 78 de 154 miniaturas estão coladas no registro |

Ou seja: não há vídeos nem trilhas separadas dentro do banco. Vídeos já vão para o armazenamento (`editor-sources`, `posts`) e as trilhas separadas nunca são salvas no banco. O peso real vem de (a) espaço não liberado e (b) imagens/áudios colados como texto.

## O que vai ser feito

### 1. Liberar o espaço morto do histórico de templates
Recuperação do espaço das versões já apagadas. Sozinho, isso devolve cerca de 3,6 GB — mais de 95% do problema. A tabela fica brevemente bloqueada durante a operação.

### 2. Parar de colar mídia nova dentro do banco
Criar um armazenamento privado `assets` e um utilitário único de envio. A partir daí:
- imagens de template (logo, fundo, imagem de camada) sobem para o armazenamento e o template guarda só o endereço;
- áudio do editor (narração, gravação, música) sobe para o armazenamento em vez de virar texto de 20 MB;
- miniaturas de exportação sobem como arquivo e a exportação guarda só o endereço.

O que já está salvo continua abrindo normalmente: quem lê aceita tanto endereço quanto o formato antigo colado.

### 3. Mover o que já está colado
Rotina única, executada por conta logada e em lotes pequenos, que percorre templates, projetos e exportações, envia a mídia colada para o armazenamento e regrava o registro só com o endereço. Idempotente: registro já migrado é ignorado. Depois disso, liberar o espaço dessas tabelas também.

## Detalhes técnicos

- Novo bucket privado `assets`, limite por arquivo 50 MB, políticas RLS por `auth.uid()` como primeiro segmento do caminho (mesmo padrão de `editor-sources`).
- Novo módulo `src/lib/media-store.ts`: `uploadDataUrl(kind, id, dataUrl)` → caminho; `resolveMediaUrl(pathOrDataUrl)` → URL assinada com cache; tolera falha e cai de volta no comportamento atual.
- Pontos de escrita a ajustar: `src/components/TemplateEditor.tsx` (`fileToDataUrl`), `src/components/vtemplate/BrandKitPanel.tsx`, `src/components/editor/AudioPanel.tsx`, `src/components/editor/VoicePanel.tsx`, `src/routes/editor.tsx` (`blobToDataUrl`), `src/lib/render.ts` e `src/lib/editor/cuts.ts` (miniaturas) e `logExports` em `src/lib/cloud.ts`.
- Pontos de leitura a ajustar para resolver endereço: desenho do template (`src/lib/draw.ts`), `ResultLibrary.tsx`, carregamento de áudio do editor.
- Migração: script server-side por lotes de 5 registros, com log de sucesso/falha, sem apagar nada antes do envio confirmado.
- Recuperação de espaço via `VACUUM FULL` em `template_versions`, `templates`, `projects` e `exports`, fora de transação, um por vez.
- Sem mudança de layout, de regras de negócio, do Cleaner IA ou do Editor V2.

## Ordem de execução

1. Recuperar espaço do histórico (ganho imediato de ~3,6 GB).
2. Criar bucket + utilitário + gravação nova apontando para o armazenamento.
3. Migrar a mídia já colada e recuperar o espaço restante.
4. Conferir contagens finais e relatar o tamanho antes/depois.
