# PHASE 5.5 — INDEPENDENT TECHNICAL REVIEW

Data: 11/09/2026. Escopo: revisão crítica das Fases 1–5, código do working tree e arquivos efetivamente produzidos. Nenhuma mudança no pipeline, modelo, configuração do site ou infraestrutura foi implementada nesta rodada. Os scripts novos são instrumentos de auditoria; os controles gerados não são candidatos de melhoria.

Artefatos: `G:/dowloand/teste/phase-5-5-independent-review-20260911/`.

## 1. Executive conclusion

**DO NOT START PHASE 6 YET. Execute primeiro o Experimento 1 definido na seção 11.**

Estamos atacando um problema real de reconstrução, mas ainda não isolamos todo o problema de fidelidade da entrega. A evidência não justifica trocar o ProPainter agora nem acrescentar outro enhancer.

As conclusões principais são:

1. **O master B2 não perdeu detalhe global fora da máscara em relação ao SOURCE canônico usado nas fases.** A auditoria independente reproduziu delta zero, SSIM=1 e razão de gradientes=1 nas áreas protegidas amostradas. O problema de textura no suéter não explica diferenças de rosto, cabelo ou cor fora da área processada.
2. **O delivery perde fidelidade mesmo sem IA.** O controle SOURCE→export da Fase 2 reproduz quase exatamente o erro externo do delivery B2. Há ainda recodificações adicionais no caminho de chunks do backend. Isso deve ser tratado antes de calibrar aparência ou atribuir toda a diferença à rede.
3. **“BT.709 resolvido” foi uma conclusão ampla demais.** Matriz explícita não elimina diferenças de arredondamento, reconstrução de chroma, tags ausentes e contrato do decoder. Um controle sem compressão com perdas reproduziu quase todo o viés de brilho observado em um frame.
4. **O limite de informação temporal não foi demonstrado.** A cena vai até o frame 198, mas o ProPainter da Fase 3 recebeu apenas 104–146. A busca principal de donors usou sete índices, todos até 146. “96% sem donor aceito” não equivale a “96% sem textura real disponível”.
5. **A Fase 5 rejeitou duas configurações de uma abordagem, não toda restauração temporal.** O ensaio foi um crop de 0,6 s, com uma saída neural compartilhada, duas misturas e sem avaliação humana cega em movimento. A decisão de não promover foi correta; a generalização para “restauradores não resolvem” seria incorreta.

O menor caminho com boa relação custo/benefício é: **contrato de cor/entrega e equivalência laboratório→backend; depois contexto temporal real da cena; somente então uma alternativa de inpainting local, se ainda necessária.**

Esta é uma reavaliação independente das hipóteses, não uma revisão cega por outra equipe. Eu também produzi parte dos experimentos anteriores; por isso os resultados abaixo distinguem observação reproduzida, inferência e julgamento visual. Nenhum percentual de “95% de qualidade” foi validado como métrica.

## 2. Reconstruction diagnosis

### O que é demonstrado

- B2 combina C2 com pixels remapeados de donors do próprio SOURCE; mantém cenas anteriores de um baseline recomposto da V3.
- A faixa artificial está visível em uma predição de janela do ProPainter **antes** da agregação final e do encode de entrega. Ver `first-window-frame120.png`.
- Em seis frames auditados — 106, 116, 120, 126, 133 e 140 — o model input sem padding coincide exatamente com o crop do prepared input. O PNG denominado raw-output coincide exatamente com o PNG upstream após recorte do padding.
- A soma temporal e a quantização existem, mas não são explicação suficiente para toda a faixa. No frame 120, média float das duas predições versus saída salva, usando a máscara de entrada recortada para 294×820: MAE mascarado 0,7331, máximo 1,4844 níveis; dispersão média entre predições 1,2684. A textura artificial já aparece antes dessa diferença. Evidência: `aggregation-frame120.json`.

### O que ainda não é demonstrado

**ProPainter como limite arquitetural: POSSIBLE, não CONFIRMED.** A geometria nativa está correta na Fase 3, mas a rede não recebeu todo o contexto da cena; não houve controle fp32; não foi isolado o benefício de referências limpas além do trecho entregue.

**Ausência física de donors: UNSUPPORTED.** O relatório real classifica 93,40% como UNCERTAIN e 2,60% como OCCLUDED sob a busca limitada. A ausência de aceitação pode vir de máscara contaminada, limiar conservador, alinhamento impreciso, suporte distante ou falta de informação. São causas diferentes.

O pool `[104,112,116,128,136,145,146]` não pesquisa sistematicamente os frames 147–198. O código tem uma opção `extended`, mas o relatório principal registra `expanded_context=false`, e não foi encontrado resultado dessa opção na pasta de donors desta rodada.

### Fragilidades específicas do donor audit

