# Fase 1 — preservação de pixels

Implementação experimental local, autorizada em 10/09/2026. Não altera os padrões
do site, não publica frontend e não cria capacidade RunPod.

## Alterações

- `PROPAINTER_PRESERVE_PIXELS=1` ativa entrada PNG e saída PNG do ProPainter
  oficial. Os modelos, pesos, máscaras de remoção e decisões temporais continuam
  os mesmos. O padrão permanece `0` enquanto a comparação é avaliada.
- Recortes abaixo do limite espacial recebem padding à direita/embaixo até
  múltiplos de oito. O conteúdo não é esticado. A borda replica imagem e máscara
  para não apresentar texto de uma borda como referência limpa.
- A saída PNG é validada (sequência, contagem, dimensões, tipo), recortada
  exatamente e empacotada em H.264 RGB sem perdas. Não há fallback silencioso
  para o MP4 com perdas do upstream se faltarem PNGs.
- Limites de resolução e tentativas por OOM continuam explícitos no relatório
  `pixels.json`. O teste desta fase rejeita resultados com redução espacial.
- O workspace por tentativa tem orçamento conservador de 2 GiB, verificação de
  espaço livre e limpeza dos PNGs de entrada/saída em sucesso, erro e cancelamento.
  Tempo de preparação/empacotamento participa do timeout. Interrupções do runner
  também encerram o processo GPU.
- `pixel_composite.py` compõe o master em RGB com validação estrita. Pixels fora
  da máscara mantêm exatamente os valores decodificados do original. Máscaras
  suaves preservam seus pesos; não há blur, sharpening ou transição nova.
- O validador monta as cenas sem perdas e exporta variantes CRF 16/14/12 a partir
  do mesmo master, cada uma com uma única codificação com perdas. Controles sem
  inpainting isolam o erro da exportação.

O upstream ainda escreve seus dois MP4s de visualização: eles são descartados
com o workspace temporário e não alimentam a composição. Há custo local de CPU
e disco para escrevê-los; não foi alterado o código de terceiros nesta fase.

## Reprodução

```powershell
python backend/scripts/validate_pixel_preservation.py `
  G:/dowloand/teste/resultado-automatico-v3-20260909 `
  G:/dowloand/teste/NOVA-PASTA-FASE1
```

O destino deve ser novo. O teste aceita somente amostra v3 de até cinco segundos,
verifica SHA-256 dos resultados aprovados e compara todos os pixels das entradas
em cache com o vídeo v3 antes de inferir. Executa na instalação local
`G:/cleaneria-runtime`; não lê credenciais da nuvem. Criar `cancel.flag` no destino
interrompe a inferência. A limpeza automática cobre arquivos temporários do motor;
masters, checkpoints e comparações desta validação são retidos para revisão.

## Limites da conclusão

O A/B reutiliza a entrada v3 já recodificada durante a extração antiga. Não afirma
recuperar essa perda anterior. O caminho novo de validação não introduz outra
compressão na preparação, nas saídas do modelo ou na montagem.

O teste sintético de legenda sobre fundo conhecido valida preservação e composição
com reconstrução conhecida; não mede acurácia da IA em fundos desconhecidos.
PSNR é calculado para fidelidade de exportação. O Vmake não é ground truth e tem
diferença temporal, especialmente perto dos cortes. Não usar índices iguais de
cenas diferentes para atribuir superioridade.

O flag do adaptador muda somente seu I/O. A rota completa de uma codificação final
está no validador. O pipeline distribuído ainda tem corte/trim/concat com formatos
anteriores; não ativar o flag globalmente alegando preservação completa da rota
Hostear/RunPod. Essa integração e publicação exigem a validação operacional
prevista no plano, após selecionar o candidato.

## Resultado

Execução concluída em
`G:/dowloand/teste/resultado-fase1-preservacao-b-20260910/comparison.html`.
São 147 quadros, 1080×1920, 30 FPS e 4,9 segundos. As três exportações decodificaram
integralmente; o payload de áudio permaneceu idêntico ao da entrada
(`3246b231380522a605b695890c460eb34c4d029963fe850fd530ff56018b1b82`).

