# Microtextura, nitidez local e fidelidade — pesquisa de 10/09/2026

Escopo: evidência pública e inspeção do código local para orientar a comparação
SOURCE / Cleaner v3 / Vmake. Nenhuma GPU foi iniciada, nenhum modelo foi treinado
e nenhuma configuração de produção foi modificada por esta pesquisa. A medição
empírica dos vídeos é um trabalho separado; este documento não anuncia ganho.

## Conclusão

**HYPOTHESIS:** ainda existe espaço prático para evolução, especialmente se parte
da perda estiver no redimensionamento e na codificação intermediária. Não existe
evidência de que o limite do modelo tenha sido atingido. Também não existe
evidência suficiente para atribuir um filtro ou modelo específico ao Vmake.

Melhor acutância é uma hipótese diferente de melhor reconstrução: intensificar
bordas existentes pode tornar tecido mais aparente sem recuperar os fios reais.
Ausência de deformação em três imagens não prova ausência no restante da sequência.
O objetivo deve combinar aparência, preservação e estabilidade temporal.

## O que o código efetivamente permite afirmar

**CONFIRMED — upstream ProPainter:** a revisão
`e870e79321c31b733e2031af5aa2fb1fe3ac7eec` ajusta dimensões para múltiplos de oito;
usa referências locais e distantes; recompõe pixels previstos apenas na máscara;
combina previsões sobrepostas com média de 0,5; disponibiliza PNGs e grava MP4 com
`quality=7` depois de redimensionar para `out_size`. Esses são pontos observáveis
para ablação, não prova de que cada um causou o defeito local.
[Inferência oficial](https://github.com/sczhou/ProPainter/blob/e870e79321c31b733e2031af5aa2fb1fe3ac7eec/inference_propainter.py).

**CONFIRMED — adapter local:** `propainter_official.py` possui dois caminhos.
O comum aceita o MP4 do upstream e limita o lado de processamento a 960/1280,
conforme preset/configuração; retentativas de memória podem reduzir a escala.
O caminho `PROPAINTER_PRESERVE_PIXELS=1` usa PNG, padding até múltiplo de oito,
recorta o padding e empacota RGB sem perdas. Ainda pode reduzir a resolução pelo
limite espacial ou por falta de memória. Logo, é necessário identificar o caminho
que gerou o artefato v3; a existência do código atual não atualiza vídeos antigos.

**CONFIRMED — ROI:** `restore_inference_region` só redimensiona quando a saída do
modelo diverge do tamanho esperado, usando Lanczos4. A escrita atual usa
`libx264rgb`, CRF 0. Essa função não aplica um blur incondicional. A falta de
intermediários impede atribuir a ela uma perda já observada no vídeo final.

**CONFIRMED — composição:** `composite_masked` atual faz `maskedmerge` em RGB com
a máscara fornecida, sem aplicar feather adicional; depois converte para YUV420
e codifica em CRF 16. Há também `composite_lossless` experimental com preservação
exata dos pixels externos antes do encode de entrega. Investigar a máscara
efetivamente recebida, especialmente os valores intermediários de alpha, e o
encode desta etapa. Não assumir que existe feather apenas pelo nome da função.

**CONFIRMED — acabamento existente:** `subtitle_finishing.py` já tenta recuperar
detalhe de referências da mesma cena e aplica `subtitle_finish.py`. Esse último
limita alterações a três níveis por canal e só permite sharpening quando o anel
externo apresenta déficit de energia correlacionado com o original. Se esse anel
já foi copiado do original, a razão de energia tende a um; o gatilho de sharpening
não é atendido. Isso torna relevante medir `sharpen_amount`, referências aceitas
e causas de rejeição antes de concluir que esse acabamento foi suficiente ou que
o problema é simplesmente a ausência de um filtro.

Revisões locais observadas (SHA256, não prova de implantação):

| Arquivo | SHA256 |
|---|---|
| `backend/app/services/inference_region.py` | `cbe6452ef6e694cfdfc2a08434ca56c287841b9ec01a28a21d0c89d4f078b78e` |
| `backend/app/utils/video.py` | `b2597226880776420836f53dc41d8366be198785f0a555ff8be75e31e0fd522f` |
| `backend/app/engines/propainter_official.py` | `d3ceda4a1a0ca64baf5b5b8c40160540ff659c860fe46a2bb9e0cbfdcfe00788` |
| `backend/app/services/subtitle_finishing.py` | `656470047dbb7ae4426944a4b6cad23408556a1284712aceeeda1ed6801c9ae0` |

## Experimentos prioritários, sem treinamento

1. **Identificar os mesmos instantes visuais.** Matching em áreas limpas da imagem
   filmada, excluindo legenda, títulos fixos, bordas e logo. Detectar cortes antes
   de buscar candidatos; registrar o mapa de índices, confiança e ambiguidades.
   Um deslocamento uniforme que alinha cortes não garante o mesmo instante em
   toda a cena. Não deformar o resultado reconstruído para fazê-lo coincidir com
   a referência: isso esconderia erros geométricos que queremos medir.
2. **Rastrear perda de detalhe por etapa.** Salvar PNGs ou RGB sem perdas antes da
   inferência, após resize/padding, saída PNG do upstream, ROI restaurada,
   composição, acabamento e MP4 final. Registrar dimensões, escala, máscara e
   hash de cada estágio. Os intermediários antigos ausentes devem aparecer como
   indisponíveis, nunca reconstruídos a partir do MP4 como se fossem os originais.
3. **Controle de resize e codec.** Passar o SOURCE limpo de cada crop pelo mesmo
   redimensionamento e cadeia de codecs, sem inpainting. Separadamente, produzir
   CRF 14/16/18 a partir do mesmo mestre RGB e um controle sem perdas. Isso mede
   o que essa cadeia sozinha consegue destruir. Reencodar o v3 já comprimido com
   bitrate maior não recupera o detalhe perdido. A documentação confirma suporte
   de x264 a RGB e modo sem perdas.
   [FFmpeg/libx264](https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb).
4. **Validar preservação nativa existente.** Mesma cena, mesmos frames/máscaras e
   parâmetros do modelo, comparando caminho comum com PNG/padding já implementado.
   Só depois avaliar tamanho da ROI e margem. Uma ROI pequena preserva escala,
   mas também pode retirar contexto que a reconstrução precisa.
5. **Acabamento leve isolado.** Comparar acabamento desativado, atual e uma pequena
   varredura de ganho no detalhe de luminância, com amplitude limitada, sem
   mudança de saturação, parâmetros estáveis dentro de cada cena e máscara
   controlada. Rejeitar halos, linhas claras/pretas e tremulação. Tratar uma
   variante sobre toda a área filmada como melhoria estética opcional separada
   da remoção seletiva. Cabelo, pele ou roupa que já estejam fora da máscara não
   deveriam precisar de reconstrução; primeiro preservar seus pixels.
6. **Referências temporais e restauração neural apenas se o déficit permanecer.**
   Se a trama desapareceu na saída bruta, nitidez sozinha não recompõe informação.
   Priorizar referências reais sem oclusão, com alinhamento e teste de confiança.
   Comparar modelo temporal pronto apenas na região problemática e na mesma cena.

## Métricas e interpretação

Separar: interior da máscara, faixa de transição e controle externo. Usar crops
de tecido, pele/rosto, cabelo e fundo; resumir mediana e percentis por cena, além
de mostrar a sequência. Energia de alta frequência, gradientes, contraste RMS,
histogramas de luma/saturação e bordas são diagnósticos; ruído, halos e sharpening
também podem aumentar seus valores. Um valor maior não é uma nota melhor.

**CONFIRMED:** LPIPS mede distância entre imagens; a implementação espera RGB em
`[-1,1]`. Fixar rede, versão e pesos e informar campos indisponíveis como `null`.
Uma distância menor indica maior semelhança à referência escolhida, não prova
que o conteúdo recuperado é real.
[LPIPS oficial](https://github.com/richzhang/PerceptualSimilarity).

SSIM também compara a referência escolhida. No SOURCE com legenda, a região
encoberta não contém o fundo que desejamos recuperar: SSIM/LPIPS contra esse
interior penalizam justamente remover o texto. Usar SOURCE para preservação
fora da máscara, Vmake para distância perceptual comercial e cenas limpas com
legendas sintéticas para fidelidade dentro da máscara. Registrar separadamente
flicker/ghosting; médias por frame não medem sozinhas estabilidade temporal.
[SSIM — página dos autores](https://ece.uwaterloo.ca/~z70wang/research/ssim/),
[LPIPS — estudo perceptual](https://richzhang.github.io/PerceptualSimilarity/).

## Situação de RealBasicVSR e alternativas

**CONFIRMED — evidência externa:** RealBasicVSR estuda explicitamente o compromisso
entre sintetizar detalhe e suprimir artefatos, com limpeza anterior à propagação.
O paper não demonstra recuperação garantida da textura verdadeira neste vídeo.
[Paper dos autores](https://arxiv.org/abs/2111.12704).

O repositório oficial foi inspecionado pelo MCP em
`b908e08323c84e96b08f0d58621026ab27f56bcb`; dispõe de pesos prontos e código
Apache-2.0. A licença de pesos/dados/dependências continua separada conforme a
matriz do laboratório. A inferência oficial oferece PNG ou MP4 `mp4v`; utilizar
PNG no diagnóstico evita esse encode intermediário. A própria documentação
alerta para perda ao salvar vídeo.
[Revisão oficial](https://github.com/ckkelvinchan/RealBasicVSR/tree/b908e08323c84e96b08f0d58621026ab27f56bcb).

**CONFIRMED — estado local:** [Fase 4](PHASE4-STATUS-20260910.md) não possui
candidato real aprovado: health checks funcionaram, mas inferência falhou antes
de devolver artefato. Incompatibilidade de runtime e falta de memória são
hipóteses, sem logs conclusivos. A janela curta também limita contexto. Não
repetir a execução paga sem uma correção verificável da falha. VRAM útil, tempo,
ganho visual e custo deste pós-processamento permanecem não medidos.

DiffuEraser continua alternativa para falha de reconstrução, documentada em
[pesquisa local](../projects/diffueraser.md). Não é a primeira ablação para provar
perda por codec/resize. ComfyUI pode orquestrar etapas, mas dividir o vídeo e
restaurar frames independentes não fornece, por si, consistência temporal.

Critério de avanço: melhoria perceptual em sequência, preservação externa,
ausência de novos defeitos e custo medido. Um só vídeo não aprova generalização;
a cobertura independente da [Fase 5](PHASE5-STATUS-20260910.md) ainda é necessária.
