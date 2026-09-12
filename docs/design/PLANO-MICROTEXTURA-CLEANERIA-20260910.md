# Plano revisado de qualidade do Cleaner IA

Data: 10/09/2026. Escopo: próxima rodada de evolução, após a análise solicitada
de SOURCE, v3, candidatos das fases anteriores e referência Vmake. As fases
deste documento são uma nova sequência de trabalho; não significam que as fases
anteriores foram publicadas ou aprovadas.

## Decisão

Há oportunidades concretas de melhorar. O limite de qualidade ainda não foi
medido. O objetivo é aproximar ou superar a referência em qualidade percebida,
preservação e estabilidade, sem prometer igualdade em todo vídeo.

A prioridade precisa combinar duas frentes:

1. Preservar a imagem e controlar a aparência fora da legenda.
2. Reconstruir textura coerente onde a legenda realmente encobriu informação.

Um filtro de nitidez pode melhorar bordas presentes, mas não recupera sozinho
uma trama que já desapareceu na saída do modelo. A comparação anterior usou
v3; ela não incluía uma restauração neural bem-sucedida da fase 4.

## Evidência produzida agora

Artefatos em `G:/dowloand/teste/analise-microtextura-20260910`:

- `report.json`: 67 observações de região em 13 quadros selecionados, seis
  versões, metadados/hashes, energia de alta frequência, gradientes, contraste,
  luma/saturação, SSIM e preservação de bordas nas áreas sem legenda.
- `alignment.json`: busca temporal ampliada de -15 a +15 quadros e correspondências.
- `stage-ablation.json`: cinco quadros do suéter, intermediários v3 e fase 1.
- `etapas-sueter-frame120.png`: comparação visual antes/depois da composição e encode.
- `frame-120-edited_band.png` e demais crops: originais decodificados, sem
  redimensionar as células para esconder diferenças.

**CONFIRMED — alinhamento:** o trecho local começa no quadro zero do SOURCE.
O melhor deslocamento global da referência continua sendo -3 quadros. A busca
visual individual encontra -2 ou -3 em alguns instantes. ORB/RANSAC confirma
muitas correspondências, mas a terceira cena apresenta deslocamentos/escala
residuais: não chamamos todos os pares de quadros idênticos. Métricas pixel a
pixel contra Vmake não são prova de fidelidade do fundo reconstruído.

**CONFIRMED — preservação:** nos cinco quadros medidos da cena do suéter, o
recorte de entrada coincide exatamente com a área correspondente da entrada
local. Na fase 1, ROI restaurada coincide com saída sem perdas do modelo;
composição coincide com essa saída dentro da máscara opaca e com o original
fora dela. O maior delta por canal nesses controles foi zero.

**CONFIRMED — defeito anterior ao encode:** a faixa lisa é visível na saída
sem perdas do ProPainter da fase 1. Ela permanece no master e nos MP4s. Nas cinco
amostras, o gradiente RMS interno médio passou de 22,410 no raw/master para
22,377 no CRF14 e 22,469 no CRF12. São descritores, não notas de qualidade.
Não sustentam atribuir o defeito principal do suéter ao encode final.

**CONFIRMED — preservação versus realce:** no tecido fora da legenda da terceira
cena, o gradiente médio foi 2,612 no SOURCE e 2,595 no v3; SSIM de preservação
v3/SOURCE foi 0,9813. Na mesma região da referência visual, contraste local
médio foi 5,211 contra 4,707 no SOURCE. Isso é compatível com maior acutância,
mas também depende de movimento/registro/encode. Não identifica o algoritmo
do Vmake nem prova que seu detalhe seja o original.

**CONFIRMED — cor:** SOURCE, entrada local e v3 declaram BT.709/range limitado.
Os exports experimentais das fases 1/2 não declaram esses campos. Nas amostras
do rosto, v3 tem luma média aproximadamente 1,2 nível abaixo do SOURCE. A causa
da diferença precisa de um controle de conversão; não se corrige apenas
adicionando tags. A hipótese de Vmake ter saturação maior em todas as áreas
não foi confirmada: no tecido ela foi menor, e no rosto próxima do SOURCE.

**CONFIRMED — limitações:** um vídeo com três cenas; nenhum resultado prova
generalização ou uma porcentagem de qualidade. LPIPS ficou `null`, pois seu
pacote não está instalado. A região do SOURCE com texto não é ground truth
do fundo. O raw antigo v3 é MP4 já comprimido; os tensores/PNG anteriores a esse
encode não foram preservados. A fase 1 fornece raw sem perdas para diagnóstico.

