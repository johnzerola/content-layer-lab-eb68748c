# Lote mais rápido, nomes escolhidos por você e headlines personalizadas

Três frentes no painel do ViralBatch: velocidade do processamento, controle dos nomes de arquivo e variação real de headline por vídeo.

## 1. Processamento em lote mais rápido

Hoje o lote roda com concorrência 1 por padrão (um vídeo por vez) e cada atualização de progresso atualiza a fila inteira.

- Concorrência automática: sugerir e aplicar por padrão um número de vídeos simultâneos baseado no hardware (metade dos núcleos, limite 4), com o controle manual continuando disponível.
- Preparar o próximo vídeo enquanto o atual ainda renderiza (leitura de metadados/poster e transcrição adiantada), para não haver tempo ocioso entre itens.
- Reaproveitar a transcrição já feita: quando o mesmo vídeo gera várias plataformas/variações, transcrever uma única vez (já é assim) e não re-decodificar áudio a cada variação.
- Atualizar progresso com intervalo controlado (a cada ~150 ms) em vez de a cada quadro, e atualizar só o item afetado — a fila e as prévias param de re-renderizar durante o render.
- Perfil "Turbo": preset opcional que baixa fps/bitrate e desliga efeitos custosos para lotes grandes, com estimativa de tempo mostrada antes de começar.
- Pausar a prévia em canvas enquanto o lote roda (a CPU vai toda para a exportação).

## 2. Renomear arquivos antes de processar e baixar

- Campo de nome editável em cada item da fila (clique no nome para editar), guardado junto do item.
- Barra de renomeação em massa acima da fila com padrão por tokens: `{nome}`, `{indice}`, `{data}`, `{template}`, `{plataforma}`, `{variacao}` — por exemplo `promo-{data}-{indice}`. Botão "aplicar a todos" e "aplicar aos selecionados", com prévia do resultado.
- Ações rápidas: numerar sequencialmente, remover acentos/espaços, prefixo/sufixo.
- O download individual, o ZIP e o "salvar em pasta" passam a usar o nome escolhido; quando não houver nome personalizado, mantém a regra atual de cada fluxo. Nomes duplicados ganham sufixo automático para não sobrescrever.

## 3. Headline personalizada por vídeo (nada sai igual)

- Painel "Headlines do lote": lista todos os vídeos com o texto da headline de cada um, editável na mesma tela (sem precisar abrir vídeo por vídeo).
- Banco de variações: você escreve várias versões da headline (uma por linha) e o sistema distribui entre os vídeos em rodízio, sem repetir enquanto houver opções.
- Variação automática opcional por vídeo: pequenas mudanças controladas em cima da headline base (posição vertical, tamanho, quebra de linha, caixa alta/normal, emoji do fim) para que nenhum vídeo saia idêntico — respeitando o estilo do template.
- Sugerir headline com IA a partir da transcrição do vídeo, com botão "aplicar a este" ou "gerar para todos".
- Prévia imediata no palco 9:16 ao editar, e marcação na fila de quais vídeos já têm headline própria.

## Detalhes técnicos

- `src/routes/index.tsx`: adicionar `outName?: string` e `headlineVariant` ao tipo `Item`; concorrência padrão calculada de `navigator.hardwareConcurrency`; progresso via ref + tick throttled; pré-carregamento do próximo item na fila.
- `src/lib/flows.ts` (`outputName`): aceitar nome personalizado do item e um padrão com tokens; dedupe de nomes na montagem do ZIP.
- Novo `src/lib/naming.ts`: expansão de tokens, sanitização e numeração.
- Novo componente de painel de headlines em massa (lista + editor + banco de variações), reutilizando o `StagePreview` existente.
- `src/lib/variation.ts` / `src/lib/render.ts`: aplicar a variação de headline (posição/tamanho/caixa) junto com a variação anti-duplicidade já existente.
- Sugestão de headline via IA usando o gateway já configurado, em server function autenticada.
- Sem mudanças de tema ou tokens de design.
