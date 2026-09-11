# Fase 6 — auditoria do pipeline e plano do benchmark definitivo

Data: 11/09/2026  
Estado: **AUDITORIA E PLANO CONCLUÍDOS; BENCHMARK AINDA NÃO EXECUTADO**  
Escopo: remoção de legendas, títulos e marcas d'água. Nenhuma decisão de produção é autorizada por este documento.

Revisão auditada: `e719bda13b8c2d87c5c1b7fb7ec5a6ca149536d6`.  
Imagem candidata mais recente: `docker.io/nivaldo12/leaneria-runpod@sha256:44639b431b939ec8638852f574048ae97895fa4fbc418b7381e1cf89086c409d`.

## 1. Conclusão da auditoria

Ainda não existe evidência controlada de que DiffuEraser seja melhor que o pipeline local, nem de que RunPod melhore a qualidade. RunPod fornece GPU e capacidade operacional; qualidade depende do motor, dos pesos, da máscara, do contexto temporal, da composição e dos encodes usados antes e depois da inferência.

O teste Pedro v4 não foi uma comparação justa com a versão local considerada boa:

- v3 e v4 usaram uma região de legenda bem menor que a faixa usada no ensaio antigo;
- o resultado local mais limpo exibido em `resultado-fase2-juncoes-20260910/comparison.html` aplicou `subtitle-junctions-v1` sobre uma reconstrução neural já existente;
- o primeiro worker v4 testado ainda não continha essa etapa de junções/doadores;
- os caminhos local e RunPod não compartilharam necessariamente os mesmos encodes intermediários;
- `residual_text` caiu de 0,4338 para 0,3760, mas ambos os resultados ficaram em `needs_review` e a métrica não mede naturalidade, estrutura, cor ou flicker.

A melhoria de aproximadamente 13,3% em uma métrica, num único clipe, não elege arquitetura. A imagem corrigida publicada depois do teste (`sha256:44639b...c409d`) ainda não passou por inferência. Ela deve permanecer candidata, não configuração aprovada.

## 2. Linhas de base que precisam ser separadas

### 2.1 Legacy histórico aprovado visualmente

Referência preservada:

`G:/dowloand/teste/resultado-comparacao-refinado-20260909/output.mp4`

Ela aparece como `Aprovado ("95%")` em `comparacao-v3-vs-aprovado-20260910/review.json`. Serve como referência visual histórica. Não deve receber métricas causais de motor enquanto todos os intermediários, parâmetros e predições brutas daquela execução não forem reproduzidos.

### 2.2 Legacy local reproduzível

Referência preservada:

`G:/dowloand/teste/resultado-fase2-juncoes-20260910/reference-master.mp4`

Contrato documentado no manifesto:

- mesmas saídas ProPainter/v3 já arquivadas;
- processamento local em CPU;
- fluxo óptico e composição `subtitle-junctions-v1`;
- pixels de doadores vêm do vídeo original e exigem concordância local;
- master RGB sem perdas e entrega separada;
- nenhuma nova inferência neural nessa etapa.

Este é o significado operacional de **legacy/local refinado** no benchmark. O histórico “95%” continua como referência visual adicional.

### 2.3 Pipeline v3

O v3 histórico é uma montagem de três execuções de cenas anteriores. Ele usa:

- detecção/máscaras dinâmicas;
- política de legenda por cena;
- ROI espacial em torno da união temporal da máscara;
- ProPainter nos resultados locais históricos;
- restauração da ROI na grade original;
- composição seletiva;
- entrega H.264/YUV420.

O v3 enviado ao RunPod usou DiffuEraser, `scene-roi-v3`, ROI e uma região manual ampla em alguns testes. Portanto, “v3” não identifica sozinho um motor. Todo resultado deve registrar **revisão + motor + máscara + parâmetros + ambiente**.

### 2.4 Pipeline `scene-roi-v4`

O código atual aceita `quality_profile=standard|legacy_refined` e `engine=auto|propainter|diffueraser`. O perfil `legacy_refined` força máscara dinâmica, proteção, verificação, composição seletiva e acabamento global desligado.

