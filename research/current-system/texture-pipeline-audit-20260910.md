# Auditoria do caminho da textura: v3 versus código atual

Data: 10/09/2026. Inspeção local, sem inferência, recursos de nuvem ou alteração
do pipeline. Ferramentas: cleaner-research `search_knowledge`, `inspect_project`,
`inspect_component`, `trace_pipeline`; leitura de código e artefatos com SHA-256.
Este relatório estabelece o que cada etapa faz; as medidas de imagem e o
alinhamento visual ficam no experimento complementar.

## Resultado principal

**CONFIRMED:** a v3 comparada é uma montagem de três resultados antigos. Ela não
é a saída da fase 1 de preservação de pixels nem de um restaurador da fase 4.
Pequena reamostragem e codificações com perdas existem. A composição dessa v3
não aplica feather ou blur: usa substituição opaca RGB dentro da máscara. A
política do tecido esconde uma faixa de 627×100 durante todos os 43 quadros,
reduzindo as referências de fundo que o modelo pode usar.

**LIKELY:** há dois problemas diferentes: acabamento global comparado ao Vmake
(inclusive rosto/cabelo fora da legenda) e deficiência local de textura na área
reconstruída. A máscara, as referências e a estimativa da rede continuam sendo
candidatos fortes para a segunda. Não está demonstrado que a causa principal
seja pós-processamento, nem que o Vmake use um enhancer específico.

**CONFIRMED:** a fase 1 já eliminou a pequena reamostragem e a compressão
intermediária num candidato local. O relatório daquele ensaio registrou a faixa
lisa persistente no tecido e regressão da fivela no quadro 85; não aprovou a
substituição da v3. Isso enfraquece a hipótese de resolver toda a diferença
somente com padding/PNG/CRF menor.

## Qual vídeo foi produzido por qual caminho

Manifesto principal:
`G:/dowloand/teste/resultado-automatico-v3-20260909/manifest.json`.

| Quadros globais, fim exclusivo | Origem relativa a `G:/dowloand/teste` | Recorte nativo | MP4 do modelo | Política registrada |
| --- | --- | --- | --- | --- |
| 0–74 | `resultado-automatico-v2-contexto-20260909` | x174,y1300,762×294 | 760×288 | Faixa estável; referências 0/1; janela 80, stride 10 |
| 74–104 | `resultado-automatico-v2-parcial-20260909` | x130,y1300,678×294 | 672×288 | Referências parciais; stride 2 |
| 104–147 | `resultado-automatico-v2-20260909/scenes/0002` | x130,y1300,820×294 | 816×288 | Faixa estável 627×100; stride 2; nenhuma máscara inteiramente vazia |

A v3 reutilizou cenas 1/2 após verificar máscaras e opções temporais. A entrada
tem 1080×1920, 147 quadros, 30 FPS, 4,9 s. O teto espacial de 960 não precisou
reduzir esses recortes; ocorreu somente arredondamento para múltiplos de oito.
O arredondamento vertical é 294→288 (~2,04%). A origem local registrada é
`G:/cleaneria-runtime/ProPainter`. Isso não prova a versão implantada no site.

## Pontos do código e implicação

