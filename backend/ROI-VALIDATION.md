# Reconstrução de legendas por região — 09/09/2026

Esta etapa implementa e mede o caminho oficial de inferência. A pesquisa anterior
está em `OPEN-SOURCE-REMOVAL-RESEARCH-20260909.md`; seus relatos de ausência de
benchmark descrevem o estado anterior a estes testes.

## Implementação

- ProPainter e DiffuEraser recebem um recorte fixo por cena: união espacial das
  máscaras com 96 pixels de contexto. As máscaras individuais e seus intervalos
  permanecem distintos. Quadros de outras cenas não entram no contexto.
- O retorno é recolocado no vídeo em resolução nativa. Os intermediários são RGB
  sem perdas; a entrega é H.264 `yuv420p` com áudio do original. A composição final
  acontece em RGB, corrigindo a mistura indevida da cor das letras causada por
  máscaras em YUV. O encode final ainda introduz perdas normais de compressão.
- Contagem, sequência e dimensões das máscaras são verificadas. Vídeo incompleto
  do modelo aborta antes da publicação. Cenas sem máscara dispensam a GPU.
- A tentativa alternativa, quando habilitada, reutiliza as mesmas máscaras e
  começa no original. Continua desativada neste experimento.
- Cortes dentro de um vídeo cercado por títulos/bordas estáticas usam histogramas
  em blocos, além do histograma global. Os cortes 74 e 104 desta amostra passaram
  a ser detectados automaticamente; os experimentos mantêm esses cortes explícitos.
- Legendas ganham halo de sombra proporcional à resolução: lado maior/192,
  limitado a 24 pixels. Remove/protect e intervalos são reaplicados após dilatação.
  `CLEANER_SUBTITLE_SHADOW_PX=0` desliga; um inteiro fixa o halo em pixels nativos.
- A detecção de cor complementa o OCR dentro de uma faixa de legenda selecionada.
  Inclui palavras saturadas curtas e transições esmaecidas; rejeita fundos
  uniformes e buscas com altura superior a 40% do vídeo.
- Sem `nb_frames`, `probe()` conta quadros com FFprobe. A duração corresponde aos
  quadros reproduzidos no FPS adotado; uma trilha de áudio maior não cria máscaras
  fictícias. Vídeos com FPS variável ainda são tratados pelo fluxo em FPS constante.

Controles: `CLEANER_INFERENCE_ROI=1`, `CLEANER_INFERENCE_ROI_MARGIN=96`,
`PROPAINTER_SUBVIDEO_LENGTH`, `PROPAINTER_NEIGHBOR_LENGTH`, `PROPAINTER_REF_STRIDE`.
A saúde passa a declarar `pipeline_revision=scene-roi-v1`.

## Experimento local reproduzível

GPU: RTX 2060, 6 GB. Runtime oficial em `G:\cleaneria-runtime\ProPainter`, Python
do ambiente `propainter-env`, CUDA e FP16. Janelas 32/6 e referências a cada
10 quadros. Não foi feito treinamento ou download de novos pesos nesta etapa.

Original: `G:\dowloand\teste\padro-01-001 (15).mp4`.
Referência: `G:\dowloand\teste\VMAKE.IA.mp4`.
Região: `roi-legenda-regions.json`, apenas a legenda falada sobre o filme.
Os textos de cabeçalho/rodapé e o avatar não fazem parte deste recorte de teste.

Cada diretório contém manifesto, comandos FFmpeg, progresso, máscaras por cena,
logs do modelo e uma comparação HTML. Entradas e máscaras processadas têm hashes.
A referência nunca é fornecida ao modelo. Originais e resultados anteriores são
mantidos. Comparação de instantes nominais: o Vmake tem deslocamento temporal e
alterações globais de aparência; não é ground truth para PSNR/SSIM.

Preparação de 147 quadros / 4,9 segundos, 1080×1920, 30 FPS, com áudio:

```powershell
python backend/scripts/validate_local_roi_sample.py --input 'G:\dowloand\teste\padro-01-001 (15).mp4' --reference 'G:\dowloand\teste\VMAKE.IA.mp4' --regions 'G:\dowloand\teste\roi-legenda-regions.json' --output-dir 'G:\dowloand\teste\nova-preparacao' --prepare-only --scene-cuts 74,104
```

Sem `--prepare-only`, executa o modelo. `--prepared-from` reutiliza máscaras de
uma preparação com o mesmo hash de amostra/regiões e os mesmos cortes;
`--mask-halo`, `--repair-empty-masks` e `--repair-color-masks` registram alterações
experimentais em uma nova cópia. Não adicionar halo a uma preparação que já
tenha o halo desejado. `--full-frame` permite uma comparação controlada sem ROI.

## Resultados e limites

- `roi-propainter-20260909`: primeira execução GPU completa, ainda com composição
  antiga e sombras insuficientes. Reprovada: contornos pretos e letras residuais.
- `roi-propainter-halo10-20260909`: RGB corrigido e halo 10. A primeira cena perde
  a faixa preta, mas transições não mascaradas contaminam os doadores. Outras
  cenas ainda apresentam letras. Reprovada como entrega final.
- `roi-propainter-revisado-20260909`: corrige a transição esmaecida do quadro 50;
  serve de controle para mostrar que máscaras vazias não são o único problema.
  O OCR também perde partes de palavras em máscaras não vazias.