No estado atual de `main`:

- preset `quality` + engine `auto` escolhe ProPainter;
- preset `max` + engine `auto` escolhe DiffuEraser;
- o frontend envia `quality_profile=legacy_refined` por padrão;
- legenda/karaoke detectada automaticamente recebe uma faixa mínima de 58% da largura e 5,2% da altura;
- a política cria máscara de inferência estável e máscara de composição mais estreita por quadro;
- `subtitle-junctions-v1` é executado por cena no perfil refinado, se habilitado;
- a composição continua limitada à seleção autorizada;
- a revisão publicada é `scene-roi-v4`.

Essa configuração existe em código e numa imagem Docker publicada, mas a variante com junções ainda não tem resultado pago validado. Código publicado não equivale a qualidade aprovada.

## 3. Motores

| Motor | Função | Execução local | Execução RunPod | Limites já demonstrados |
|---|---|---|---|---|
| ProPainter | fluxo RAFT, conclusão de fluxo, propagação e inpainting temporal | funciona localmente na RTX 2060 em ROIs limitadas; pode exigir janelas menores | disponível na imagem RunPod | saída pode ficar lisa/artificial; OOM aciona escalas 1,00/0,72/0,55/0,42 no adapter geral |
| DiffuEraser | prior ProPainter + difusão temporal/BrushNet/SD1.5/PCM | inicialização local bloqueada por pouca RAM antes da inferência | validado funcionalmente em RTX 4090 24 GB | teste de 5 s levou 374,88 s e permaneceu `needs_review`; saída oficial é MP4 e ainda precisa de isolamento de codec |
| TBE/TemporalFill | caminho clássico/fallback | local | pode existir no container, mas não é o motor dos testes max | não deve ser confundido com ProPainter/legacy refinado |

Licença também é gate: o código do DiffuEraser é Apache-2.0, mas seu prior e os pesos ProPainter mantêm termos próprios. A licença ProPainter registrada no adapter limita uso comercial sem autorização específica. Benchmark técnico não resolve esse gate jurídico.

## 4. Máscaras e composição

Há quatro conceitos diferentes e eles devem ser arquivados separadamente:

1. **seleção do usuário:** área autorizada para remoção;
2. **detecção por quadro:** pixels classificados como texto/logo dentro da seleção;
3. **máscara de inferência:** suporte dado ao motor, que pode ser mais largo para oferecer estabilidade temporal;
4. **máscara de composição:** suporte final, mais estreito, dentro do qual a reconstrução substitui o original.

O pipeline atual faz OCR por amostras para propor regiões. Em legenda/karaoke, ignora caixas cujo centro esteja acima de 45% da altura. Para cada quadro, `frame_text_mask` refaz a detecção dentro da região, aplica refinamento morfológico e halo proporcional à resolução. `subtitle_policy` pode usar uma faixa estável na inferência, preservar referências parciais e manter composição por quadro.

Para logos/marcas d'água, há detector separado e votação de máscara persistente. O modo `smart` soma texto e watermark, mas ainda não classifica semanticamente, com confiança auditável, todas estas classes:

- legenda desejada;
- título permanente;
- watermark/logo;
- elemento gráfico;
- texto pertencente à cena.

Logo, a detecção automática completa pedida para a Fase 6 ainda está **INCOMPLETA**. A interface já permite revisar/desenhar regiões, mas o classificador semântico e a apresentação explícita de categorias/confiança ainda precisam de implementação e validação depois do benchmark de motores.

## 5. Pré-processamento, geometria e tempo

### Caminho comum

1. `ffprobe` obtém largura, altura, contagem de frames e FPS médio.
2. O pipeline trabalha em frames BGR `uint8` lidos pelo OpenCV.
3. A detecção de cenas impede que referências atravessem cortes.
4. As máscaras são geradas na resolução nativa.
5. A união temporal da máscara define uma ROI com margem padrão de 96 px.
6. A ROI é gravada em `libx264rgb`, CRF 0, `bgr24`.
7. O motor processa a ROI.
8. Se a saída não tiver a dimensão da ROI, a restauração usa Lanczos4.
9. A ROI volta à grade original em intermediário RGB sem perdas.
10. A composição final usa `maskedmerge` em `gbrp`, máscara opaca, e entrega `yuv420p` CRF 16.
11. O áudio original é remontado por stream copy quando o contêiner permite.

