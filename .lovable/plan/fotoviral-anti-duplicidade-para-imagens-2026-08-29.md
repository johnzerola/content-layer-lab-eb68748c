# FotoViral — anti-duplicidade para imagens

Nova ferramenta para subir fotos em lote, limpar metadados, gravar metadados novos e aplicar edições leves, entregando arquivos únicos prontos para Instagram, TikTok, Facebook e Shorts.

## Fluxo do usuário

```text
Subir fotos (arrastar pasta / seleção múltipla)
        ↓
Escolher preset de plataforma (Feed 1:1, Story/Reels 9:16, Shorts 9:16, Paisagem 16:9)
        ↓
Ajustes globais (intensidade da anti-duplicidade + edição simples)
        ↓
Ajuste individual opcional (recorte, giro, brilho)
        ↓
Processar em lote → prévia antes/depois
        ↓
Baixar tudo (ZIP) ou enviar para o agendamento em massa
```

## O que a ferramenta faz em cada foto

Limpeza de metadados
- Reprocessa a imagem em canvas, o que descarta EXIF, GPS, modelo de câmera, software e perfis originais.
- Reescreve o arquivo como JPEG (ou WebP/PNG) novo, com nome de arquivo aleatório e data de criação atual.

Novos metadados
- Grava um bloco EXIF novo e plausível: fabricante/modelo de celular, data de captura dentro de uma janela escolhida, orientação, software e (opcional) autor/copyright.
- Opção de GPS falso desligada por padrão; quando ligada, o usuário escolhe cidade aproximada.

Anti-duplicidade visual (sutil, com intensidade ajustável)
- Micro-recorte e micro-zoom, rotação de fração de grau, espelhamento opcional.
- Variação leve de brilho, contraste, saturação e temperatura.
- Ruído/grão discreto e leve mudança de nitidez.
- Redimensionamento com dimensões finais levemente diferentes entre cópias e requantização JPEG com qualidade variável (muda o hash perceptual do arquivo).

Edição simples
- Recorte pelos presets de plataforma, giro 90°, ajuste manual de brilho/contraste/saturação.
- Texto opcional (headline/CTA) com as fontes e o estilo já usados no ViralBatch.
- Marca d'água/logo opcional em posição escolhida.

Saída
- 1 ou N variações por foto (útil para postar a mesma imagem em contas diferentes).
- Download individual, ZIP em lote, e envio direto para o agendamento em massa existente.

## Onde entra no app

- Nova rota `/fotos` com card na navegação principal, seguindo o tema escuro neon existente.
- Reaproveita: `PlanGate` para créditos por plano, `BulkScheduleModal` para agendar em massa, `zip.ts` para download em lote e a Biblioteca de resultados.

## Detalhes técnicos

- Processamento 100% no navegador (Canvas + `createImageBitmap`), sem upload obrigatório para servidor — rápido e sem custo de banda.
- Lote com fila e barra de progresso unificada no mesmo padrão do `batch-runtime.ts`, para o usuário poder sair da tela.
- Novos módulos: `src/lib/photo/exif.ts` (escrita do bloco EXIF em JPEG), `src/lib/photo/variation.ts` (curvas de anti-duplicidade), `src/lib/photo/render.ts` (pipeline de canvas), `src/lib/photo/presets.ts` (dimensões por plataforma).
- Novos componentes: `src/components/photo/PhotoBatchStudio.tsx` (grid + lote), `PhotoAdjustModal.tsx` (ajuste individual), integrados na rota `/fotos`.
- Validação de dimensões/proporção por plataforma reutilizando as regras de `platform-media.ts`.
- Testes unitários para escrita/leitura do EXIF gerado e para a variação determinística por semente.
- `head()` próprio na rota com título e descrição específicos da ferramenta.

## Fora do escopo desta etapa

- Remoção de marca d'água de fotos por IA (isso continua sendo do LimpaVídeo).
- Publicação real em plataformas ainda depende das aprovações oficiais já em andamento.
