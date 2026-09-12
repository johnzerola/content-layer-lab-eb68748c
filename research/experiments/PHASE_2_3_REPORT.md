# PHASE 2–3 — preservação, máscaras e reconstrução temporal

Data: 2026-09-10  
Escopo: clipe de 147 quadros, 1080×1920, 30 fps.  
Decisão geral: **RETEST**. A preservação da Fase 2 foi aceita como base experimental. A Fase 3 melhorou a cobertura da legenda e recuperou alguns pixels reais, mas ainda não provou paridade com o Vmake na faixa do suéter.

## Regras da rodada

- Vmake foi usado somente como referência perceptiva.
- Nenhum frame, pixel ou textura do Vmake foi usado como donor ou ground truth.
- Não foi aplicado sharpening, super-resolution, restauração neural ou mudança global de aparência.
- Todas as inferências foram locais na RTX 2060. RunPod não foi iniciado; custo de GPU em nuvem: **US$ 0,00**.
- As ablações alteraram uma variável por vez.
- O master RGB e os intermediários foram preservados sem perdas.

## Fase 2 — master e cor

### Hipótese

Um master RGB nativo, com conversão explícita BT.709 limited → RGB full na entrada e RGB full → BT.709 limited na entrega, separa perdas de reconstrução das perdas de resize, composição e encode.

### Experimento

- SOURCE: `G:\dowloand\teste\padro-01-001 (15).mp4`.
- Entrada canônica: primeiros 147 quadros decodificados explicitamente como BT.709 limited para RGB full.
- Master: RGB lossless, 1080×1920, 147 quadros, sem resize global.
- Composição: reconstrução V3 somente dentro da máscara arquivada; SOURCE fora dela.
- Entregas CRF 14 e CRF 12 geradas do mesmo master.
- Controle adicional: encode com tags somente e reencode do próprio SOURCE.

### Resultado

| Variante | RGB MAE fora da máscara | Viés de luma | Tamanho | Decisão |
|---|---:|---:|---:|---|
| BT.709 explícito, CRF 14 | 1,2163 | -1,0743 | 2,44 MB | **ACCEPT** para entrega padrão |
| Mesmo master, CRF 12 | 1,1847 | -1,0791 | 3,22 MB | **REJECT** como padrão; ganho pequeno para +32% de arquivo |
| Tags somente, CRF 14 | 1,2319 | -1,0786 | 2,44 MB | **REJECT**; tags não substituem conversão real |
| SOURCE reencodado, CRF 14 | 1,2148 | -1,0733 | 2,49 MB | controle de piso do codec |

O master tem delta máximo **0** fora da máscara em todos os 147 quadros, e o roundtrip RGB lossless foi verificado. A rodada levou 154,73 s de CPU, além de 55,79 s para construir o master.

O decoder OpenCV local interpretou o arquivo como BT.601 apesar das tags BT.709. No frame 120, OpenCV coincidiu com o decode BT.601 e diferiu do decode BT.709 em MAE 0,3653 e delta máximo 28. Por isso os experimentos seguintes usam a entrada RGB explicitamente convertida, e não o decode implícito do OpenCV.

**Conclusão da Fase 2: ACCEPT.** A perda do suéter já existe na saída bruta do modelo; CRF e tags não são a causa principal.

## Fase 3A — máscara

### Hipótese

A faixa fixa de 627×100 elimina contexto verdadeiro demais. Uma máscara por quadro, temporalmente protegida e com halo suficiente, deveria conservar mais pixels reais sem reintroduzir letras.

### Parâmetros comuns

- ROI nativa: x=130, y=1300, 820×294; pad técnico para 824×296, removido após inferência.
- Sem resize da imagem ou máscara.
- ProPainter fp16, seed 1234, dilatação interna 2.
- Controle temporal: stride 2, janela 32, neighborhood 6.
- Core verde: `G-R > 16`, `G-B > 12`, `G > 45`; componentes ≥5 px.
- Halo 10 px e guarda temporal ±1 quadro na máscara precisa.
- A máscara de composição final permaneceu fixa na máscara arquivada para comparar apenas a entrada do modelo.

### Resultados

| ID | Única variável | Média de pixels de inferência/quadro | GPU local | Resultado | Decisão |
|---|---|---:|---:|---|---|
| A0 | faixa fixa 627×100 | 62.700 | 111,93 s | remove letras, mas cria faixa lisa; também reconstrói frames limpos | **REJECT** |
| A1 | máscara precisa por quadro | 12.514 | 156,68 s | preserva muito contexto, mas deixa sombra/forma escura dos glifos | **REJECT** |
| A2 | máscara de composição arquivada | variável | 141,31 s | deixa resíduos ciano/verdes visíveis | **REJECT** |
| A3 | fallback adaptativo | 18.205 | 110,27 s | ainda deixa resíduos ciano/verdes | **REJECT** |
| A4 | máscara segura, halo largo | 31.818 | 71,28 s | remove o ciano e deixa frames 145–146 intactos; ainda gera padrão vertical artificial | **RETEST / controle C** |