- Usa Farneback em imagens onde o texto foi neutralizado por Telea; depois interpola coordenadas de flow dentro da máscara. Isso é uma estimativa de correspondência, não movimento observado sob o texto.
- Erro ida/volta baixo em regiões interpoladas pode indicar autoconsistência de duas estimativas incorretas. O código reconhece essa limitação, mas a nomenclatura “real pixel” pode esconder a incerteza geométrica.
- Exige concordância entre dois donors que podem ser temporalmente correlacionados; isso não constitui duas observações independentes.
- O teste de gradiente fotométrico usa somente Sobel horizontal. Estruturas verticais e horizontais não recebem validação equivalente.
- A busca foi alimentada por `native-precise`, enquanto essa família de máscaras já havia apresentado resíduos de efeitos associados no inpainting. Um donor fora da máscara não está automaticamente livre de sombra/ciano. Isso é risco de contaminação, não prova de que os 18.508 pixels aplicados estejam errados.
- O remapeamento RGB usa interpolação bilinear. “Pixels reais” significa **amostras derivadas do vídeo**, possivelmente interpoladas; não significa cópia bit a bit de um pixel sensor nem preservação completa das frequências finas.
- A restrição de suporte a até 18 px de área observada favorece bordas e pode excluir o centro de uma faixa larga por construção. Baixa cobertura não mede apenas disponibilidade temporal.

### Máscaras e composição

Separar máscara de inferência da máscara de composição foi útil para controlar experimentos, mas cria uma interação: a rede pode reconstruir uma região maior e apenas um recorte dela chegar à saída. A continuidade na borda final precisa ser avaliada com o par de máscaras, não com cada máscara isoladamente.

A4 reduziu a área de inferência em relação à faixa fixa e melhorou cobertura de ciano. Isso não comprova que seu halo seja mínimo ou que os pixels próximos às letras estejam todos irrecuperáveis. A área de 538.097 ocorrências usada no denominador dos donors também não é a mesma área acumulada de inferência da A4; não extrapolar a porcentagem para o frame inteiro ou para todos os pixels reconstruídos.

## 3. Global fidelity diagnosis

### Método desta revisão

Foram decodificados os primeiros 147 frames de cada arquivo, com métricas em **15 frames estratificados** entre 0 e 146. Região filmada `[25,540,1055,1660]`, excluindo seis pixels de borda e a máscara de legenda dilatada em seis pixels. O layout preto, títulos e logotipo não dominam as médias. Os filtros SSIM/gradiente não atravessam a área mascarada graças à guarda.

SOURCE significa decode explícito BT.709 limited→BGR full com o mesmo contrato da entrada canônica das fases. Isso é uma referência operacional reproduzível, não uma prova de calibração colorimétrica absoluta do decoder.

Médias por frame, não intervalo estatístico entre vídeos independentes:

| Arquivo / controle | MAE BGR 0–255 | PSNR médio dB | SSIM luma | Viés luma | Gradiente / SOURCE |
|---|---:|---:|---:|---:|---:|
| Prepared RGB | 0 | ∞¹ | 1,000000 | 0 | 1,000000 |
| B2 master | 0 | ∞¹ | 1,000000 | 0 | 1,000000 |
| P5 A20 master | 0 | ∞¹ | 1,000000 | 0 | 1,000000 |
| B2 delivery CRF14 | 1,3022 | 44,1267 | 0,992373 | −1,1742 | 1,001451 |
| P5 A20 delivery | 1,3019 | 44,1290 | 0,992376 | −1,1739 | 1,001333 |
| SOURCE→export laboratório, sem IA | 1,3014 | 44,1306 | 0,992383 | −1,1731 | 1,001565 |
| V3 delivery | 1,3700 | 43,5023 | 0,990540 | −1,1620 | 1,000961 |
| Compositor backend, máscara vazia | 1,3493 | 43,7105 | 0,991383 | −1,1718 | 1,000441 |
| SOURCE→slice_video | 0,6748 | 46,2979 | 0,992208 | +0,0917 | 0,994319 |
| SOURCE→slice_video→trim_edges | 0,8309 | 44,7693 | 0,989785 | +0,1446 | 0,989787 |

¹ JSON representa PSNR infinito como `null` com `perfect_match=true`; não significa indisponibilidade do teste.

**Interpretação:** a IA não é necessária para reproduzir a perda global do delivery B2. Os dois encodes de chunks reduzem gradiente/contraste local em aproximadamente 1% nesta amostra. Isso é mensurável, mas não sustenta uma alegação de “grande queda de resolução”. O HF pode até aumentar com compressão: no B2 delivery foi +1,18% e nos dois encodes +1,50%, demonstrando que essa métrica isolada premia também ruído/artefatos.

Os controles novos chamam os helpers reais `composite_masked`, `slice_video` e `trim_edges`, com IA e acabamento ausentes. O controle de composição foi forçado com máscara zero para medir o estágio; a rota normal de cena totalmente vazia pode simplesmente copiar o arquivo. Não se afirma que o site sempre executa composição vazia. Também não se afirma que esses controles equivalem ao upload→download implantado.

Para limitar corretamente o compositor a 147 quadros, foi criada uma entrada YUV420 lossless de igual duração. Seu decode foi auditado: delta zero contra SOURCE. Uma primeira tentativa com vídeo completo e máscaras mais curtas foi interrompida e substituída; não entra nos resultados.

### Cor fora da máscara

`outside-fidelity.json` contém distribuições BGR, Y′, Cb/Cr, histogramas, saturação, deslocamento circular de hue, percentis 1/99 de luma, gradientes, contraste local, edge recall e PSNR/SSIM.

Delta E76 médio aproximado: B2 delivery **0,7482**, controle laboratório **0,7473**, V3 **0,8255**, dois encodes de chunks **0,6650**. Cálculo OpenCV BGR float→Lab assume transferência sRGB: é descritor auxiliar, **não CIEDE2000 calibrado com EOTF BT.709/BT.1886**. Não o converter em nota perceptiva absoluta.