| Cena | Conteúdo do recorte | Entrada com padding | Redução / tentativa OOM |
| --- | --- | --- | --- |
| Janela | 762×294 | 768×296 | Nenhuma / nenhuma |
| Fivela | 678×294 | 680×296 | Nenhuma / nenhuma |
| Tecido | 820×294 | 824×296 | Nenhuma / nenhuma |

**Zero pixels externos alterados no master**, verificado em todos os quadros.
As medidas abaixo comparam cada exportação ao mesmo master, separando a área
removida do restante do vídeo. Não medem acurácia do inpainting.

| Exportação | Tamanho (MiB) | PSNR dentro da máscara | PSNR fora da máscara |
| --- | --- | --- | --- |
| CRF 16 | 1,826 | 43,00 dB | 45,21 dB |
| CRF 14 | 2,348 | 43,31 dB | 45,81 dB |
| CRF 12 | 2,933 | 43,57 dB | 46,38 dB |

O master tem 69.506.980 bytes. CRF 12 ocupa cerca de 25% a mais que CRF 14,
com ganho pequeno de fidelidade de exportação. CRF 14 é uma escolha provisória
de tamanho/fidelidade para a comparação, **não uma aprovação da reconstrução**.
O MP4 usa YUV420; conversão de cor/subamostragem e compressão ainda introduzem
erro fora da máscara. O controle sem inpainting é medido separadamente no
manifesto: não afirmar que a entrega inteira é pixel a pixel idêntica ao original.

### Avaliação visual e decisão

Revisados 15 quadros nas três cenas, com referência temporal estimada por uma
região acima da legenda. O arquivo de referência tem 146 quadros e FPS médio
29,8295, diferente da entrada. Os detalhes usam correspondências registradas em
`alignment.json`, evitando comparar cenas diferentes perto dos cortes.

- Janela: resultado semelhante; a emenda no quadro 73 permanece.
- Fivela: **regressão local no quadro 85**, com contorno mais curvo/deformado
  do que na v3. Padding muda a entrada da rede e pode mudar a reconstrução,
  mesmo preservando rigorosamente os pixels antes da inferência.
- Tecido: a faixa com pouca textura persiste, principalmente nos quadros 115–140.
  Não há evidência de superioridade consistente sobre a v3.

**Decisão: manter o padrão atual.** A fase 1 confirma o ganho de preservação na
infraestrutura de I/O, mas o candidato combinado não foi aprovado para substituir
a versão anterior. Não atribuir um novo percentual de qualidade. A avaliação
contínua em movimento continua pendente; as conclusões visuais são dos quadros
amostrados. Máscaras, junções e reconstrução de textura seguem no escopo das
fases 2/3, sem implementação automática nesta entrega.

### Verificação e recursos

- Suíte geral: 192 testes passaram, 1 pulado. Após os ajustes finais de limpeza
  e testes, os 12 testes focados do adaptador/preservação passaram.
- Testes incluem pixels/cores exatos, FPS fracionário, padding de borda com texto,
  máscara vazia, legenda sintética com fundo conhecido, sequência incompleta,
  orçamento de disco, cancelamento e limpeza após falha, OOM e sucesso.
- Execução completa: 543,43 segundos, incluindo validações e seis exportações
  (três candidatos e três controles). Chamadas do modelo com preparação/I/O:
  219,74 segundos. Estes tempos locais não são preço ou tempo de RunPod.
- RTX 2060 local. Nenhum recurso RunPod foi criado: US$ 0 de cobrança RunPod
  adicional por este teste. Eletricidade e desgaste local não foram medidos.
- Ao terminar: zero processos `inference_propainter.py` e zero diretórios
  temporários `pixels-*`. Checkpoints e resultados de revisão ocupavam cerca
  de 256,4 MiB; são retidos deliberadamente para inspeção.

O teste anterior em `resultado-fase1-preservacao-20260910` parou após a primeira
cena por ausência de `temporal_window` em relatórios antigos. O validador passou
a usar o limite legado de 32 quadros nesses caches. A execução completa em
`resultado-fase1-preservacao-b-20260910` refez as três cenas; não reutilizou saída
parcial como se fosse uma comparação completa.
