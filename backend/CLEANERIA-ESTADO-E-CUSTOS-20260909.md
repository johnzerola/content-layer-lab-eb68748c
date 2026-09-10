# CleanerIA: qualidade, integração e custo

> Auditoria hist?rica anterior ? implementa??o. Consulte o estado atualizado em [ROI-V3-VALIDATION-20260909.md](ROI-V3-VALIDATION-20260909.md).

Verificado em 09/09/2026, aproximadamente 20:49 BRT (23:49 UTC).
Escopo desta atualização: inspeção do código e dos artefatos, consultas remotas
GET e pesquisa de preços oficiais. Nenhum job GPU, deploy ou alteração de
capacidade foi executado nesta auditoria.

## Resultado aprovado e possibilidade de melhoria

A amostra está em
`G:\dowloand\teste\resultado-comparacao-refinado-20260909\comparison.html`.
O `output.mp4` tem 147 quadros, 1080×1920, 30 FPS, 4,9 segundos e áudio.
O manifesto identifica seleção manual dos experimentos por cena. O escopo é a
legenda falada; títulos externos e avatar não foram selecionados. A referência
Vmake serviu para comparação visual, sem alimentar o modelo ou treinamento.

Os “95%” são a avaliação visual do usuário, não uma métrica de fidelidade.
A comparação nos instantes 1, 2, 3 e 4 segundos ainda mostra suavização local,
diferenças na fivela e perda de textura. Os testes anteriores demonstraram:

- Consultar quadros limpos recuperou a linha da janela.
- Usar referências a cada dois quadros na segunda cena recuperou a fivela,
  embora ela continue menos definida.
- Limitar a composição final à legenda preservou mais roupa ao redor, mantendo
  contexto amplo para o modelo reconstruir o fundo.

Esses três ajustes são a prioridade para automação. Ainda não há política
automática validada que escolha sozinha doadores, densidade de referências e
máscara final por cena. Aplicar nitidez na saída não recupera detalhes ausentes.
Quando o fundo permanece encoberto em toda a sequência, sua reconstrução é
estimada e pode diferir do original.

## Legenda colorida, sombra, brilho e neon

O código possui OCR, complemento por cor dentro de uma faixa selecionada e
expansão da máscara para bordas/sombra. A amostra real validada tem letras verdes
e contorno preto; ajustes específicos foram necessários em transições esmaecidas.
Isso não demonstra cobertura automática de todos os estilos.

Neon espalhado, glow animado, sombra longa e reflexos ainda precisam de amostras
próprias. A máscara deve incluir o efeito além das letras. Uma margem fixa pode
deixar resíduos ou esconder fundo demais. A validação seguinte deve combinar
vídeos reais com vídeos limpos aos quais adicionamos legendas e efeitos; estes
últimos permitem comparar contra o fundo conhecido. Avaliar também em movimento.

## Caminho do projeto e situação publicada

| Camada | Implementação / evidência | Estado |
| --- | --- | --- |
| Tela CleanerIA | `src/components/CleanerIAStudio.tsx`; rota `/limpar-ia` | Estado inicial `smart`, qualidade `quality`, Turbo GPU desligado; prévia usa `fast` em CPU. |
| Controle | `src/lib/cleaner.functions.ts`, `cleaner.server.ts` | Jobs autenticados e comunicação com Hostear. |
| Fila GPU | `src/lib/cleaner-chunks.server.ts`, `cleaner-gpu.server.ts` | Trechos, sobreposição, persistência, upload e montagem. Credenciais configuradas não comprovam capacidade ou revisão do motor. |
| Motor local | `backend/app/workers/tasks.py`, `backend/app/services/inference_region.py` | Recorte com contexto e composição RGB integrados; revisão declarada `scene-roi-v1`. |
| Amostra refinada | `assemble.py` e `manifest.json` na pasta de comparação | Escolhas por cena e máscara de composição específicas da amostra. |
| Hostear remoto | `GET /v1/health`, HTTP 200 | Online; versão `2.1.0`, revisão anterior `scene-masks-v1`, `cuda=false`. |
| RunPod remoto | GET de saúde e configuração, HTTP 200 | Zero workers e jobs ativos; `workersMin=0`, `workersMax=0`, timeout de execução 600 s, idle timeout 5 s. |