### ProPainter

- dimensões são ajustadas a múltiplos de oito;
- teto configurado na imagem RunPod: lado máximo 896;
- preset quality típico: subvídeo 64, vizinhança 10, stride de referência 10;
- perfil por cena pode usar janela 32 ou 80 e stride 2 ou 10;
- FP16 é usado quando CUDA está disponível e `PROPAINTER_FP16=1`;
- preservação de pixels usa PNG + padding + recorte exato quando `PROPAINTER_PRESERVE_PIXELS=1`;
- em OOM, o adapter pode reduzir a escala; isso deve gerar um braço separado ou reprovação de paridade, nunca acontecer silenciosamente no benchmark.

### DiffuEraser

- teto configurado: lado máximo 960;
- dilatação interna padrão 4;
- stride de referência 5, vizinhança 12 e subvídeo 50;
- recebe vídeo da ROI e vídeo de máscara H.264 CRF 0/YUV420;
- a saída oficial preservada é `diffueraser_result.mp4`;
- a restauração posterior volta para a grade original e pode usar Lanczos4 se houver diferença.

Os parâmetros temporais ProPainter e DiffuEraser são diferentes. “Mesma condição” significa manter entrada, frames, resolução de avaliação, máscaras, suporte final, FPS e encode final iguais; não significa forçar parâmetros internos que têm semântica diferente. Cada motor deve ter uma configuração fixa e pré-declarada.

## 6. Onde podem ocorrer perdas

| Etapa | Situação atual | Como isolar |
|---|---|---|
| Upload do navegador | grava bytes e calcula SHA-256; não há encode intencional | comparar hash no cliente, Hostear e arquivo servido |
| Hostear → RunPod | download HTTP é cópia de bytes | registrar SHA-256 antes/depois |
| Preparação de chunk | `slice_video` recodifica H.264 CRF 16/YUV420, sem áudio | comparar com o original por índice e com braço identity |
| Entrada da ROI | `libx264rgb` CRF 0/BGR24 | verificar delta no decode simétrico |
| Máscara DiffuEraser | PNG é convertido para vídeo H.264 CRF 0/YUV420 | comparar suporte binário antes/depois do decode |
| Resize do motor | teto de lado, múltiplos de oito e fallback OOM | registrar geometria real e proibir fallback silencioso |
| Saída upstream ProPainter | caminho antigo usava `imageio quality=9`; caminho preserve-pixels pode guardar PNG/lossless | capturar PNG/tensor antes do MP4 |
| Saída upstream DiffuEraser | MP4 oficial antes da restauração | instrumentar PNG/frames crus ou executar controle de roundtrip |
| Restauração de ROI | Lanczos4 se a grade divergir | registrar `resize_applied` e comparar antes/depois |
| Composição | `gbrp maskedmerge` → H.264 CRF 16/YUV420 | gerar master RGB lossless e delivery separadamente |
| Corte de overlap | `trim_edges` pode recodificar novamente em CRF 16 | braço sem overlap e braço com overlap, mesmos frames |
| Concatenação | tenta stream copy; fallback recodifica CRF 16 | registrar qual ramo ocorreu |
| Áudio | stream copy; AAC apenas em incompatibilidade | não afeta pixels, mas registrar para custo e duração |
| Download final | cópia de bytes | hash storage/cliente |

O upload/download por si só não degrada imagem se os hashes coincidirem. O caminho RunPod atual contém encodes de preparação e, em certos chunks, de recorte. Portanto a infraestrutura pode introduzir perda mesmo com transporte bit a bit.

## 7. Contrato congelado do benchmark

Antes da primeira inferência, cada caso terá um manifesto imutável com:

- SHA-256 do arquivo original;
- índices exatos e PTS dos frames;
- resolução nativa e FPS racional;
- corte de cena;
- sequência PNG da seleção autorizada;
- sequência PNG da máscara de inferência;
- sequência PNG da máscara de composição;
- conversão de cor declarada;
- hashes de código, imagem, pesos e modelos;
- seed e precisão;
- parâmetros internos do motor;
- comando completo sem segredos;
- contrato de master e delivery.

Todos os braços receberão o mesmo master canônico, os mesmos frames e as mesmas máscaras congeladas. A detecção automática será avaliada em uma trilha separada; ela não poderá mudar a máscara durante a comparação dos motores.

Master de trabalho proposto:

- frames PNG/RGB ou vídeo `libx264rgb` CRF 0;
- resolução e FPS do original;
- sem resize global;
- sem áudio durante a inferência;
- composição em RGB;
- master final RGB sem perdas;
- uma única entrega comum H.264 CRF 14, `yuv420p`, BT.709/range documentados;
- controle `SOURCE → mesmo encode final`, sem IA.

O CRF 14 foi escolhido porque a Fase 2 mostrou ganho pequeno ao cair para CRF 12, com aumento de arquivo. CRF 16 pode ser mantido somente como ablação de transporte, não como entrega diferente entre candidatos.

## 8. Braços do benchmark

| ID | Braço | Objetivo | Elegível ao ranking final |
|---|---|---|---|
| T0 | SOURCE → transporte local → delivery | piso do codec local | controle |
| T1 | SOURCE → chunks Hostear/RunPod → delivery, IA identidade | custo visual da infraestrutura | controle |
| A | ProPainter + máscara refinada + junções/doadores, execução local | legacy/local reproduzível | sim |
| B | ProPainter puro local, sem junções | isolar o motor local | sim |
| C | ProPainter puro na infraestrutura atual | medir ambiente/RunPod com o mesmo motor | sim, somente se parâmetros e geometria coincidirem com B |
| D | DiffuEraser puro na infraestrutura atual | comparar reconstrução neural | sim |
| E | `scene-roi-v4` completo com DiffuEraser + `legacy_refined` + junções | avaliar o produto atual | sim |
| E2 | `scene-roi-v4` completo com ProPainter + `legacy_refined` + junções | separar política de motor | sim |
| H | outputs históricos v3 e “95%” | referência de regressão | visual; não causal quando o contrato divergir |
| F | VMake disponível para o mesmo material | referência externa | visual cega; não é GT nem donor |

A e E não são apenas motores; incluem política e pós-processamento. B, C e D comparam motores/infraestrutura. E versus E2 responde se DiffuEraser acrescenta valor dentro do mesmo produto. T0 versus T1 responde se RunPod/chunking degrada a imagem sem envolver IA.

Se a RTX 2060 local não conseguir executar B com a mesma geometria e precisão de C, o par será marcado `NOT_COMPARABLE_RESOURCE_LIMIT`; não será reduzido silenciosamente para produzir um número.

## 9. Conjunto de validação

O acervo atual contém um vídeo real principal de 1080×1920, 30 FPS, com cenas de janela, fivela/roupa, pessoa e tecido, além de controles sintéticos de fundo estático, pan e corte. Ele não cobre sozinho as 15 categorias exigidas.

Conjunto mínimo proposto: 30 casos curtos, dois por categoria, com um caso de desenvolvimento e um holdout não usado para ajustar parâmetros:

1. fundo parado simples;
2. fundo com textura;
3. pessoa atravessando a legenda;
4. roupa atrás da legenda;
5. cabelo atrás da legenda;
6. rosto próximo da legenda;
7. câmera em movimento;
8. movimento rápido;
9. mudança de cena;
10. texto pequeno;
11. texto grande;
12. legenda com sombra/borda;
13. fundo com linhas/geometria;
14. água, fumaça ou luzes;
15. vídeo comprimido de rede social.

Reutilização imediata:

- janela/emenda: frames 33–35;
- fivela/estrutura: 87–89;
- tecido/roupa: 119–121;
- cena completa de 147 frames para movimento e cortes;
- Pedro de 5 s para karaoke/contorno colorido;
- controles sintéticos existentes para fundo estático, pan e corte.

Categorias sem dois casos independentes ficam `DATASET_GAP`; não serão preenchidas duplicando frames do mesmo vídeo como se fossem amostras independentes.

## 10. Métricas

### Fora da reconstrução

Gates obrigatórios no master lossless:

- pixels alterados fora da máscara final: 0;
- delta máximo fora da máscara: 0;
- geometria, frame count, PTS e FPS idênticos;
- SSIM/PSNR fora da máscara no delivery, sempre comparados também ao controle de encode;
- diferença Y, Cb e Cr e mudança de cor contra o controle de transporte;
- anel externo da borda para detectar emenda.

### Dentro da reconstrução

- OCR/resíduo por cor e forma, com revisão manual para sombra preta;
- sharpness e energia de gradiente, tratados como descritores porque podem premiar ruído;
- estabilidade de textura e correlação local;
- borda artificial e `boundary_step` relativo ao source;
- ghosting, duplicação, buracos, warping e geometria por anotações estruturais;
- consistência temporal com fluxo e erro de correção entre frames;
- flicker de baixa e alta frequência após compensação de movimento.

### Quando existe ground truth

- PSNR e SSIM dentro e fora da máscara;
- LPIPS na região reconstruída;
- erro temporal contra GT alinhado;
- preservação de bordas e textura.

Em vídeo real coberto por legenda não existe GT do fundo oculto. Nesse caso, PSNR/SSIM dentro da máscara contra o SOURCE mediriam a legenda que deveria desaparecer e seriam inválidos. GT será obtido por ocultação sintética de regiões originalmente limpas ou por captura controlada com/sem overlay.

O repositório já tem SSIM/PSNR, deltas externos, métricas de luma/chroma, proxies temporais com flow, textura e gates estruturais em scripts de pesquisa. LPIPS, classificação robusta de ghosting/warping e um agregador único ainda precisam ser implementados antes da execução completa.

## 11. Comparação visual e teste cego

Cada caso produzirá um único HTML offline com:

- INPUT | LEGACY | PROPAINTER LOCAL | PROPAINTER RUNPOD | DIFFUERASER | VMAKE;
- reprodução sincronizada;
- play/pause conjunto;
- avançar/voltar um frame;
- loop do intervalo crítico;
- zoom 1×/2×/4×;
- alternância de versões;
- grade, lado a lado e tela isolada;
- diferença absoluta e heatmap;
- slow motion 0,25× e 0,5×;
- painel de frames críticos.

Uma segunda página randomizará os candidatos por caso como A/B/C/D sem nome do motor. O mapeamento será salvo em arquivo separado e revelado somente depois do envio das notas:

- reconstrução: 0–10;
- estabilidade temporal: 0–10;
- preservação: 0–10;
- naturalidade: 0–10;
- artefatos: 0–10, onde 10 significa ausência de artefatos.

Também será registrada preferência par a par e empate. Um único revisor gera evidência útil, mas não consenso. Para decisão comercial forte, usar pelo menos três revisores e reportar discordância e intervalo de confiança.

## 12. Performance e custo

Cada job terá fronteiras de tempo separadas:

- upload do cliente;
- preparação do chunk;
- fila RunPod;
- cold start;
- carregamento de modelos;
- decode e máscara;
- inferência sincronizada em CUDA;
- junções/composição;
- encode;
- upload do resultado;
- download e montagem final;
- tempo total percebido pelo usuário.

Registrar também GPU, VRAM total/pico, RAM/RSS pico, frames, megapixels, segundos por frame, FPS efetivo, retries, falhas/OOM, preço por hora e saldo antes/depois. O delta de saldo é aproximação e deve ser confrontado com métricas faturadas do provedor.

No teste v4 observado: RTX 4090, 150 frames, 374,88 s no handler e delta de saldo aproximado de US$ 0,08207. Isso é baseline de custo, não previsão universal.

