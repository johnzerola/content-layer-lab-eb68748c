# Fase 4 — acabamento leve e estável

Data: 2026-09-10  
Entrada: melhor master da Fase 3, `B2-real-donors-clipped-C2`.  
Decisão geral: **REJECT como acabamento padrão; manter B2 com acabamento desligado**.

## Escopo e regras

- Vmake permaneceu somente como referência perceptiva.
- Nenhum pixel do Vmake foi usado para acabamento, donor ou ground truth.
- Nenhum modelo neural, sharpening global, mudança de saturação, resize ou GPU paga foi usado.
- Reconstrução e acabamento estético foram avaliados separadamente.
- Fivela, rosto, cabelo, janela, títulos, moldura e cenas anteriores permaneceram protegidos no candidato local.
- Produção não foi alterada.

## Variantes

### F4-OFF — B2 sem acabamento

Controle da rodada. Mantém o melhor master da Fase 3 sem alteração adicional.

### F4-CURRENT — acabamento existente

Executou `finish_frame` com força 0,3 somente a partir do frame 104. O estado foi reiniciado no início da cena. A máscara efetiva foi:

`máscara de composição arquivada ∩ máscara safe-wide por quadro`.

O algoritmo exige evidência de continuidade no mesmo ponto para correção de cor ou nitidez. Nenhum dos 43 frames acionou uma correção válida. O resultado é pixel a pixel idêntico ao B2.

**Decisão: REJECT_NO_EFFECT.** O comportamento conservador evitou regressão, mas não melhorou o suéter.

### F4-LUMA-LOCAL — nitidez limitada em luminância

- Somente dentro da máscara efetiva erodida em 3 px.
- Unsharp no canal Y, sigma 0,8 e intensidade fixa 0,10.
- Delta de luminância limitado a ±2.
- Delta observado em BGR limitado a 3 níveis.
- Zero alteração fora da máscara.
- Zero alteração nos frames limpos 145 e 146.
- Zero alteração nos frames 0–103.

Foram alteradas 532.574 ocorrências de pixel: 65,57% da máscara efetiva e 73,09% da área erodida elegível.

| Descritor no suéter | B2/OFF | Luma local | Mudança |
|---|---:|---:|---:|
| HF RMS | 1,55199 | 1,56764 | +1,01% |
| Gradiente RMS | 4,27464 | 4,28889 | +0,33% |
| Luma média | 31,59244 | 31,59587 | +0,00343 nível |
| Proxy temporal, delta médio contra B2 | — | +0,05814 | pequena variação adicional |
| Proxy temporal, pior delta | — | +0,12163 | pequena variação adicional |

A inspeção nativa mostra definição ligeiramente maior, mas também evidencia mais o padrão vertical artificial já sintetizado pelo ProPainter. O filtro realça o que existe; ele não recupera a trama ausente.

**Decisão: REJECT como padrão.** O ganho não atende ao critério perceptivo sem reforçar o defeito estrutural. O arquivo fica preservado para revisão A/B.

### F4-FILM-OPTIONAL — realce estético separado

- Canal Y somente.
- Intensidade 0,04 e teto de ±1 em Y.
- Aplicado apenas no retângulo filmado `[25, 540, 1055, 1660]`.
- Títulos, moldura e elementos externos ao filme permanecem intactos.

Apesar do limite pequeno, a variante alterou 125.331.313 ocorrências ao longo do clipe, das quais 123.020.564 ficam fora da máscara de reconstrução. No suéter, HF RMS mudou apenas de 1,55199 para 1,55304, cerca de +0,07%.

**Decisão: OPTIONAL_ONLY / REJECT como evidência de reconstrução.** O custo de modificar áreas corretas não se justifica neste clipe. Não deve ser ativado por padrão nem usado para esconder a faixa.

## Regressões encontradas e corrigidas durante a rodada

### Revisão inicial

A primeira variante local usou somente a máscara arquivada, que ainda continha suporte nos frames limpos 145–146. Ela alterou 105.817 ocorrências nesses frames e foi rejeitada.

### Revisão V2

A interseção com `safe-wide` protegeu os frames limpos. Porém, o adaptador do acabamento existente recompunha o exterior da máscara a partir do SOURCE e alterou 3.788 pixels previamente aprovados do B2, com delta máximo 26. A revisão foi rejeitada.

### Revisão V3 autoritativa

O adaptador restaura o B2 byte a byte fora da máscara efetiva. Gates finais:

| Gate | Current | Luma local |
|---|---:|---:|
| Pixels alterados fora da máscara | 0 | 0 |
| Pixels alterados nos frames 0–103 | 0 | 0 |
| Pixels alterados nos frames 145–146 | 0 | 0 |
| Delta máximo por canal | 0 | 3 |

## Comparadores em movimento

- `comparators/b2-current-luma-vmake.mp4`: quadro completo, alinhado com Vmake.
- `comparators/b2-current-luma-vmake-sweater.mp4`: crop do suéter.
- `comparators/phase4-ablation-sweater.mp4`: B2/OFF, acabamento atual, luma local e realce opcional.
- `comparators/luma-local-change-map.mp4`: mapa temporal exato dos pixels alterados.
- Cada comparador principal possui master FFV1 correspondente.

Alinhamento perceptivo: B2/current/luma começam no frame 3; Vmake começa no frame 0. Offset global: -3. Vmake não participa das métricas de aceitação.

## Artefatos

Raiz: `G:\dowloand\teste\phase-4-v3-20260910`.

| Artefato | Local |
|---|---|
| Relatório de construção | `build-report.json` |
| Avaliação | `evaluation.json` |
| Current master/entrega/mapas | `current/` |
| Luma local master/entrega/mapas | `luma-local/` |
| Realce estético opcional | `film-optional/` |
| Comparadores e masters FFV1 | `comparators/` |

## Validação

- 20 testes do acabamento e da integração de serviço passaram.
- Scripts da rodada compilados com sucesso.
- Masters: 1080×1920, 147 quadros, 30 fps.
- Entregas: CRF 14, BT.709 limited, áudio original preservado.
- Comparadores: CRF 12, 30 fps.
- GPU local/paga: não usada nesta fase.
- Custo de GPU em nuvem: **US$ 0,00**.

## Conclusão

A Fase 4 chegou ao limite útil de um acabamento determinístico leve neste clipe. Ela consegue aumentar discretamente a acutância, mas não remove a estrutura vertical artificial porque essa estrutura já existe no master B2. Aplicar mais intensidade aumentaria a aparência processada e poderia piorar flicker, ruído e halos.

O master recomendado continua sendo B2 com acabamento desligado. Para superar esse ponto será necessário melhorar a reconstrução temporal ou testar um restaurador temporal real em região limitada. Isso pertence à Fase 5 e ainda não está integrado ou aprovado.