LPIPS permanece `null`: dependência/pesos não instalados neste instrumento. A igualdade exata dos masters externos já demonstra preservação nesse domínio; LPIPS não é necessário para certificar identidade. Sua ausência limita comparação perceptiva de alterações não idênticas, não deve ser preenchida com zero.

## 4. Color pipeline audit

### Transformações reais

| Etapa | Laboratório B2 | Backend alcançável no código |
|---|---|---|
| Decode | FFmpeg, matriz709 e range explícitos para BGR8 | `read_frames/read_chunk` via OpenCV; controle local coincide com601 |
| Intermediário | RGB lossless | ROI RGB lossless; corte de cena pode usar YUV420 CRF0 |
| Framework | OpenCV BGR→PIL RGB→tensor RGB; escala para domínio do modelo | Mesmo upstream, porém entrada pode ser MP4 comprimido |
| Composição | SOURCE canônico + ROI selecionada em uint8 | `format=gbrp` / `maskedmerge` / `format=yuv420p`, conversões automáticas |
| Entrega | conversão RGB pleno→YUV420 limitado709, CRF14 | compositor CRF16; etapas de chunks podem recodificar novamente |

Não foi encontrado swap RGB/BGR incorreto no percurso PNG da Fase 3. O `cv2.COLOR_BGR2RGB` da gravação upstream recebe internamente RGB e efetua a troca para BGR para `imwrite`; o nome da constante parece contraditório, mas a operação é a mesma troca de canais. Não corrigir isso apenas pelo nome.

### Achado novo: arredondamento e reconstrução de chroma

Frame120, região protegida:

| Roundtrip / decoder | MAE contra RGB canônico | Viés Y′ |
|---|---:|---:|
| RGB→YUV420 **lossless codec**→RGB, decode padrão | 1,1661 | −1,1739 |
| Mesmo YUV, decode com `accurate_rnd+full_chroma_int` | 0,3511 | +0,0273 |
| Controle CRF14, decode padrão | 1,2819 | −1,1244 |
| Mesmo controle CRF14, decode accurate | 0,7612 | +0,0853 |