Para evitar custo ocioso durante o benchmark: workers ativos 0, máximo 1 por padrão, um job por vez, desligamento curto e imagem/digest congelados. Paralelismo mede vazão; não melhora a qualidade de um vídeo e não deve contaminar a primeira comparação.

## 13. Ordem de execução

### Rodada 0 — validar o instrumento, sem GPU paga

1. congelar manifests, máscaras e hashes;
2. unificar métricas já existentes;
3. implementar métricas ainda ausentes;
4. gerar HTML visual e página cega;
5. rodar controles sintéticos identity/Telea;
6. provar que o harness detecta alterações externas, troca de frames e flicker inserido.

### Rodada 1 — isolar infraestrutura e caso crítico

1. T0 versus T1 no Pedro e no trecho do tecido;
2. B versus C com ProPainter e contrato idêntico;
3. D puro com a mesma entrada/máscara;
4. E e E2 com a mesma saída final;
5. revisão cega antes de abrir o mapeamento.

Se T1 falhar preservação, corrigir o transporte em laboratório e repetir T1. Não avançar para ranking de motores com transporte desigual.

### Rodada 2 — conjunto estratificado

Executar os braços aprovados na Rodada 1 nos 30 casos. Parâmetros ficam congelados; qualquer ajuste cria nova revisão e exige repetir o holdout.

### Rodada 3 — detecção automática

Com o motor escolhido e máscaras manuais congeladas como teto:

1. avaliar recall/precision de legenda, título, rodapé e watermark;
2. introduzir classificação semântica e confiança;
3. impedir remoção automática de texto da própria cena;
4. exibir overlays editáveis antes do processamento;
5. medir diferença de qualidade entre máscara manual e automática.

## 14. Regra de decisão

- Se legacy/local empatar ou ganhar visualmente, ele vira padrão.
- Se DiffuEraser ganhar apenas em categorias específicas e o ganho superar custo/latência, ele vira modo **Máxima / casos difíceis**.
- Se DiffuEraser não trouxer ganho perceptível no teste cego, sai do caminho padrão.
- Se T1 mostrar degradação material, RunPod não será avaliado como causa neural até o transporte ser corrigido.
- Se ProPainter local e RunPod forem equivalentes em qualidade, a escolha entre eles será operacional: capacidade, fila, custo e tempo.
- Duas engines só permanecem se houver regra de roteamento verificável por categoria ou gate; preferência subjetiva vaga não basta.
- RunPod pode ser removido se a solução local atender qualidade e capacidade necessárias, ou mantido apenas como fallback de escala.

Nenhum candidato é aprovado se falhar preservação externa, estrutura crítica, continuidade de cena ou revisão cega, ainda que tenha melhor `residual_text`.

## 15. Condições para fechar a Fase 6

A Fase 6 permanece aberta até existirem:

- dataset mínimo e holdout;
- contrato congelado e hashes;
- controle de transporte T0/T1;
- resultados A–E2 nas condições aplicáveis;
- métricas completas com nulos honestos onde não há GT;
- HTML sincronizado e teste cego respondido;
- custo e performance ponta a ponta;
- decisão local/RunPod/híbrido;
- decisão de engine padrão e fallback;
- detecção automática avaliada com edição de máscara;
- gate de licença resolvido para qualquer uso comercial;
- `docs/PHASE-6-FINAL-REPORT.md` preenchido com resultados reais.

O relatório final não deve ser criado como documento de aprovação antes dessas evidências. Até lá, o estado correto é **PHASE 6 — IN PROGRESS / BENCHMARK REQUIRED**. O redesign completo do editor começa somente depois dessa decisão.

## 16. Próximo trabalho autorizado pelo plano

O próximo passo é a Rodada 0: construir o harness unificado, os manifests dos casos reutilizáveis, as métricas ausentes e o HTML cego, sem alterar o pipeline de produção e sem iniciar GPU paga. Ao terminar, será possível apresentar o conjunto exato de jobs e o teto de custo antes da Rodada 1.