A4 usa 1.368.180 pixels de inferência acumulados, contra 2.696.100 da faixa fixa: redução de **49,25%**. Os frames 145 e 146 têm máscara vazia e permanecem exatamente iguais ao SOURCE. A inspeção nativa, porém, mostra repetição vertical no centro do suéter. Assim, A4 resolve cobertura, mas não resolve toda a reconstrução.

O detector automático verde original não capturou todos os resíduos ciano-escuros de A1–A3. Essas variantes foram rejeitadas pela revisão visual nativa; o gate automático isolado não deve ser usado como aprovação.

## Fase 3B — donors reais do próprio vídeo

### Hipótese

Pixels verdadeiros do mesmo plano, alinhados por movimento e aprovados por confiança, devem substituir síntese quando houver evidência suficiente.

### Busca e validação

- Plano confirmado no SOURCE: frames 104–198; corte seguinte no frame 199.
- Alvo desta rodada: frames 104–146.
- Pool controlado: 104, 112, 116, 128, 136, 145 e 146.
- Frames 145 e 146 são os donors totalmente limpos dentro do trecho alvo.
- Frames 134 e 144 não têm core verde, mas ficam em transições temporais e não foram tratados automaticamente como ground truth limpo.
- Fluxo Farneback na resolução nativa do crop, ida/volta, erro máximo 1 px.
- Suporte limpo em raio 17 px, fração mínima 0,20.
- MAE fotométrico máximo 7; MAE de gradiente máximo 11.
- Concordância entre pelo menos 2 donors, MAE RGB máximo 9.
- Confiança mínima 0,48 e veto temporal com MAE máximo 10.

### Mapa final antes do limite de composição

| Classe | Ocorrências de pixel | Fração da região solicitada |
|---|---:|---:|
| `RECOVERABLE_REAL_PIXEL` | 21.504 | 4,00% |
| `SYNTHESIS_REQUIRED` | 0 | 0,00% |
| `UNCERTAIN` | 502.587 | 93,40% |
| `OCCLUDED` | 14.006 | 2,60% |

O valor zero em `SYNTHESIS_REQUIRED` não significa que todo o restante seja recuperável. Significa que esta busca limitada não conseguiu provar impossibilidade global; por segurança, 96% ficaram como incertos ou ocluídos. O veto temporal removeu 274 ocorrências, restando 21.230 aceitas no mapa autoritativo.

Contribuição dos donors escolhidos: frame 104: 868 px; 112: 4.266; 116: 3.737; 128: 226; 136: 225; 145: 565; 146: 11.617. Das 282 combinações alvo/donor avaliadas, 169 tiveram aceitação parcial e 113 foram rejeitadas integralmente. O CSV de decisões registra para cada combinação: erro forward/backward, suporte, confiança, quantidade aceita e motivo de rejeição.

O primeiro composto B1 alterou 2.321 pixels fora da máscara arquivada e foi **REJECT**. B2 intersecta o mapa de donors com a máscara autorizada: aplica 18.508 pixels reais e descarta 2.722 ocorrências fora desse contrato. B2 passa os gates:

- frames 0–103 idênticos ao baseline;
- delta zero fora das máscaras arquivadas;
- frames limpos 145–146 idênticos ao SOURCE;
- nenhum sharpening ou textura sintética adicional.

No suéter, B2 eleva o RMS de alta frequência de 1,5509 para 1,5937 sobre C2, enquanto o proxy temporal absoluto muda de 1,6863 para 1,6907. Esse pequeno aumento temporal exige revisão em movimento; alta frequência pode representar detalhe real ou ruído e não aprova o candidato sozinha.

**Conclusão 3B: RETEST.** B2 é o melhor candidato desta rodada para inspeção, mas recupera apenas **3,44%** das 538.097 ocorrências mascaradas do mapa de busca.

## Fase 3C — parâmetros temporais do ProPainter

Controle: A4, stride 2, janela 32, neighborhood 6.