- `roi-propainter-cores-20260909`: 147 quadros concluídos, com áudio e geometria
  preservados, em 487,79 s nesta máquina (inclui preparação, inicializações e
  auditoria; reutiliza máscaras anteriores, portanto não mede OCR completo).
  Inferência por cena em 760×288, 672×288 e 816×288. Texto residual detectado:
  0,0; pior razão de nitidez: 0,378; estabilidade: 0,949. Revisão visual reprova
  equivalência: ainda há rastros verdes, bordas e perda de textura/fivela.
  `visual-review.json` e `diagnostico-transicoes.png` registram os defeitos.

Diagnóstico posterior: transições 22, 39, 111 e 118 ainda deixam rastros fracos
fora das máscaras. A fivela aparece sem legenda em 76–79, mas referências a cada
10 quadros e vizinhança 6 não consultam diretamente esses quadros ao reconstruir
o quadro 90. Testes controlados seguintes: faixa contínua para isolar contaminação
e referências a cada 2 quadros apenas na segunda cena.

Os números de texto residual/nitidez/estabilidade são sinais heurísticos para
revisão, não uma porcentagem de qualidade nem prova de equivalência ao Vmake.
Controles concluídos:

- `roi-propainter-faixa-retry-20260909`: máscara retangular contínua por cena.
  Elimina os rastros verdes, mas esconde também os quadros que tinham fundo limpo.
  Na primeira cena, perdeu a linha da janela; a terceira recuperou uma textura
  mais coerente que a saída com máscaras incompletas. A tentativa anterior
  `roi-propainter-faixa-20260909` falhou na checagem CUDA antes da inferência;
  a conferência seguinte confirmou CUDA disponível, e esta repetição concluiu.
- `roi-propainter-ref2-cena2-20260909`: mesma entrada e mesmas máscaras da segunda
  cena, referências a cada 2 quadros. Concluiu em 75,29 s, sem reduzir resolução.
  A fivela reaparece no quadro 90; permanece menos definida que a referência.
- `roi-propainter-doadores-cena1-20260909`: faixa contínua exceto os quadros
  iniciais 0 e 1, revisados sem legenda; janela temporal 80 e ref_stride 10.
  A linha da janela reaparece e o fantasma verde desaparece no quadro 30.
  Há diferenças e uma borda visível sobre a roupa: não representa recuperação
  perfeita dos pixels ocultos.

## Artefato para revisão

`G:\dowloand\teste\resultado-comparacao-refinado-20260909\comparison.html` reúne original,
resultado e Vmake. `output.mp4` é o resultado nativo com áudio;
`comparacao-detalhe.mp4` mostra a faixa de interesse em três painéis.
`assemble.py` e `manifest.json` registram a montagem, configurações e hashes.

Seleção manual após os controles: primeira cena com os doadores iniciais,
segunda com ref_stride 2, terceira com máscara contínua. É uma amostra calibrada
por cena, não prova de que o fluxo automático escolhe esses parâmetros sozinho.
A primeira montagem em `resultado-comparacao-20260909` expôs uma borda na roupa
causada pela máscara de contexto ampla. A montagem refinada limita a composição
das cenas 1 e 3 às caixas da legenda verde com margem 14 pixels, calibradas nesta
amostra; preserva o recorte maior usado na inferência. Isso reduz a alteração de
roupa/janela ao redor. Este ajuste de composição está no `assemble.py` da amostra,
não é seleção automática de política no endpoint de produção.

Revisão dos instantes 1, 2, 3 e 4 s: as palavras deixam de aparecer, a linha da
janela e a fivela são reconstruídas e não há a faixa preta das primeiras versões.
O arquivo preserva 147 quadros, 1080×1920, 30 FPS, 4,9 s e áudio. A qualidade ainda
difere da referência: suavização local, fivela e detalhes finos exigem revisão.

Validação do código: `python -m pytest backend/tests -q` — **117 testes passaram**
em 110,50 s. Inclui mídia real com FFmpeg para contagem, FPS, áudio, RGB, proteção,
entrega web e reaproveitamento de máscaras, além de cortes e detecção de cores.
`git diff --check` passou; o CLI remoto com `--help` exige `--image` explícita.

Limites conhecidos: mudanças só de luminância podem passar pelo detector de
cortes; movimentos e texturas complexas podem exigir outro modelo. A licença dos
pesos e do código deve seguir o levantamento já registrado na pesquisa.

## Infraestrutura

Não publicado na Hostear ou RunPod nesta etapa. A auditoria somente leitura está
em `ROI-INFRA-READINESS-20260909.md`: Hostear na revisão anterior e endpoint RunPod
sem capacidade ativa. O validador remoto exige a revisão nova antes de submeter
inferência; aceita `--image` com digest imutável para a imagem atualizada.

`Dockerfile.scene-patch` inclui os módulos novos via `COPY app/`. O antigo
`deploy_scene_patch.sh` é específico da versão anterior, com diretório, tags e
checagem de saúde antigos: não executar esse script como deploy da revisão ROI.
Uma publicação deve empacotar este código em uma nova imagem, conferir os pesos
e validar a amostra antes de substituir o serviço em uso.