A consulta inicial de configuração com urllib retornou 403; a repetição GET
com requests retornou 200 e confirmou os limites acima. Nenhum segredo ou corpo
de resposta com credenciais foi registrado.

Portanto, enviar um vídeo pelo CleanerIA hoje não reproduz automaticamente o
processo refinado. Além da publicação, faltam as escolhas automáticas acima e
uma prova completa pelo caminho do site. A auditoria não verificou uma sessão
autenticada do frontend publicado.

Outras diferenças relevantes: a tela aplica realce HQ por padrão; a montagem
experimental não passou pelo mesmo pós-processamento. O preset `max` do produto
seleciona DiffuEraser, enquanto o experimento usou ProPainter com ajustes próprios.
O cliente GPU ainda não expõe `pipeline_revision` no contrato de saúde.
No gerador de máscaras, o halo adicional e o complemento por cor são específicos
dos modos `subtitle`/`karaoke`; o `smart` inicial da tela não recebe esses mesmos
ajustes. A produção também reutiliza a mesma sequência de máscaras na inferência
e na composição, enquanto a montagem refinada separou essas duas funções.

Os documentos `docs/design/FASE-C-HOSTEAR-OPERACAO-20260909.md` e
`FASE-D-VALIDACAO-SEPARACAO-AUDIO-20260909.md` tratam de separação de áudio.
Sua conclusão não comprova publicação ou qualidade da remoção de legendas.

## Custo: preço conhecido, média por vídeo ainda não medida

A tabela oficial consultada informa Serverless RTX 4090 por US$ 1,10/h e
L4/A5000/3090 por US$ 0,69/h. São preços de Serverless, separados dos preços de
Pods dedicados. [RunPod, preços](https://www.runpod.io/pricing).

A cobrança abrange inicialização/carregamento, execução e tempo ocioso até o
worker parar. Volumes persistentes têm cobrança própria, mesmo com workers
zerados. [RunPod, regras de cobrança](https://docs.runpod.io/serverless/pricing).

Exemplo aritmético para RTX 4090, com câmbio **hipotético** US$ 1 = R$ 5,50:

| Tempo total faturado do worker | GPU em USD | GPU em BRL ilustrativo |
| --- | --- | --- |
| 5 minutos | US$ 0,0917 | R$ 0,50 |
| 15 minutos | US$ 0,2750 | R$ 1,51 |
| 30 minutos | US$ 0,5500 | R$ 3,03 |

Tempo do worker não é duração do vídeo. Esses cenários não são uma média medida
nem um orçamento fechado; excluem VPS, armazenamento, impostos, conversão real
do cartão e eventual licenciamento do motor. Somar tempo de todas as tentativas
e workers, inclusive falhas, ao calcular custo por resultado aprovado.

Os experimentos refinados rodaram na RTX 2060 local, sem inferência RunPod nessa
etapa. Isso não significa conta total zerada: VPS, armazenamento e eletricidade
têm custos próprios. Não extrapolar linearmente o tempo local para outra GPU.

`cleaner-chunks.server.ts` registra `cost_seconds` a partir do tempo devolvido
pelo handler. Em `backend/runpod_handler.py`, esse relógio começa dentro do
handler e é lido antes do upload: não cobre toda a cobrança do provedor. Medir
execução e conciliar uso faturado são tarefas distintas.

## Próxima entrega concreta

1. Automatizar e comparar os três ajustes que melhoraram a amostra, preservando
   os artefatos atuais como referência e acrescentando vídeos não usados no ajuste.
2. Validar neon/sombra/transições com máscaras de efeito e inspeção temporal.
3. Empacotar a revisão, conferir pesos e executar uma amostra pelo fluxo completo
   do site; registrar tempo total faturado para calcular custo por minuto de
   vídeo e por saída aprovada. Só então afirmar equivalência operacional.

A pesquisa de proveniência e licenças está em
`OPEN-SOURCE-REMOVAL-RESEARCH-20260909.md`; ProPainter tem restrição comercial.
Esse ponto precisa ser resolvido para oferta comercial, independentemente do
preço da GPU. A [licença publicada do ProPainter](https://github.com/sczhou/ProPainter/blob/main/LICENSE)
foi novamente consultada nesta auditoria. Histórico técnico e testes anteriores:
`ROI-VALIDATION.md`.
Esta atualização documental não reexecutou aqueles testes nem alterou o motor.