| Etapa | Referência | Comportamento verificado e limite |
| --- | --- | --- |
| Extração da amostra | `backend/scripts/validate_local_roi_sample.py:146` | CRF 12/YUV420; a entrada curta já tem uma geração de compressão após o arquivo original. |
| Política | `backend/app/services/subtitle_policy.py:95`, `:147` | Bounding box de texto vira retângulo por quadro; inferência usa união da cena salvo referências parciais. Pode ocultar ilhas limpas entre letras. |
| Entrada do modelo | `backend/app/engines/propainter_official.py:101` | Arredonda largura/altura para baixo em múltiplos de oito. |
| Resize upstream | `G:/cleaneria-runtime/ProPainter/inference_propainter.py:34` | `PIL.Image.resize` da ROI para tamanho de processamento. |
| Estimativas sobrepostas | mesmo runner, `:448`–`:455` | Composição interna usa máscara dilatada e média 50/50 entre previsões sobrepostas. Suavização se previsões divergirem é hipótese, não efeito medido isoladamente. |
| Saída upstream | mesmo runner, `:473`–`:483` | `imageio.mimwrite`, quality=9. `inpaint_out.mp4` já é comprimido; não é tensor nem master sem perdas. |
| Restauração da ROI | `backend/app/services/inference_region.py:192` | Lanczos4 apenas se dimensões diferem; reinsere ROI no original e grava RGB sem perdas. Não contém denoise, sharpen ou correção de cor. |
| Composição final v3 | `backend/app/utils/video.py:183` | `maskedmerge` em RGB, máscara opaca sem blur; saída CRF16/YUV420. O encode final pode alterar pixels fora da máscara. |
| Acabamento opcional novo | `backend/app/workers/tasks.py:537` | `CLEANER_SUBTITLE_FINISH` tem default 0. Código presente não comprova uso na v3 ou publicação. |
| Padding/PNG novos | `backend/app/engines/propainter_official.py:201`, `:282` | `PROPAINTER_PRESERVE_PIXELS=1` opt-in; PNG, padding, recorte exato e master RGB. Default 0. |
| Caminho do produto | `backend/runpod_handler.py:174`, `:178`; `src/lib/cleaner-chunks.server.ts` | Pode fatiar vídeo, executar worker e montar chunks. Teste local v3 não comprova equivalência integral do produto. |

Rosto/cabelo inteiramente acima de y1300 não recebem a ROI reconstruída nesta
amostra. Uma diferença de nitidez nessas áreas deve ser investigada no arquivo
fonte, na codificação final, no alinhamento e no acabamento da referência.

Na cena do tecido, o quadro global 120 tem 22.793 pixels na máscara detectada,
62.700 na inferência e 24.780 na composição. A inferência remove 2,75 vezes a
área detectada; a máscara da composição remove 1,087 vezes. No quadro 115, a
composição cresce de 8.640 para 11.610 pixels (~34,4%). Valores dos relatórios
de máscara, não métricas visuais de acurácia da detecção.

## Intermediários existentes para o teste por etapa

Todos os três diretórios de cena acima retêm:

- `input.mp4`: quadro completo antes da ROI.
- `inference-region.json`: posição e dimensões exatas.
- `inference_region_*/input.mp4`: ROI RGB sem perdas antes do modelo.
- `propainter-run/input/inpaint_out.mp4`: saída upstream já codificada.
- `propainter-native.mp4`: ROI restaurada na dimensão final, master RGB.
- `output.mp4`: composição e entrega da cena.
- Máscaras detectadas e/ou caminho de origem, máscaras de inferência e de composição.

Nomes dos diretórios ROI: `inference_region_lj9a8jrv` (janela),
`inference_region_hlwleo3n` (fivela), `inference_region_0fd71f2h` (tecido).
Não existe checkpoint v3 de predição antes do `imageio`: medir rede versus
encoder upstream separadamente exige uma execução instrumentada. O ensaio
fase 1 usa outra entrada geométrica (padding), portanto não isola só o codec.

Ensaio fase 1 completo:
`G:/dowloand/teste/resultado-fase1-preservacao-b-20260910`.
Retém `scenes/000*/propainter-run/inpaint-lossless.mp4`, `native.mp4`, `master.mp4`,
master completo, saídas CRF16/14/12 e controles sem inpainting. O relatório
`backend/PIXEL-PRESERVATION-VALIDATION-20260910.md` registra zero pixels externos
alterados antes da entrega e PSNR dentro da máscara 43,00/43,31/43,57 dB para
CRF16/14/12. São métricas de encode contra o master, não de fidelidade do fundo.

## Ordem de decisão indicada pelas evidências

1. Alinhar a referência por conteúdo e comparar cada ROI com seu próprio
   original; separar regiões conhecidamente limpas da região coberta pelo texto.
2. Usar os intermediários acima para localizar perdas entre saída do modelo,
   resize, composição e encode; comparar candidato fase 1 já existente.
3. Fazer uma variante leve de acutância/contraste somente como acabamento
   experimental. Exigir comparação temporal e controle de halos, ruído e pele.
   Sharpening não recupera a trama que a rede não reconstruiu.
