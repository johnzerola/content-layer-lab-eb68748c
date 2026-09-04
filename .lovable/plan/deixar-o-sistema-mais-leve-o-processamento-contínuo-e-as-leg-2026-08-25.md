# Deixar o sistema mais leve, o processamento contínuo e as legendas confiáveis

Três frentes: desempenho da tela principal, processamento que sobrevive à navegação, e legendas com IA funcionando + prévias visíveis.

## 1. Desempenho (lentidão geral)

A tela inicial hoje é um único componente com ~2.900 linhas e dezenas de estados; qualquer mudança (progresso, slider, cue de legenda) re-renderiza a página inteira, inclusive as prévias em canvas.

- Quebrar a home em blocos independentes (fila de vídeos, painel do template, painel de legendas, barra de processamento) e isolar o estado de cada um, para que o progresso do lote não re-renderize o editor.
- Memoizar os cards da fila e passar apenas o item, evitando recriar callbacks por render.
- Carregar sob demanda (lazy) os módulos pesados: estúdio de vídeo, estúdio de corte, galeria de legendas, limpeza IA.
- Trocar atualizações de progresso "a cada frame" por atualização com intervalo (throttle) e escrever progresso em ref + tick controlado.
- Pausar os loops de `requestAnimationFrame` das prévias quando o canvas não está visível na tela.

## 2. Processamento não pode parar ao sair da tela

Hoje toda a fila e o controle do lote vivem no estado do componente da home: ao navegar para outra ferramenta, o componente desmonta e o trabalho é perdido.

- Mover fila, progresso e controle (rodando/pausado/cancelado) para um store global fora da árvore de rotas, criado uma única vez.
- Manter render/transcrição vivos ao navegar; ao voltar, a tela apenas lê o estado atual.
- Persistir a fila e resultados em IndexedDB (arquivos e status), com retomada automática ao recarregar a página.
- Indicador global de progresso no cabeçalho/dock, visível em qualquer rota, com pausar/cancelar e link para voltar ao lote.
- Aviso ao fechar a aba enquanto houver render em andamento.

## 3. Legendas: IA "offline" e qualidade

O botão "Gerar legendas" chama uma função de servidor protegida por autenticação; qualquer falha (sessão expirada, 401, 402, 429) hoje vira uma mensagem genérica no painel. A causa exata ainda não está confirmada — o primeiro passo é diagnosticar.

- Diagnóstico: registrar o código de status real da chamada e mostrar mensagem específica (sessão expirada → pedir login; sem créditos; limite de uso; áudio recusado).
- Sessão: revalidar/renovar o token antes de transcrever e repetir a chamada uma vez em caso de 401, em vez de falhar direto.
- Robustez: repetir automaticamente trechos que falharem (até 2 tentativas com espera), transcrever em paralelo limitado (2–3 trechos) para acelerar, e concluir com resultado parcial em vez de descartar tudo quando só alguns trechos falham.
- Qualidade: segmentar por silêncio com margem maior nas bordas para não cortar palavras, enviar o idioma escolhido, normalizar o áudio antes do envio e distribuir o tempo das palavras pelo tamanho de cada uma (em vez de tempo igual), melhorando o karaokê.
- Estado claro na UI: "ouvindo áudio → transcrevendo x/y → pronto", com botão de cancelar e de tentar novamente.

## 4. Prévia das legendas com o que já existe

- Assim que a transcrição termina, a prévia do CaptionStudio e o palco 9:16 passam a usar as cues reais (hoje isso depende do item selecionado e nem sempre chega).
- Na galeria de templates de legenda, usar as cues reais do vídeo selecionado nas mini-prévias animadas, para comparar estilos com o texto verdadeiro.
- Botão "aplicar e ver no palco" em cada template, com marcação de qual está ativo.
- Linha do tempo de legendas com áudio ligado e navegação sincronizada com a prévia.

## Detalhes técnicos

- Novo store global (arquivo dedicado, fora dos componentes de rota) com assinatura via `useSyncExternalStore`; a home vira consumidora.
- Persistência em IndexedDB com os `File`/`Blob` da fila e metadados (status, clip, cues, template usado).
- `src/lib/captions.ts`: nova fila com concorrência limitada, retry com backoff, retorno parcial e timing por comprimento de palavra.
- `src/lib/transcribe.functions.ts`: manter o schema atual e propagar o status HTTP no erro para a UI classificar.
- Componentes de prévia (`CaptionStudio`, `CaptionTemplateGallery`, `StagePreview`, `LayoutPreview`) passam a receber as cues reais e a pausar animação fora da viewport via `IntersectionObserver`.
- Sem mudanças de tema/design tokens; apenas estrutura, estado e correções.
