# CleanerIA: plano para reduzir manchas e preservar detalhe

Estudo de 10/09/2026. **Somente diagnóstico e planejamento; implementação depende
da próxima ordem do usuário.** Nenhum modelo ou recurso GPU foi iniciado nesta
etapa. Código, configuração e vídeos anteriores foram preservados.

## Conclusão

Existe um caminho técnico plausível para aproximar a qualidade percebida da
referência Vmake, usando modelos prontos e a infraestrutura existente. Ainda
não há evidência para garantir igualdade em todo vídeo ou um novo percentual.
O defeito central é a reconstrução local perder textura e geometria, combinada
com uma transição retangular. Melhorar a exportação pode preservar mais detalhe;
um restaurador pode melhorar a aparência. Nenhum deles, isoladamente, garante
recuperar o fundo original que esteve coberto pela legenda.

As capturas do usuário mostram a emenda na janela e a faixa lisa no tecido. A
revisão dos arquivos confirma que esses defeitos persistem. A proximidade visual
nos trechos fáceis não mede a dificuldade restante nos trechos de tecido/movimento.

## Evidências locais verificadas

Arquivos de referência:

- `G:/dowloand/teste/resultado-automatico-v3-20260909/input.mp4`
- `G:/dowloand/teste/resultado-automatico-v3-20260909/output.mp4`
- `G:/dowloand/teste/resultado-acabamento-v4-20260910/output.mp4`
- `G:/dowloand/teste/VMAKE.IA.mp4`

V3: SHA256 `e4aa6aaebdff8aedee3b24f75e7df9455da1b0ef66e91087433c99094d5295e4`.
Acabamento experimental: SHA256
`79d082c2909581b59b2255c8e2d9e535a2cd6b15c2c2b419b29f5cf4a8457ea3`.

### Resolução e compressão

Todos os vídeos comparados têm 1080×1920 e 30 FPS. A v3 contém 147 quadros.
O fluxo de vídeo da entrada da amostra é aproximadamente 4,88 Mb/s; a saída v3,
3,08 Mb/s; a referência Vmake, 18,69 Mb/s. São taxas medidas por ffprobe, não
métricas de fidelidade. Um fundo liso também exige menos bits. A referência
Vmake tem diferenças temporais e de aparência; não é um alvo pixel a pixel sem
alinhamento adicional.

| Cena | Recorte original | Saída do modelo | Recorte restaurado |
| --- | --- | --- | --- |
| Janela | 762×294 | 760×288 | 762×294 |
| Fivela | 678×294 | 672×288 | 678×294 |
| Tecido | 820×294 | 816×288 | 820×294 |

`backend/app/engines/propainter_official.py:_processing_size` arredonda dimensões
para baixo em múltiplos de oito. O runner local
`G:/cleaneria-runtime/ProPainter/inference_propainter.py:resize_frames` redimensiona
com PIL, e `backend/app/services/inference_region.py:restore_inference_region`
volta ao tamanho com Lanczos. Nesta amostra não houve redução grande pelo teto
de 960 pixels: os recortes já cabiam nele. A pequena reamostragem deve ser
eliminada, mas não explica sozinha a mancha no tecido.

Nos pixels reconstruídos da amostra há extração inicial CRF 12, saída MP4 do
modelo (`imageio quality=9`, YUV420) e composição final CRF 16/YUV420. Recortes e
restauração intermediários já usam RGB sem perdas. No caminho RunPod,
`slice_video` ainda prepara chunks em CRF 16. Recodificação de concatenação é
um fallback, não uma etapa inevitável. Filtros opcionais podem adicionar passes.

### Máscaras, geometria e textura

Na cena do tecido, a máscara de inferência mantém uma faixa de 627×100 pixels
nos 43 quadros. Nenhum quadro tem essa faixa inteiramente livre. No quadro
global 120, a máscara detectada tem 22.793 pixels; a inferência oculta 62.700 e a
composição substitui 24.780. No quadro 115, a conversão em retângulo expande a
área final de 8.640 para 11.610 pixels, cerca de 34%.

Isso é consequência da política conservadora em
`backend/app/services/subtitle_policy.py`; ela resolveu vestígios, mas pode
ocultar ilhas de fundo úteis. A composição opaca em
`backend/app/utils/video.py:composite_masked` evita devolver texto colorido e
também pode expor uma emenda quando o preenchimento diverge do entorno.

O acabamento experimental usa alinhamento afim e transfere somente detalhe
limitado a quatro níveis por canal. O acabamento de cor chega a três níveis.
Esses limites e as rejeições explicam a alteração discreta de três quadros;
a rotina não foi projetada para corrigir uma estrutura errada. O tecido deformável
pode exigir movimento local, e pixels nunca visíveis exigem uma hipótese de
reconstrução. Máscara doadora vazia não comprova ausência de legenda: doadores
precisam de verificação adicional. A proteção atual depende de detectar os efeitos.

As métricas existentes também têm limites: Laplaciano alto pode representar
ruído em vez de textura; diferença entre quadros sem compensação de movimento
pode confundir movimento real com instabilidade. Elas não substituem revisão
visual nem provam originalidade do detalhe reconstruído.