4. Se a falta de textura já está na saída upstream, testar máscara mais precisa
   e referências verificadas, com o mesmo contexto, antes de trocar o motor.
   Uma execução posterior deve guardar também predições PNG antes do MP4.
5. Manter um restaurador temporal como candidato separado; ainda não existe
   evidência aqui de igualdade com Vmake nem um limite comprovado do sistema.

## SHA-256 verificados nesta auditoria

| Arquivo | SHA-256 |
| --- | --- |
| v3 `manifest.json` | `f19cc63940787d124312f0f5a674f91c37eed27a03a485fc8f4846de6137bc40` |
| fase1-b `manifest.json` | `1cd92169b4b6bcc27d7ec4e2171382c11df55dbfb2442c30c1071a3787b534a5` |
| janela `inpaint_out.mp4` | `86c3b7d1ba00d593355efe07a49e8386bebbed575f6c8ccd10f2150276660819` |
| janela `propainter-native.mp4` | `386b6b445ff1704f57aed87cb7cf8a1cd0201e2bbc9128e4c28dd53ad5dec466` |
| janela `output.mp4` | `96ad507cb2f46ea813b670dc2d5a4590e4bf4d2986931591cd06a61669a37fbc` |
| fivela `inpaint_out.mp4` | `1d60189631259323a9b266b8d10e715f5cf3a83396a7ebe0266e7a160a595f87` |
| fivela `propainter-native.mp4` | `86270b51149b1c4b86fdab64a46089d1c8cfa6c886a325b77525e57d78ff1662` |
| fivela `output.mp4` | `af2854e48a32be9426058a10a361c787317309bb4d31c509c11bd87c044261f2` |
| tecido `inpaint_out.mp4` | `cac030aab9b8e53da688563df0801d528c618ee4c5329005ace13885e9c111c8` |
| tecido `propainter-native.mp4` | `db0b7e182d5663bcd24a0bcc53c36894a741e8375f0f866cf530b905953380c8` |
| tecido `output.mp4` | `b8e7758ef7de055acb01162662f1e3b167db33cea2d0c355a2da8ec115b49b38` |
| runner upstream local | `084a6743d186968ded7dddfe1dc142eee7799be023f2c353c4ae119ed728cbe9` |
| `backend/app/services/inference_region.py` | `cbe6452ef6e694cfdfc2a08434ca56c287841b9ec01a28a21d0c89d4f078b78e` |
| `backend/app/utils/video.py` | `b2597226880776420836f53dc41d8366be198785f0a555ff8be75e31e0fd522f` |
| `backend/app/services/subtitle_policy.py` | `a5c051cabd11c783598022adbe1aabff302156aa80704c2ab3cab94f61139c9f` |
| `backend/app/engines/propainter_official.py` atual | `d3ceda4a1a0ca64baf5b5b8c40160540ff659c860fe46a2bb9e0cbfdcfe00788` |
| `backend/app/engines/propainter_pixels.py` atual | `0b78b878b1e387249b737be429d49c52c5e1623a0c637174b35c939774d21e67` |
| `backend/app/services/pixel_composite.py` atual | `872bd75231934fe94cd5adbcd5bcf521b2d67e6103ffd463cf9ac99fea76ead9` |
| `backend/app/workers/tasks.py` atual | `789936a6f68fef050aca146315d94e48a8ba990f927bd60779ab3eea61d9fb9e` |
| `backend/runpod_handler.py` atual | `26fcc138972adf4d36c329c9125a5b29a8ea8ac5f7d8c6f45be3af3d5fb2c194` |
| `src/lib/cleaner-gpu.server.ts` atual | `cc750945861fff8ce4ca40dc76d9036e1b51231917b4425e1471f5a0f7499196` |
| `src/lib/cleaner-chunks.server.ts` atual | `a37e5eb4c0224121d799ee89a497a926e9330c4d485e0dd06a11f9ed20627434` |

Os hashes atuais do adaptador e do worker diferem dos registrados na v3.
Os hashes de restore, composição, política e runner coincidem. Esta inspeção
não consultou estado remoto e não certifica o que está publicado.