| ID | Única variável | Tempo | HF RMS | Proxy temporal absoluto | Decisão |
|---|---|---:|---:|---:|---|
| C0/A4 | controle | 71,28 s | 1,5397 | 1,6699 | controle |
| C1 | stride 1 | 358,34 s | 1,5715 | 1,6763 | **REJECT**: ~5× mais lento, sem ganho visual material |
| C2 | janela 43 | 190,46 s | 1,5509 | 1,6863 | **RETEST**: pequeno ganho de detalhe, custo e variação maiores |
| C3 | neighborhood 10 | 53,21 s | 1,5072 | 1,6669 | **REJECT** para qualidade máxima: mais suave |
| C4 | média igual de previsões | sem nova GPU | — | — | **REJECT**: MAE 0,00305 e delta máx. 6 contra A4; efeito imaterial |
| C5 | mediana de previsões | sem nova GPU | — | — | **REJECT**: MAE 0,00375 e delta máx. 18; sem melhora visível |

Cada quadro recebeu em média 2,30 previsões de janelas sobrepostas; o desvio RGB médio dentro da máscara foi 0,884. A forma de agregar overlap não explica a faixa do suéter. C2 foi usado como base de B2 por manter um pouco mais de detalhe; essa escolha ainda é RETEST, não configuração aprovada para produção.

## Regressões protegidas

- Fivela, rosto, cabelo, janela e geometria dos frames 0–103 são bit a bit idênticos ao baseline da Fase 2.
- Nos frames 104–146, alterações ficam estritamente dentro da máscara arquivada do suéter; rosto, cabelo, janela, background e bordas externas têm delta zero contra SOURCE.
- Não houve resize global nem transformação geométrica.
- A comparação visual não encontrou deformação grande, mas a textura central ainda denuncia reconstrução.

## Intermediários preservados

| Etapa | Local |
|---|---|
| input RGB lossless | `phase2/input.mp4` |
| máscaras | `phase2/masks`, `masks/native-*`, `masks/roi-*` |
| model input | `model/<variante>/input` |
| model mask | `model/<variante>/mask` |
| previsões de cada janela | `model/<variante>/run/raw_predictions/*.npz` |
| raw ProPainter output | `model/<variante>/raw-output/*.png` |
| donors, labels e confidence maps | `donors/primary/{candidate,labels,confidence,donor-index}` |
| restored ROI/composite | `candidates/<variante>/composite/*.png` |
| master RGB lossless | `candidates/<variante>/master.mp4` |
| delivery encode | `candidates/<variante>/delivery-crf14.mp4` |

Raiz dos artefatos: `G:\dowloand\teste\phase-2-3-20260910`.

## Comparadores em movimento

- `comparators/source-v3-best-vmake.mp4`: SOURCE / BASELINE V3 / B2 / VMAKE, quadro global alinhado.
- `comparators/source-v3-best-vmake-sweater.mp4`: mesma comparação no crop nativo do suéter.
- `comparators/mask-ablation-sweater.mp4`: A0 / A1 / A2 / A4.
- `comparators/temporal-ablation-sweater.mp4`: A4 / C1 / C2 / C3.
- Cada MP4 CRF 12 possui master FFV1 correspondente.

Alinhamento com Vmake: offset global -3; SOURCE/baseline/B2 começam no frame 3 e Vmake no frame 0. A distância cosseno média foi 0,0008607 usando luma normalizada e suavizada fora da faixa de legenda. É alinhamento perceptivo, não equivalência de pixels.

## Decisão e próxima fase

| Parte | Decisão |
|---|---|
| Fase 2, master/cor/encode | **ACCEPT** |
| A4, cobertura de máscara | **RETEST** |
| C1/C3/C4/C5 | **REJECT** |
| C2, janela 43 | **RETEST** |
| B1, donors sem limite de composição | **REJECT** |
| B2, donors reais limitados | **RETEST / melhor candidato desta rodada** |

A rodada demonstra que resize, composição global, CRF e parâmetros simples do ProPainter não são o gargalo principal. O limite atual é a quantidade de textura real observável e alinhável: cerca de 3,44% pôde ser recolocada com confiança dentro do contrato, e a maior parte ainda depende da síntese do ProPainter.

A Fase 4 não deve aplicar aparência global. O próximo experimento deve ampliar donors dentro do mesmo plano 104–198, usando fluxo mais robusto com oclusão explícita e uma composição temporariamente coerente; depois deve comparar um modelo de inpainting temporal alternativo no mesmo input e na mesma máscara. Restaurador neural pago/Fase 5 continua bloqueado até essa prova. Produção continua sem integração.

## Limitações

- Um único clipe não sustenta uma afirmação geral de qualidade.
- Não existe ground truth limpo para a maior parte da faixa coberta.
- Vmake tem frame rate reportado diferente e foi alinhado perceptivamente.
- Métricas de alta frequência podem premiar ruído, compressão ou resíduo.
- A máscara desta rodada é específica à legenda verde; sombra preta sem core colorido continua sendo um caso a validar em dataset separado.