## O que sabemos sobre Vmake

O próprio produto atribui ao modo Smart Pro melhorias em detecção, restauração
do fundo e mistura das bordas. O enhancer é oferecido como ferramenta capaz de
tratar artefatos e aparência excessivamente lisa. Isso sustenta estudar remoção
e restauração como etapas distintas, mas **não revela a arquitetura deles nem
prova que o vídeo fornecido passou automaticamente pelo enhancer**.
[Removedor oficial](https://vmake.ai/video-watermark-remover),
[Enhancer oficial](https://vmake.ai/video-enhancer).

## Alternativas escolhidas para provas pequenas

| Alternativa | Papel proposto | Decisão |
| --- | --- | --- |
| ProPainter atual com pixels preservados e máscaras melhores | Primeira passagem e casos com fundo observável | Reaproveitar a integração existente e medir os ajustes isoladamente. |
| DiffuEraser | Candidato alternativo para cenas em que falta textura | Primeira prova de reconstrução generativa, pois já existe adaptador. Ainda falta execução validada com todos os modelos. |
| SVOR | Reserva para manchas persistentes, sombras e máscaras imperfeitas | Testar apenas se a prova anterior falhar ou não justificar custo/qualidade. |
| RealBasicVSR | Referência de restauração temporal do vídeo | Comparar a versão restaurada com a saída sem enhancer; considerar adaptação das dependências antigas e modelo x4. |
| SeedVR2-3B | Restauração mais forte, opcional | Teste curto posterior; pode gerar excesso de detalhe. Medir custo e memória antes de integrar. |

DiffuEraser tem código/pesos e usa difusão com contexto temporal. O benchmark dos
autores em L20, para 250 quadros, informa 20 GB e 175 s em 960×540. Isso não é
previsão de tempo na nossa 4090 nem custo de um vídeo de três minutos. Começar
com o recorte difícil e todos os quadros de uma cena curta.
[Fonte oficial](https://github.com/lixiaowen-xw/DiffuEraser).

SVOR tem inferência e pesos liberados, baseado em Wan2.1-VACE-1.3B e dois LoRAs.
O README atual informa cerca de 33 GB no padrão e um modo com transferência
para RAM para placas de 24 GB; a velocidade nesse modo precisa de medição.
Os objetivos declarados incluem estabilidade e tolerância a máscaras imperfeitas,
não uma garantia de desempenho sobre nossas legendas.
[Fonte oficial](https://github.com/xiaomi-research/svor).

RealBasicVSR fornece inferência temporal e pesos; sua saída padrão é x4. O
adaptador precisa limitar cenas/recortes e memória, preservando o tamanho final
desejado, sem reduzir a entrada gratuitamente só para acomodar x4.
[Fonte oficial](https://github.com/ckkelvinchan/RealBasicVSR).

SeedVR2 tem modelos 3B/7B e restauração em um passo. Os autores reconhecem
falhas com degradação/movimento grandes e excesso de detalhe em entradas pouco
degradadas. A variante 3B é candidata de teste, não promessa de rapidez/VRAM no
nosso hardware. [Fonte oficial](https://github.com/ByteDance-Seed/SeedVR),
[pesos 3B](https://huggingface.co/ByteDance-Seed/SeedVR2-3B).

ComfyUI pode servir de bancada para experimentar modelos e comparar resultados.
O ganho de qualidade depende dos modelos e parâmetros; trocar a interface de
execução, por si, não resolve os defeitos. Para o produto, conservar API, fila,
limites e limpeza existentes. ROSE fica como reserva de pesquisa; VideoPainter
não entra no caminho comercial proposto por restrições explícitas de licença.

### Condição para uso comercial

O ProPainter declara uso não comercial sem autorização; seu uso como componente
do DiffuEraser mantém essa condição. Confirmar se o projeto já tem autorização
antes de oferecer essa rota comercialmente. Não foi consultado contrato privado.
[Licença ProPainter](https://github.com/sczhou/ProPainter/blob/main/LICENSE),
[condições DiffuEraser](https://github.com/lixiaowen-xw/DiffuEraser#license).

SVOR, seu card de LoRAs e a base citada declaram Apache 2.0; isso merece a revisão
normal de dependências/pesos ao fixar a versão, sem assumir restrição comercial
idêntica ao ProPainter. [LoRAs](https://huggingface.co/HigherHu/SVOR),
[base](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B).
[VideoPainter](https://github.com/TencentARC/VideoPainter/blob/main/LICENSE)
proíbe uso comercial/produção nas condições publicadas.

## Plano por fases

### 1. Preservar pixels e estabelecer a comparação

**Atualização de 10/09:** implementação experimental local e validação das três
cenas em [PIXEL-PRESERVATION-VALIDATION-20260910.md](../../backend/PIXEL-PRESERVATION-VALIDATION-20260910.md).
O adaptador pode consumir PNG sem perdas e usar padding; a comparação separa
reconstrução e exportação. O padrão público permanece na versão anterior. As
fases seguintes continuam pendentes de autorização.

Substituir arredondamento com resize por padding até múltiplos de oito, seguido
de recorte exato. Consumir quadros PNG ou saída RGB sem perdas do modelo. Manter
uma única codificação final com perdas no caminho de qualidade, contabilizando
tradeoffs de disco, transferência e CPU. Fazer A/B da exportação atual com CRF
14/12 e master sem perdas, sem usar o arquivo Vmake como taxa obrigatória.

Entregar três cenas com checkpoints por etapa, correspondência temporal com a
referência e comparação separada dentro/fora da região removida. Acrescentar
pequenos testes com legendas sintéticas sobre vídeo limpo, para ter fundo conhecido.

**Critério:** mesmos quadros, FPS, áudio e geometria; pixels externos preservados
antes da entrega e perdas de entrega medidas contra encode de controle. Isolar
ganho de exportação do ganho de reconstrução. Trabalho pequeno, primeiro ciclo.

### 2. Melhorar máscara, fundo visível e junção

Manter núcleo opaco para letras/contorno/efeitos, preservar ilhas de fundo
verificadas, e substituir retângulo global apenas onde os testes demonstram
ser possível. Delimitar halo adaptativamente, inclusive sombra e neon. Construir
zona de transição dentro de um contexto reconstruído comprovadamente limpo,
reaplicando limites de seleção e regiões protegidas. Testar composição por
gradientes ou múltiplas escalas onde houver emenda, sem diluir texto de volta.

Melhorar referências com fluxo local e verificação de oclusão, em vez de exigir
um único movimento afim para todo o tecido. Verificar doadores com detector e
consistência temporal. Cenas sem doador confiável devem seguir para a fase 3.

**Critério:** reduzir emenda da janela e área lisa sem voltar letras/halo,
duplicar objetos ou alterar regiões protegidas. Revisão em velocidade normal,
lentidão e quadros próximos aos cortes. Trabalho médio; um ajuste por experimento.

### 3. Reconstruir trechos difíceis com um candidato alternativo

Prova limitada de DiffuEraser em tecido/janela; se insuficiente, uma prova de SVOR.
Cada candidato recebe o original e máscaras apropriadas; não encadear
repetidamente saídas já modificadas. Usar cenas curtas, preservando o contexto
temporal necessário. A decisão de motor deve valer por trecho contínuo, evitando
trocas quadro a quadro que provoquem cintilação.

**Critério:** textura visualmente plausível, geometria da roupa/objetos preservada,
sem vestígios ou oscilação, preferida na comparação sem identificação do motor.
Medir segundos, memória e custo. Abandonar o candidato que não superar o atual;
não prolongar a integração apenas porque o modelo é recente. Esta é a fase com
maior potencial e maior incerteza para o borrão que resta.

### 4. Melhorar a aparência do vídeo, quando necessário

Depois de corrigir a reconstrução, testar restauração temporal leve: RealBasicVSR
como referência e SeedVR2-3B como opção mais forte se houver justificativa.
Aplicar à imagem filmada com contexto de cena; no exemplo, preservar título,
logotipo e moldura externa. Iniciar na mesma resolução final, mantendo uma
versão sem restauração para comparação. Fixar cor e limitar intensidade.

**Critério:** vídeo mais natural sem rosto alterado, aspecto plástico, contornos
duros, textura inventada evidente ou perda de grão desejável. O mesmo critério
vale para quadros fora da legenda. Rejeitar tratamento global se apenas esconder
a faixa por borrar o restante. Ganho desta fase é complementar à reconstrução.

### 5. Validar qualidade em casos variados e medir três minutos

Usar pelo menos dez trechos curtos: tecido, linhas retas, pele/rosto, cabelo,
movimento, pouca luz, legendas simples, neon, sombra e transições. Avaliar texto
residual, geometria, textura, emendas e instabilidade compensada por movimento.
Em exemplos sintéticos com fundo conhecido, medir erro apenas na região afetada;
na referência Vmake, usar comparação perceptual alinhada, sem tratá-la como verdade.

Somente após as provas curtas aprovadas, executar um vídeo real de três minutos
com medição de inicialização, processamento, espera ativa, transferências e
armazenamento. A pendência atual de inicialização RunPod precisa ser resolvida
antes; esta fase não presume a GPU funcionando. Manter máximo um worker,
timeout, cancelamento e limpeza; separar custo marginal do vídeo e custos fixos.

**Critério:** ganho consistente nos casos definidos, resultado completo com áudio,
custo observado e desligamento confirmado. Só então ativar a rota escolhida e
validar a publicação autenticada. Um vídeo melhor não comprova paridade universal.

## Ordem recomendada

Primeiro pacote: fases 1 e 2 nas três cenas já conhecidas, seguido de uma prova
curta da fase 3. Avaliar os ganhos antes de integrar um restaurador global.
Cada fase termina com vídeo comparável, resultado documentado e decisão de
continuar ou descartar. Isso aproveita o sistema existente e evita assumir um
projeto de treinamento de meses. Duração total e paridade com Vmake continuam
dependentes dos resultados, disponibilidade GPU e condições de uso dos modelos.