## Fase 1 — Consolidar diagnóstico e critério de aprovação

Estado: diagnóstico local desta rodada concluído; revisão em movimento e base
independente ainda serão ampliadas. Não repetir o diagnóstico como nova inferência.

Preservar v3 e cada candidato com hashes. Separar interior da máscara, borda e
área não editada; avaliar janela, fivela, tecido, rosto e cabelo. As seis versões
medidas têm papéis distintos: SOURCE, entrada preparada, baseline v3, fase 1,
fase 2 e referência comercial.

Entrega: evidências já listadas, relatório por etapa e lista de defeitos.
Critério: nenhuma alegação de melhora com base apenas em Laplaciano, bitrate
ou três capturas. Sem comparação de cenas/instantes incompatíveis.

## Fase 2 — Fixar preservação, conversão de cor e exportação

Manter SOURCE na resolução nativa, evitar recompressão na preparação, usar
padding/recorte exato na entrada e PNG/RGB sem perdas nas etapas internas.
Reaproveitar a implementação de preservação da fase 1; ela existe e não resolveu
sozinha o tecido. Não promover automaticamente seu resultado porque houve
regressão registrada na fivela.

Criar controle SOURCE→conversão→encode, sem remoção, com a matriz/range do
SOURCE explícitos. Conferir tags e pixels decodificados nos reprodutores.
Comparar CRF14/12 partindo do mesmo master, sem recodificar v3 para tentar
recuperar detalhe. Consolidar uma única compressão de entrega quando possível.

Entrega: master de preservação, controle de codec/cor, export do mesmo trecho
e medições de mudança fora da máscara. Tudo isolado antes de integração.
Critério: fora da região autorizada, delta zero no master; encode sem viés
novo de cor e sem regressão perceptual; geometria, frames, timestamps e áudio
conferidos. Custo de armazenamento/tamanho também registrado.

## Fase 3 — Recuperar textura com máscaras e referências temporais

É a principal hipótese para a faixa lisa do suéter. O v3 esconde uma faixa fixa
de 627×100 durante os 43 quadros dessa cena. Isso reduz os pixels de contexto
temporal disponíveis, mesmo quando parte do tecido aparece sem texto.

Comparar, uma variável por rodada:

1. Máscara atual versus máscara por quadro com proteção de sombra/glow e
   estabilização temporal. Reduzir área apenas quando houver evidência de que
   o pixel não contém legenda ou efeito.
2. Referências reais da mesma cena, alinhadas por movimento, com verificação
   de oclusão e consistência de ida/volta. Reutilizar os módulos existentes e
   medir quais doadores foram aceitos e por que outros foram rejeitados.
3. Contexto/stride/janelas do ProPainter com geometria e máscara fixas. Verificar
   se a média de previsões sobrepostas está apagando detalhe.

Nenhum frame Vmake será usado como doador ou imagem de textura. Os doadores
serão quadros do próprio vídeo. Registrar mapa de cobertura: onde existe
informação original recuperável e onde será necessária síntese.

Entrega: ablações de máscara/referências, antes/depois do suéter e fivela em
sequência, mapa de confiança e artefatos de saída bruta.
Critério: trama mais contínua sem letras reaparecendo, duplicação, fivela
deformada ou tremulação; não piorar janela/rosto/bordas para ganhar no tecido.
Se não houver doador válido, não forçar transferência de textura.

## Fase 4 — Acabamento leve e estável

Sobre o melhor master anterior, comparar acabamento desligado, acabamento atual
e uma variante limitada de nitidez/contraste em luminância. O código atual já
tem acabamento; medir seus gatilhos e intensidade antes de adicionar outro.
Controlar intensidade ao longo da cena e reiniciar estado em cortes.

Separar duas áreas de aplicação: acabamento da reconstrução dentro da máscara;
e melhoria estética opcional da área filmada para quem quiser mais definição
em rosto, cabelo e roupa. Preservar títulos, moldura e identidade do vídeo.
Não usar saturação global para simular textura.

Entrega: A/B de movimento, ampliações e mapa de alterações. Parâmetros e motivos
de aplicação registrados. A intensidade deve ter um teto e uma opção desligada.
Critério: aumento percebido de definição sem halos, pele plástica, ruído mais
forte ou flicker. Não aprovar apenas porque aumentou energia de alta frequência.

## Fase 5 — Restaurador temporal pronto, se faltar textura

