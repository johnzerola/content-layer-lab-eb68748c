# ANALOGUE CHATSCENE — Benchmark de render

Medido no navegador do ambiente (Chromium sem placa de vídeo dedicada), com a
conversa de demonstração (grupo de 4 pessoas, 8 mensagens) e 10 segundos de
vídeo em cada formato. Números de referência para comparar caminhos, não
promessa de desempenho na máquina do usuário.

## Desenho do quadro (Canvas 2D, sem codificar)

| Formato | Quadros | Tempo total | Quadros por segundo |
| --- | --- | --- | --- |
| 720×1280 · 30 | 300 | 0,32 s | 934 |
| 1080×1920 · 30 | 300 | 0,53 s | 567 |
| 1080×1920 · 60 | 600 | 0,88 s | 683 |

## Exportação completa (desenho + WebCodecs + MP4)

| Formato | Quadros | Tempo total | Quadros por segundo | Arquivo |
| --- | --- | --- | --- | --- |
| 720×1280 · 30 | 300 | 2,3 s | 128 | 0,26 MB |
| 1080×1920 · 30 | 300 | 4,3 s | 70 | 0,51 MB |
| 1080×1920 · 60 | 600 | 5,6 s | 108 | 0,80 MB |

Leitura simples: 10 segundos de vídeo em Full HD saem em cerca de 4 segundos,
sem servidor, sem fila e sem custo por exportação.

## Fidelidade

| Verificação | Resultado |
| --- | --- |
| Mesmo quadro desenhado duas vezes | 0 diferenças |
| Prévia (tela) contra exportação (fora da tela) | 2 amostras de ~2.080 com diferença ≤ 3 níveis (suavização de borda) |

O que o usuário vê na prévia é o que sai no arquivo.

## Caminhos comparados

| Caminho | Situação | Por quê |
| --- | --- | --- |
| Canvas 2D + WebCodecs (atual) | escolhido | roda na máquina do usuário, mais rápido que tempo real, sem servidor de render e sem custo por vídeo |
| Remotion | referência de composição | excelente para composição declarativa, mas o render confiável pede um servidor com navegador headless — custo e fila que o produto ainda não precisa |
| Mediabunny / WebCodecs direto | avaliado | é o mesmo motor de codificação que já usamos por baixo; não traria ganho neste momento |

Decisão: seguir com o desenho próprio em Canvas 2D. O contrato
`ConversationRenderer` continua abstrato, então trocar o motor depois não
mexe no documento, na interface nem no ritmo da conversa.

## Como repetir a medição

Com o aplicativo rodando, abrir /chatscene e, no console do navegador, importar
`renderer.ts` e `encode-frames.ts` e repetir o laço de quadros dos formatos
acima. Os scripts usados ficaram fora do repositório por serem de uso pontual.
