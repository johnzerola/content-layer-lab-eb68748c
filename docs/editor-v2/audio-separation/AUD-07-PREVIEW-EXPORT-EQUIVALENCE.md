# AUD-07 — equivalência entre prévia e exportação

Data: 14/09/2026

Estado: **BROWSER_MP4_EXPORT_PASS / SERIALIZED_RESOLVER_PASS**

## Entrega

O Editor V2 agora congela o documento em um manifest JSON e usa esse mesmo contrato para resolver vídeo, elementos, legendas e áudio na exportação. O render reconstrói o projeto uma vez, aplica os mesmos intervalos, velocidade, transforms, animações, efeitos, filtros, mute, solo, ganho, fades, envelopes e ducking usados pela prévia e gera MP4 no navegador.

O áudio é decodificado dos assets ativos, misturado em blocos de 128 amostras e codificado em AAC estéreo a 48 kHz. Um limitador comum reduz o pico somente quando a soma ultrapassa 0 dBFS, preservando a relação entre canais. Se o navegador não puder codificar o áudio necessário ou se faltar um asset ativo, a exportação falha explicitamente; ela não entrega silenciosamente um vídeo mudo.

O botão **Exportar** está ativo, mostra progresso real, aceita cancelamento e baixa o arquivo com nome seguro. A música silenciada não volta ao mix e o áudio embutido não toca junto com a representação extraída ou separada.

## Validação automatizada

- Manifest serializado e projeto vivo produzem o mesmo frame visual.
- Manifest serializado e projeto vivo produzem as mesmas camadas de áudio nas representações embutida, extraída e separada.
- Um teste mantém Diálogo audível enquanto Música está muda.
- A reconstrução do manifest preserva grupos e roteamento de áudio.
- A migração durável exige os dois stems e o prefixo privado pertencente ao job antes de aceitar `completed`.

## Smoke no Chrome

O script `scripts/editor-v2-export-qa.mjs` importou uma fixture MP4 H.264 com AAC, recarregou o projeto e a mídia persistida, acionou o botão de produção e capturou o download.

Resultado FFprobe de `output/playwright/editor-v2-export/editor-v2-browser-export.mp4`:

| Propriedade | Resultado |
|---|---:|
| vídeo | H.264, 360×640, 15 fps |
| duração do vídeo | 2,000 s |
| áudio | AAC, 48 kHz, 2 canais |
| duração do áudio | 2,005 s |
| duração do arquivo | 2,005 s |
| pico | −16,75 dBFS |
| RMS | −21,12 dBFS |
| erros de console | 0 |

O áudio final é mensuravelmente audível. O primeiro quadro exportado coincide com a fixture sintética roxa usada na entrada. Evidências: `output/playwright/editor-v2-export/export-complete.png` e `first-frame.png`.

## Limites restantes

Este smoke prova o arquivo final, o mux e o caminho de download. Ainda falta uma rodada autenticada dentro da interface depois que a migração `audio_separation_jobs` estiver aplicada no Supabase remoto. A escuta do VMAKE continua sendo evidência perceptual do separador, não teste com ground truth. Vídeos longos, codecs recusados pelo navegador e operação em lote pertencem à AUD-08.