Se a fase 3 não recuperar detalhe suficiente e a fase 4 apenas realçar a faixa
lisa, testar um modelo temporal pronto na região problemática. RealBasicVSR
continua candidato de experimento, não uma solução aprovada; pode sintetizar
textura, sem garantia de recuperar a trama real. DiffuEraser é alternativa para
falhas de reconstrução que persistirem, com custo e regressões separados.

Antes de nova execução paga: corrigir a falha reproduzível do runtime da fase 4,
preservar logs, verificar GPU/CUDA/framework compatíveis e executar um kernel
real e um smoke do modelo. Um health que só detecta CUDA não valida inferência.
Depois processar uma única cena curta com deadline e capacidade limitada.
Comparar na resolução de entrega sem mascarar perda de qualidade por upscale.

Entrega: candidato real, logs/versionamento, tempo de modelo/cold start, memória,
preço efetivo da GPU e custo cobrado, incluindo tentativas. Se não gerar saída,
registrar falha e nenhuma alegação de qualidade.
Critério: ganho visível em movimento que justifique custo e não altere identidade,
geometria ou detalhes corretos. ComfyUI pode orquestrar o mesmo fluxo, mas usar
inpainting independente por frame não satisfaz consistência temporal.

## Fase 6 — Validar variedade, medir custo e integrar

Usar o validador da fase 5 anterior como infraestrutura: ao menos dez fontes
independentes, não dez recortes deste vídeo. Incluir tecido fino, cabelo, rosto,
linhas, movimento rápido, baixa luz, neon, sombra, karaoke/animação e cortes.
Separar um conjunto não usado para ajustes. Incluir cenas limpas com sobreposição
sintética para avaliar o interior com ground truth conhecido.

Revisão cega A/B em velocidade normal e reduzida com notas 0–4 de resíduos,
borrão, flicker, ghosting, textura, geometria e preservação. Relatar ganhos,
empates e regressões por categoria; métricas de pixel não substituem isso.

Depois da aprovação, integrar a variante vencedora com rollback e testar o
caminho completo pelo site: upload, máscara, job, download e arquivo publicado.
Comprovar a imagem Docker efetiva e parâmetros pelo job; código no repositório
não comprova atualização do serviço.

Executar um vídeo real de três minutos para medir custo. Não multiplicar o custo
de cinco segundos cegamente: cold start, tamanho das máscaras, quantidade de
cenas e retries mudam o total. Registrar GPU/tarifa efetivamente usados.
Confirmar encerramento de workers e limpeza de temporários após sucesso, erro,
cancelamento ou timeout; preservar o resultado entregue e evidências necessárias.
Armazenamento persistente é contabilizado separadamente da GPU.

Entrega: relatório de validação, vídeo de três minutos, custo observado, versão
integrada, rollback e confirmação de limpeza. Critério: melhora consistente sem
regressão grave nas categorias, qualidade de entrega e custo conhecidos.

## Ordem recomendada e limites

O diagnóstico já permite começar a fase 2, em uma rodada local curta. A fase 3
recebe a maior prioridade de qualidade. Acabamento leve vem depois da melhor
reconstrução disponível. A fase 5 só consome GPU após a correção de runtime e
só permanece se trouxer ganho; não é obrigatória para lançar uma melhoria útil.

Cada fase entrega um artefato para revisão; não é necessário esperar uma
pesquisa de semanas ou treinar um modelo do zero para verificar os próximos
ganhos. Duração e custo da execução neural não são prometidos sem medição.
Igualar ou superar Vmake é meta de avaliação, não resultado já demonstrado.

## Fontes técnicas e reprodução

- Auditoria local: `research/current-system/texture-pipeline-audit-20260910.md`.
- Pesquisa: `research/experiments/MICROTEXTURE-RESEARCH-20260910.md`.
- Scripts: `research/experiments/texture_alignment_metrics.py` e
  `research/experiments/texture_stage_ablation.py`.
- [ProPainter — inferência oficial](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/inference_propainter.py).
- [RealBasicVSR — autores](https://arxiv.org/abs/2111.12704).
- [FFmpeg — libx264/libx264rgb](https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb).
- [LPIPS — implementação oficial](https://github.com/richzhang/PerceptualSimilarity).
- [SSIM — autores](https://ece.uwaterloo.ca/~z70wang/research/ssim/).

Nenhuma GPU paga foi iniciada nesta análise; nenhuma configuração de produção
foi alterada. O plano é uma proposta de execução fundamentada no estado atual.
