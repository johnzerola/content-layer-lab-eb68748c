# Fase 6 — relatório final

Data: 12/09/2026  
Estado: **VALIDAÇÃO TÉCNICA CONCLUÍDA — CLEANER_GOLDEN_V4 APROVADO**

## Decisão

O candidato combinado `CLEANER_GOLDEN_V4` é a baseline técnica aprovada para
remoção de legendas no Cleaner. Ele usa `scene-roi-v4`, DiffuEraser,
`legacy_refined`, faixas corrigidas, máscaras duplas por cena e
`subtitle-junctions-v1`. Seus parâmetros estão congelados em
`docs/CLEANER-GOLDEN-V4.md` e protegidos por fixture executável.

Esta decisão fecha a validação técnica da Fase 6. Ela não autoriza uso comercial
dos pesos ProPainter: os termos de licença desse prior continuam como gate jurídico
independente antes de produção comercial.

## Problema e regressão

O objetivo era remover legendas, títulos e marcas d'água sem alterar o restante
do vídeo e sem os resíduos visíveis deixados pelo V4 anterior. O teste Pedro
revelou 159.607 pixels verde-neon em 26 frames no V4 antigo.

A regressão tinha dois componentes no contrato executado:

- as regiões anteriores acompanhavam caixas estreitas dos glifos e não cobriam
  de forma segura contorno, sombra e fragmentos animados;
- o primeiro worker V4 avaliado não continha a etapa refinada de junções/doadores
  usada na melhor referência local.

A faixa passou a ter no mínimo 58% da largura e 5,2% da altura, com `grow=0.008`.
O perfil refinado usa máscara de inferência com contexto temporal e composição
limitada à seleção, seguida de `subtitle-junctions-v1`. A execução combinada
removeu o resíduo; o experimento não separa causalmente quanto veio de cada etapa.

## Golden Candidate

| Item | Contrato aprovado |
|---|---|
| nome | `CLEANER_GOLDEN_V4` |
| pipeline | `scene-roi-v4` |
| engine | `diffueraser` / `diffueraser-official` |
| perfil | `legacy_refined` / `legacy_refined_b2_v1` |
| política | `scene-local-dual-subtitle-masks-v1` |
| junções | `subtitle-junctions-v1` |
| acabamento global | desligado |
| DiffuEraser | lado 960, dilatação 4, stride 5, vizinhança 12, subvídeo 50 |
| master | RGB lossless, `libx264rgb` CRF 0, `gbrp` |
| delivery | H.264 CRF 16, `yuv420p`, áudio por stream copy quando compatível |
| commit da imagem | `5fa3a4875d525b31d871a81d0e3d6e8661fb7f86` |
| Docker imutável | `sha256:5e7ac6bd84854b7f863714156f6f75f61ab8e0c614078c1401a354f7016c4370` |

## Testes finais

Foram avaliados cinco cenários representativos existentes em dois clipes reais.
As quatro janelas do segundo clipe são cenários distintos do mesmo vídeo e não
devem ser tratadas como quatro amostras estatisticamente independentes.

| Cenário | Evidência | Resultado |
|---|---|---|
| legenda complexa/colorida | Pedro, 150 frames | passou; 0 pixels verde-neon em 0 frames |
| fundo simples e janela | clipe real, frame 34 | passou; reconstrução coerente, sem resíduo óbvio |
| pessoa/movimento e linhas | clipe real, frame 88 | passou; linhas e roupa preservadas visualmente |
| tecido/textura e rosto | clipe real, frame 120 | passou; textura coerente, sem emenda evidente |
| borda/continuidade temporal | clipe real, frames 0–146 | passou no review amostrado e descritor temporal; sem falha grave observada |

Contrato do segundo clipe: SHA-256
`c6fc2c2d9b947e0f45008ab7f84841f86fa90b160d6372fb20fec95d95b0fb64`,
1080×1920, 30 FPS, 147 frames, 4,9 s. O job foi
`408d5b00-1cb0-43b1-a327-92204987a0ef-u2`, sem retry.

### Gates objetivos do clipe real

| Gate | Resultado |
|---|---:|
| frames / geometria | 147; 1080×1920; 30 FPS |
| delivery decodificável | passou |
| pixels alterados fora das seleções no master | **0** |
| delta máximo externo | **0** |
| MAE externo | **0,0** |
| descritor verde na seleção | **0 pixels; 0 frames** |
| áudio | SHA-256 de pacotes idêntico; stream copy confirmado |
| retries | 0 |
| estado final do endpoint | workers 0/0; template anterior restaurado |

O descritor temporal dentro da seleção teve razão mediana 0,575 e p95 1,627
contra o movimento quadro a quadro do source. É um alarme auxiliar, não uma métrica
perceptual nem ground truth. A aprovação temporal depende também da revisão visual.

## Observabilidade, custo e latência

O worker registrou download, probe, cenas, máscaras, política, ROI, entrada e saída
do motor, restauração, junções, composição, encode e upload. O job final retornou
`ok=true`, `quality_status=checks_passed`, RTX 4090 e 9,901 GB de pico de RAM.
O pico real de VRAM do subprocesso permanece indisponível; o contador do processo
pai reporta zero e não deve ser interpretado como uso real zero.

| Execução | Fila | Provider | Handler | Custo aproximado |
|---|---:|---:|---:|---:|
| Pedro 5 s | 96,607 s | 381,265 s | 381,06 s | US$ 0,100392 |
| real 147f | 97,718 s | 602,622 s | 602,40 s | US$ 0,132859 |
| total observado | — | — | — | **US$ 0,233252** |

O custo usa delta de saldo e pode incluir atraso de contabilização ou storage; não
é uma fatura isolada por vídeo.

## Limitações e casos difíceis

- O teste final tem dois vídeos reais, não um dataset amplo ou holdout de 30 casos.
- A máscara final foi revisada/congelada; detecção semântica automática de título,
  logo, watermark e texto pertencente à cena ainda não foi validada amplamente.
- Água, fumaça, cabelo cruzando a máscara, movimento muito rápido, compressão forte,
  cortes densos e câmera agressiva continuam casos difíceis conhecidos.
- Não existe ground truth do fundo oculto em vídeo real; qualidade dentro da região
  depende de revisão visual e controles sintéticos complementares.
- A saída intermediária de junções transferida corresponde somente à última cena;
  master e delivery finais têm todos os frames e passaram os gates.
- O limite comercial dos pesos/prior ProPainter precisa de revisão jurídica ou
  autorização própria antes de oferecer esta engine em produto pago.

## Dívida técnica não bloqueante

**Pure DiffuEraser vs junctions causal attribution.** Os intermediários puros foram
persistidos durante o smoke, mas a transferência apontou para temporários já
removidos. Portanto a evidência aprova o candidato combinado e não atribui o ganho
isoladamente ao DiffuEraser ou às junções. Corrigir a exportação com nomes únicos
por cena e executar essa ablação no futuro não bloqueia o fechamento técnico.

## Evidências

- `G:/dowloand/teste/regression-fix-smoke-20260912/pedro-01/`
- `G:/dowloand/teste/phase6-final-validation-20260912/real-147f/`
- `G:/dowloand/teste/phase6-final-validation-20260912/real-147f/metrics.json`
- `G:/dowloand/teste/phase6-final-validation-20260912/real-147f/critical-frames/`

Próxima fase: planejar e, somente após aprovação explícita, experimentar acabamento
local na região reconstruída conforme `docs/PHASE-7-RECONSTRUCTION-FINISHER-PLAN.md`.