**O termo dominante de brilho desse roundtrip não exige compressão com perdas nem IA.** Esses flags mudam arredondamento/interpolação; não são uma correção de brilho artística. A documentação distingue matriz, range, interpolação de chroma, arredondamento e scaling com gamma. [FFmpeg scaler](https://ffmpeg.org/ffmpeg-scaler.html), [filtro scale](https://ffmpeg.org/ffmpeg-filters.html#scale-1).

Limitação fundamental: ao aplicar o decoder accurate também ao SOURCE, ele fica aproximadamente **+1,2344** níveis de Y′ acima da referência canônica padrão nesse frame. Portanto não é legítimo aplicar flags só no candidato e anunciar melhoria contra uma referência decodificada de outro modo. O próximo contrato deve calibrar ambos os lados com rampa/barras conhecidas e verificar também os planos YUV originais. O resultado atual identifica a origem parcial do viés; não autoriza trocar o decoder sem revalidar a referência.

OpenCV SOURCE frame120 coincide exatamente com decode601 no frame completo; MAE contra709 padrão **0,365335**. Foi reproduzido nesta revisão. Isso não prova que todo backend remoto ou todo build OpenCV se comporte assim; prova o risco concreto deste caminho local.

### Tags e limites de precisão

- B2 master e B2 delivery estão sem `color_transfer` e `color_primaries` no ffprobe atual; ambos também omitem SAR/DAR. P5 master apresenta as mesmas ausências. P5 delivery recebeu a correção de tags da rodada anterior e apresenta709 completo.
- Tags ausentes não provam transformação errada dos pixels; criam ambiguidade de exibição. Igualdade RGB sem perdas não garante tratamento idêntico pelos players.
- Os frames são 8-bit desde SOURCE. O master GBR 4:4:4 preserva o RGB já decodificado, mas não recria chroma que faltava na entrada420.
- A saída420 volta a amostrar chroma. Mesmo CRF0 não torna RGB→420 reversível.
- Não há evidência de HDR, tone mapping ou conversão ampla de gamut neste material. Não se deve introduzi-los.
- Primárias, curva de transferência, matriz e range são propriedades distintas. `colorspace=bt709` sozinho não configura todas nem lineariza luz.
- Os blends e filtros auditados trabalham em RGB codificado, não luz linear. Isso é parte do contrato atual; mudar gamma de composição sem ablação pode piorar bordas.
- Quantização e clipping existem: SOURCE→BGR8, tensor→uint8 ProPainter e clamp/rint na composição P5. O raw float16 C2 auditado ficou entre 2,1172 e 195,0; nenhum valor fora de0–255 foi encontrado nas predições salvas, portanto wraparound não explica este caso.

## 5. Resolution/detail audit

Todos os arquivos principais têm 1080×1920. Isso não significa que todas as etapas tenham trabalhado nessa resolução nem que todos tenham a mesma textura.

| Arquivo | Pixel format / bits | Bitrate vídeo | Profile / level | FPS / timebase | SAR/DAR |
|---|---|---:|---|---|---|
| SOURCE | yuv420p / 8 | 6,440 Mb/s² | High /4.1 |30;1/30 |1:1;9:16 |
| B2 master | gbrp /8 |82,821 Mb/s |High444Predictive /4.0 |30;1/15360 |ausentes |
| B2 delivery | yuv420p /8 |3,810 Mb/s |High /5.0 |30;1/15360 |ausentes |
| P5 A20 master | gbrp /8 |82,824 Mb/s |High444Predictive /4.0 |30;1/15360 |ausentes |
| P5 A20 delivery | yuv420p /8 |3,810 Mb/s |High /5.0 |30;1/15360 |ausentes |
| Vmake | yuv420p /8 |18,691 Mb/s |High /4.1 |≈29,82955;1/29829546 |1:1;9:16 |

² Bitrate SOURCE é do vídeo completo de80,67s, não bitrate medido só do trecho. Comparação absoluta com o clipe comercial requer essa ressalva. Dados completos: `ffprobe-forensics.json`, incluindo `width`, `height`, `r_frame_rate`, `avg_frame_rate`, `time_base`, stream/container, PTS e GOP observado.

Keyframes nos primeiros147 quadros: SOURCE `[0,60,120]`; V3 `[0,74,104]`; B2/P5 masters e deliveries `[0]`; Vmake a cada10 quadros. Uma amostra curta não revela o keyint máximo configurado. Level5.0 não significa qualidade superior; pode ser uma exigência adicional de decoder. Ausência de SAR não prova distorção: a grade nominal continua9:16, mas o contrato deve ser explícito.

O Vmake destina aproximadamente **4,9×** o bitrate do delivery B2 ao arquivo observado. Isso pode ajudar a conservar detalhes presentes na sua entrada de encode, mas não prova que explique o detalhe adicional ou que aumentar o nosso bitrate recrie textura.

**V3:** houve reamostragem ROI820×294→816×288→820×294 no suéter, além de MP4 intermediário. Fase1 removeu essa pequena reamostragem e o codec intermediário juntos; portanto não isolou a contribuição de cada um. A fivela regrediu naquela rodada e cenas antigas permaneceram no baseline posterior.

**Fase3/B2:** crop820×294 com padding824×296; remoção exata do padding. Não foi identificado downscale escondido nesse ensaio. Há chamadas de resize upstream para a mesma dimensão; elas não equivalem a reduzir a grade. No backend geral, limite de lado e fallback OOM `[1,.72,.55,.42]` ainda permitem redução espacial.

**Fase5:** crop nativo512×224→rede x4→área para512×224. Não é restauração nativa1×: existe integração espacial dos detalhes que o modelo produziu em4×. Isso pode eliminar parte do ganho ou enfatizar padrões; não foi ablado. A camada de limpeza também pode remover detalhe, e o modelo não foi desenhado para garantir recuperação verdadeira de tecido previamente inpaintado.

## 6. Pipeline stage attribution

| Transformação | Evidência | Atribuição permitida |
|---|---|---|
| SOURCE→prepared RGB | delta0 nas amostras com mesmo decode | preserva referência canônica; calibração de decoder ainda aberta |
| Prepared→model input C2 | delta0 em seis crops | sem perda por resize nessa preparação |
| Modelo/propagação→predição individual | faixa já visível no frame120 | problema existe antes do encode e overlap final |
| Predições→PNG upstream | float16→uint8 + agregação recursiva | pequena quantização/suavização medida; não origem exclusiva da faixa |
| PNG upstream→raw-output ROI | delta0 nos seis crops | recorte de padding sem reamostragem |
| ROI→C2→B2 | substituição no suporte + donors bilineares | bordas/máscaras e escolha de donors ainda influenciam resultado |
| B2 master→delivery | controle sem IA reproduz erro externo | custo de cor/codec independente de reconstrução |
| Fase5 raw→ROI→mistura | x4→área→delta limitado/feather/rampa | ganho atenuado por desenho; não mede o máximo do modelo |
| Backend slice/trim | dois encodes CRF16 comprovados | perda cumulativa antes/depois da inferência possível |

Correção de nomenclatura: `raw-output/*.png` da Fase3 **não é tensor bruto da rede**. É saída upstream já recomposta, quantizada e agregada. Os verdadeiros registros antes dessa agregação são `run/raw_predictions/*.npz`. Eles ainda vêm depois da propagação e não incluem todas as etapas internas de flow/feature. A Fase5 guardou raw float32, cleaned input e ROI nativa separadamente, o que é melhor instrumentação.

Comparações de todas as etapas com ground truth dentro da legenda seriam inválidas: SOURCE contém texto ali. Para avaliar reconstrução verdadeira, precisa-se de fundo conhecido em um teste com sobreposição controlada ou de correspondência temporal comprovada.

## 7. ProPainter integration audit

Referência: runner local auditado e [implementação oficial](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/inference_propainter.py). Hash do runner nos relatórios C2; hashes do working tree em `code-hashes.json`.

| Aspecto | C2/B2 laboratório | Upstream / backend | Julgamento |
|---|---|---|---|
| Preprocess | PNG BGR→PIL RGB→tensor | upstream suporta PNG ou MP4/OpenCV | PNG evita ambiguidade YUV no modelo |
| Dimensão |824×296 com padding | upstream arredonda para múltiplos8; adapter comum pode downscale | C2 correto; não generalizar ao produto |
| Máscara |safe-wide + dilatação2 | mesmo argumento dilata flow e máscara de imagem | efeito combinado, não somente máscara final |
| References |stride2 | default upstream10 | maior densidade não significa melhor correspondência |
| Neighbors |argumento6 | stride interno3; normalmente7 vizinhos efetivos | relatório deve distinguir parâmetro e contagem real |
| Subvideo |43 em sequência43 | default80; controla vários estágios e número de refs | “window” não é uma única janela temporal |
| Flow |RAFT + recurrent flow completion oficiais | sem substituição identificada em C2 | qualidade das correspondências não medida por GT |
| Precisão |fp16 | upstream permite fp32 | não houve ablação fp32 neste trecho |
| Overlap |média recursiva50/50 + cast uint8 | comportamento oficial | variantes mean/median próximas, não prova para qualquer vídeo |
| Composição |máscara arquivada posterior à composição upstream | backend usa maskedmerge com encode | dois suportes diferentes precisam de inspeção conjunta |
| Saída |PNG/GBR lossless | backend default `PROPAINTER_PRESERVE_PIXELS=0` aceita MP4 upstream | laboratório não reproduz default operacional |

Outro confundidor: C0 usa32 em sequência43 e C2 usa43. Isso muda tanto segmentação de flow/propagação quanto o ramo `ref_num`, que passa de limitado a referências globais. Portanto o ensaio “uma variável window” altera várias operações internas. O resultado não identifica qual delas ajudou.

O comentário upstream de propagação diz garantir mínimo100, mas o código usa `min(100, args.subvideo_length)`. A execução segue o código. Não dimensionar contexto pelo comentário.

Os flags opt-in de preservação não aparecem habilitados por padrão no Docker/caminho principal auditado. Não foram consultados secrets nem configuração remota; **estado implantado permanece UNVERIFIED**. Não é correto afirmar que o site já entrega o B2 porque o laboratório o produziu.

## 8. Vmake comparison

O alinhamento disponível é perceptivo, com offset global−3 e ambiguidade de um quadro em pontos da cena. Não há prova de mesma exposição, mesma versão pré-upload ou ausência de mudança de escala/crop anterior. Por isso não foram calculados PSNR/SSIM de reconstrução contra Vmake.

No par SOURCE120 / Vmake117, descritores de áreas externas à legenda mostraram:

| Região | HF Vmake/SOURCE | Gradiente Vmake/SOURCE | ΔY′ médio | Δsaturação |
|---|---:|---:|---:|---:|
| Rosto |2,41× |1,90× |−0,19 |−0,0077 |
| Cabelo |2,91× |1,55× |+0,03 |−0,0018 |
| Fundo |1,19× |1,03× |−0,17 |−0,0031 |
| Suéter fora da legenda |1,71× |1,27× |+0,27 |−0,0102 |

Isso confirma diferença de estatísticas locais **nesse par aproximado**, não detalhe real recuperado. A afirmação anterior de saturação global maior não é sustentada por esses crops; a saturação média foi ligeiramente menor. Luma média próxima não exclui diferença de contraste local. O fundo muda muito menos que cabelo/rosto, o que torna uma diferença de acabamento ou detalhe seletivo plausível, mas não identifica um algoritmo.

| Hipótese | Classificação | Evidência / limite |
|---|---|---|
| A. Preserva mais informação real | **POSSIBLE** | encode mais generoso; não conhecemos o master recebido/gerado por eles |
| B. Sintetiza melhor textura | **POSSIBLE** | faixa parece menos artificial em amostras; falta GT limpo |
| C. Aplica sharpening | **POSSIBLE** | maior energia de borda; também pode vir de restauração, fonte, foco ou alinhamento |
| D. Aumenta contraste local | **POSSIBLE** | comportamento compatível; sem isolamento causal |
| E. Aplica color grading global | **UNSUPPORTED** | nenhuma evidência direta; não há aumento uniforme de brilho/saturação nos crops |
| F. Usa encode diferente | **CONFIRMED** | bitrate, GOP, level e timebase distintos |
| F explica sozinho a superioridade | **UNSUPPORTED** | não recupera frequências ausentes do master; falta controle no mesmo master |
| G. Combina reconstrução e acabamento | **POSSIBLE** | compatível com observações, não identificado |

Não é necessário escolher uma explicação proprietária para melhorar o nosso sistema. A prioridade é preservar informação disponível e demonstrar ganho no nosso master. Vmake permanece somente referência visual.

## 9. Architectural problems

### Problemas de engenharia atuais

1. **Contratos diferentes entre laboratório e backend.** Preservação experimental, decode de cor e composição não são um único caminho verificável.
2. **Probabilidade de perda por transporte.** `slice_video` CRF16 antes da GPU; `trim_edges` CRF16 depois; concat pode recodificar se copy falhar. Essa cadeia é independente do mérito da engine.
3. **Telemetria incompleta para qualidade.** `Probe` retém dimensões/FPS/duração/áudio, não contrato de cor, bit depth, SAR ou timestamps por quadro. FPS médio não representa corretamente VFR geral.
4. **Gate pode produzir métricas fictícias quando desligado.** Em `tasks.py`, `verify_on=False` retorna `residual_text=0`, `sharpness_ratio=1`, `temporal_consistency=1`. Isso é default de código, não medição. Não utilizar como evidência de qualidade.
5. **Baseline híbrido.** B2 preserva resultados históricos de outras cenas e aplica C2/donors no suéter. Não é um teste limpo de uma configuração única no vídeo inteiro.
6. **Amostra excessivamente reutilizada.** Um clipe e muitos frames do mesmo clipe não formam vários casos independentes; selecionar o melhor nessa amostra pode superajustar máscara e textura.

### Outras arquiteturas: decisão de custo-benefício

Não há prova de que atingimos o teto de ProPainter. Assim, a tabela é triagem, não recomendação de migração nem ranking empírico neste vídeo.

| Opção | Ganho esperado aqui | Complexidade / risco | VRAM, latência e custo | Viabilidade comercial |
|---|---|---|---|---|
| ProPainter com contexto real completo | melhor chance de usar textura observada; não garantido | baixa/média; risco de propagação errada e VRAM maior | C2 atual43f≈190s local; novo custo/VRAM desconhecidos | licença S-Lab limita uso não comercial; requer autorização específica para uso comercial |
| Propagação de textura com donors validados | detalhe derivado da fonte; priorizar antes de gerar | média; flow/oclusão e interpolação podem errar | Farneback atual CPU; novo tempo não medido | depende de componentes/pesos escolhidos; não resolve licença de ProPainter se mantido |
| DiffuEraser local | pode sintetizar melhor áreas sem observação | média/alta; drift, alucinação, consistência e compatibilidade | autores: 960×540/250f,20GB,175s em L20; não é previsão deste crop | Apache2 no projeto, mas prior ProPainter e outros pesos têm termos próprios |
| VideoPainter | potencial contextual; não comprovado para esta legenda | alta, pipeline DiT/geração e mudança de aparência | VRAM/latência desta integração: não medidas | licença oficial restringe componentes/pesos a pesquisa/educação e proíbe comercial/produção |
| E2FGVI-HQ | baseline alternativo; sem razão comprovada para superar B2 | média, outro runtime; modelo original reduz432×240, HQ evita isso | não medido localmente | CC BY-NC4.0 no repositório auditado |
| FuseFormer / STTN | controles históricos; baixa prioridade para este gap | média; adaptar resolução e avaliar capacidade | não medidos; não prometer economia | STTN código MIT; direitos dos pesos/dados devem ser separados. FuseFormer não validado nesta consulta |
| RealBasicVSR local | Fase5 trouxe mais acutância, não eliminou faixa | runtime já funcional; prior inadequado para trama ausente é risco | 18f,14,66s inferência local;1,29GiB alocados | revisar licença de cada peso antes de integrar; ganho aqui não aprovado |

Fontes primárias: [ProPainter licença](https://github.com/sczhou/ProPainter/blob/main/LICENSE), [DiffuEraser requisitos e componentes](https://github.com/lixiaowen-xw/DiffuEraser), [VideoPainter licença](https://raw.githubusercontent.com/TencentARC/VideoPainter/main/LICENSE), [E2FGVI-HQ](https://github.com/MCG-NKU/E2FGVI), [E2FGVI licença](https://raw.githubusercontent.com/MCG-NKU/E2FGVI/master/LICENSE), [FuseFormer](https://github.com/ruiliu-ai/FuseFormer), [STTN licença](https://raw.githubusercontent.com/researchmm/STTN/master/LICENSE).

Essas licenças foram verificadas como documentos publicados; não foi encontrada nesta auditoria evidência de autorização comercial particular do projeto. Não presumir que não exista um contrato fora do repositório, nem que “código disponível” signifique produto comercial autorizado. Nenhum contato externo foi feito.

## 10. What previous experiments missed

| Conclusão / prática anterior | Revisão crítica |
|---|---|
| “Fase2 ACCEPT; cor resolvida” | **Restringir ACCEPT ao master canônico e experimento local.** Cor de exibição, tags, decoder e integração não encerrados |
| “Perda externa é piso do codec” | **Incompleta:** roundtrip de cor sem codec com perdas reproduz viés dominante no frame120 |
| “96% requer síntese” | **Incorreta se afirmada assim:** eram incertos/ocluídos sob pool limitado; não prova impossibilidade |
| “Raw ProPainter já ruim, logo modelo é gargalo” | Raw PNG não era tensor; primeira predição confirma defeito precoce, mas input/máscara/contexto ainda podem causá-lo |
| “Uma variável temporal por vez” | Um argumento `subvideo_length` muda vários estágios internos; preciso registrar efeitos efetivos |
| “Fase5 rejeitou restauração temporal” | Rejeitou duas misturas da mesma saída, sem comparação com outra configuração/modelo |
| “Mais nítido significa mais fiel” | HF aumentou em outputs comprimidos e artificialmente detalhados; não prova fidelidade |
| “Vmake é mais saturado” | Não sustentado nos quatro crops medidos desta revisão |
| “Zero fora da máscara protege tudo” | Protege contra regressão incremental no master; não certifica qualidade antiga, cor do player ou delivery |
| “Pronto no sistema” | Não demonstrado: testes de laboratório e working tree não comprovam deploy nem paridade do site |

Fase5 também usou mapa de baixa confiança **heurístico** — diferença B2/SOURCE, máscaras e exclusão de donors — não uma estimativa aprendida ou calibrada de textura. Usou limiar de limpeza255 em vez da recomendação de teste5, threshold que favorece uma passagem. Não contou explicitamente iterações internas no log. Isso não invalida o ensaio conservador, mas delimita seu alcance.

A revisão em movimento da Fase5 consistiu em proxy temporal e teste de reprodução dos vídeos; não houve julgamento cego humano. Não confundir “vídeo reproduz” com “não há flicker”. A janela0,6s e rampas nas extremidades deixam poucos quadros em força plena. O relatório foi honesto em não promover, mas não prova limite do restaurador.

## 11. Three highest-value experiments

São os únicos três próximos experimentos recomendados. **Não foram implementados nesta revisão.** Os controles executados acima servem ao diagnóstico, não substituem os critérios abaixo.

### EXPERIMENT 1 — Contrato de fidelidade e entrega sem IA

**HYPOTHESIS:** parte da diferença global corrigível vem de conversões/encodes e divergência entre laboratório/backend; resolvê-la custa menos que outra rede.

**WHY:** controle sem IA reproduz MAE/viés de B2 delivery; roundtrip lossless isola termo de cor; chunks adicionam perda. O master já preserva o exterior, portanto não há justificativa para restaurá-lo inteiro.

**CODE AREA:** `utils/video.py`, `services/inference_region.py`, `services/chunking.py`, `scene_pipeline.py`, contrato `Probe`, montagem RunPod/Hostear; iniciar em harness isolado.

**WHAT CHANGES:** definir decode/encode colorimétrico reproduzível com rampas conhecidas e fontes reais; primeiro ablar apenas conversão/flags/tags; depois, como subrodada separada, eliminar um encode intermediário por vez. Usar o mesmo master e CRF na comparação de codec. Registrar planos YUV, RGB, primárias, transferência, matriz, range, SAR, contagem e PTS. Validar caminho local equivalente ao backend com IA substituída por identidade; manter cópia direta como teto do bypass.

**WHAT DOES NOT CHANGE:** B2, modelo, pesos, máscaras, donors, geometria, acabamento e contraste artístico. Nenhuma tentativa de imitar a cor do Vmake.

**EXPECTED RESULT:** menor viés sistemático e perda cumulativa na entrega; laboratório e backend concordam no mesmo contrato. Não promete consertar a faixa.

**RISK:** “melhorar” a métrica mudando somente o decoder do candidato; calibrar ambos contra rampa e YUV conhecido. Compatibilidade de RGB lossless/444 no transporte também deve ser avaliada.

**COST:** CPU local, cloudUS$0 se mantido local; helpers curtos auditados levaram7,86s para compositor e3,70s para slice+trim, sem incluir métricas. Tempo completo e armazenamento dependem do caso. Complexidade baixa/média, sem VRAM adicional de modelo.

**TEST METHOD:** rampa/cor sintética com valores conhecidos + três fontes independentes curtas, incluindo baixa luz; SOURCE→export sem IA e B2 master→mesmo export. Comparação simétrica de decoder, histogramas, YUV, SSIM, gradientes, bordas e revisão de movimento. Verificar outputs em navegador com metadados completos.

**PASS CRITERIA:** master externo exato; nenhuma alteração de grade/PTS; tags verificadas no arquivo, não apenas argv; em roundtrip controlado, viés absoluto de Y′≤0,25 nível; na entrega real, reduzir MAE externo≥15% frente ao controle atual sem piorar SSIM mais que0,001 ou gradiente mais que1%; obter comportamento equivalente do harness e backend para os mesmos bytes. Limiares são decisões de engenharia a validar, não métricas universais de percepção.

**FAIL CRITERIA:** ganho só por comparação assimétrica, clipping novo, shift de hue, mudança de gama/contraste artística, piora de detalhes ou resultado não reproduzido no caminho do backend. Se a mudança de conversão falhar, manter o contrato atual e atacar apenas recodificação comprovadamente redundante; registrar a limitação.

### EXPERIMENT 2 — Contexto temporal real que foi cortado

**HYPOTHESIS:** o recorte temporal104–146 deixou de fornecer correspondências úteis que existem até198 na mesma cena.

**WHY:** nem C2 nem o donor pool principal utilizaram todo o plano. Isso deve ser testado antes de concluir insuficiência de arquitetura.

**CODE AREA:** `phase23_model.py`, `phase23_donors.py`, política de referências por cena; laboratório primeiro.

**WHAT CHANGES:** somente disponibilidade temporal: incluir candidatos da mesma cena147–198, começando por frames inspecionados como livres de texto/efeitos. Manter ROI, resolução, máscara dos targets e pesos. Tratar duas subrodadas separadas: expansão do pool do donor audit com thresholds fixos; depois contexto/referências do ProPainter com blend de donors desligado para isolar a rede. Não ajustar simultaneamente máscara e flow.

**WHAT DOES NOT CHANGE:** SOURCE alvo104–146, B2 congelado, mask support final, cor/encode calibrados no Experimento1, zero sharpening, nenhum frame comercial como dado de inferência.

**EXPECTED RESULT:** comprovar ou refutar disponibilidade de trama observada; se houver ganho, reduzir a região sintética com informação do próprio vídeo.

**RISK:** nova legenda nos frames extras, oclusão real, flow interpolado autoconsistente, troca de donor causando shimmer, VRAM de sequência maior. Inspecionar cada candidato e validar em área limpa artificialmente ocultada com GT antes de aceitar pixels sob texto real.

**COST:** busca CPU local; contexto neural local se couber, sem reduzir resolução silenciosamente. C2 atual≈190s/43quadros não prevê95quadros. Definir teto operacional de15min local por tentativa e falhar com registro se exceder memória; não iniciar GPU paga automaticamente.

**TEST METHOD:** mesma cena + um controle de tecido limpo com máscara artificial; registrar donor aceito/rejeitado, flow, oclusão e confiança; comparar em movimento no mesmo encode. A máscara dos frames adicionais deve cobrir seus efeitos reais, não ser presumida vazia.

**PASS CRITERIA:** zero mudanças externas; zero regressão de fivela/rosto/cabelo; ganho de trama confirmado no controle com GT, queda≥10% no erro mascarado sem piorar estabilidade; ganho visual consistente na faixa real em velocidade normal e0,5×, sem letras. Aumento de cobertura sozinho não basta.

**FAIL CRITERIA:** textura contaminada, ganho apenas em HF, falta de ganho em movimento, mudança de geometria, flicker ou correspondência que falha no GT controlado. Se não houver ganho, classificar o trecho como sem recuperação comprovada sob contexto ampliado, sem afirmar impossibilidade física universal.

### EXPERIMENT 3 — Inpainting alternativo local, somente se necessário

**HYPOTHESIS:** após controlar entrega e contexto, uma arquitetura de síntese diferente pode preencher melhor o restante genuinamente não recuperado.

**WHY:** só nessa condição a troca de engine terá comparação causal útil. Restauração de uma faixa já artificial não é equivalente a reconstruí-la a partir de SOURCE+mask.

**CODE AREA:** harness de `diffueraser_official.py` e fronteira entre inpainting/ROI, sem integração ao produto.

**WHAT CHANGES:** substituir apenas o estimador da área residual por DiffuEraser em trecho curto, alimentado pelo SOURCE original e máscara aprovada. Comparar contra ProPainter com contexto já ampliado. Manter máscara final estrita, não aceitar automaticamente blend amplo do upstream.

**WHAT DOES NOT CHANGE:** contrato de cor, grade, FPS, suporte protegido, donors validados, encode, critério de avaliação e referência comercial somente visual.

**EXPECTED RESULT:** testar ganho de completude/microtextura sintética, não alegar recuperar fio real invisível. VideoPainter não é o candidato comercial preferido devido aos termos publicados e custo de adaptação; E2FGVI-HQ/STTN não têm evidência de maior retorno neste caso.

**RISK:** hallucination, drift, suavização temporal, modelo condicionado pelo prior atual, runtime/VRAM e licenças. Smoke isolado obrigatório, com limites e pesos verificados. Se não couber localmente, apresentar configuração e teto de custo antes de gasto.

**COST:** não medido para nosso crop. A tabela oficial DiffuEraser20GB/175s em960×540/250f serve só como referência de capacidade. Custo real=segundos efetivamente cobrados×US$/hora÷3600, incluindo carga e retries; sem preço verificado do recurso e execução, custo por3min é **desconhecido**. Complexidade média/alta; última prioridade.

**TEST METHOD:** mesmo conjunto curto com GT sintético e clipe real, revisão cega randomizada, logs de custo/VRAM/latência, overlays de delta e comparações temporais. Não testar uma lista aberta de modelos.

**PASS CRITERIA:** ganho de reconstrução visível e reproduzível nos dois casos; nenhum texto novo; nenhuma regressão protegida; melhor que o baseline em≥2 de3 avaliadores cegos, sem aumentar erro temporal confiável>5%; viabilidade de licença/custo documentada.

**FAIL CRITERIA:** ganho apenas por acutância, mais textura falsa, drift, flicker, perda geométrica, custo incompatível ou licença sem caminho comercial. Não promover automaticamente o modelo mais novo.

## 12. Phase 6 go/no-go decision

**B) DO NOT START PHASE 6 YET.**

Antes: **Experimento1**, com contrato de cor calibrado e controle sem IA no caminho equivalente ao backend. É o menor bloqueio demonstrado e o de menor custo. Ele precisa produzir resultados reproduzíveis, inclusive tags/SAR e perdas por estágio, para que uma Fase6 de variedade/custo/integração avalie o mesmo sistema que será entregue.

Depois desse gate, se B2 atender à qualidade mínima declarada, pode-se iniciar validação de variedade da Fase6 com B2 OFF; não é necessário concluir os três experimentos nem perseguir perfeição indefinidamente. Experimento2 é a prioridade de reconstrução antes de alegar limite do ProPainter. Experimento3 é condicional, não obrigatório para lançar.

Não declarar paridade com Vmake, custo real de3min ou prontidão de produção com base neste clipe. A viabilidade comercial da engine e a identidade de versão/configuração do deployment também precisam estar documentadas antes de integrar.

### Evidências reproduzíveis desta revisão

- `ffprobe-forensics.json`: propriedades, hashes, keyframes e timestamps amostrados.
- `outside-fidelity.json`:15frames, áreas protegidas, métricas e distribuições.
- `color-conversion-forensics.json`: matriz601/709, flags de decoder, roundtrip sem codec com perdas.
- `vmake-descriptors-reference-only.json`: descritores externos, sem GT comercial.
- `stage-evidence.json`: model input, PNG upstream/ROI e predições float16.
- `code-hashes.json`: working tree auditado, sem segredos.
- `control-jobs.json` e MP4s: controles reais de export, sem IA.
- Instrumentos: `research/reviews/phase55_audit.py`, `phase55_color_check.py`.

As fases anteriores, scripts de produto e baseline permanecem preservados. Custo incremental de cloud nesta revisão: **US$0**; energia/armazenamento locais não medidos. As métricas confirmam perdas técnicas pequenas e separáveis; não demonstram queda global grande de resolução nem que o Vmake tenha recuperado mais informação verdadeira.
