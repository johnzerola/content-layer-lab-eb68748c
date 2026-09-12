# Arquitetura observada do Cleaner IA

Base: working tree de 10/09/2026. Os hashes estão em `baseline.json`, incluindo
alterações que já existiam antes do laboratório. O inventário não comprova o
digest da imagem RunPod nem a configuração efetiva da VPS.

## Entrada, execução e saída

`src/components/CleanerIAStudio.tsx` e `src/lib/cleaner.functions.ts` conectam a
interface às funções do serviço. `cleaner-gpu.server.ts` e
`cleaner-chunks.server.ts` concentram a orquestração GPU e de partes; a rota
`src/routes/api/public/cleaner-chunk-tick.ts` participa do ciclo de jobs.
O desenho envolve Supabase para persistência/orquestração; a configuração efetiva
de contas, endpoints e armazenamento não foi consultada nem exportada.

`backend/app/main.py` é a entrada FastAPI. `backend/runpod_handler.py` prepara o
worker serverless. `backend/app/workers/tasks.py::run_pipeline` recebe job, modo,
preset, regiões, callback e opções. Lê o arquivo do job em armazenamento local,
cria um marcador exclusivo de processamento, verifica cancelamento e usa
`probe` para obter dimensões, FPS, duração e áudio.

Há uma saída antecipada `crop-clean` somente quando não há regiões de remoção.
No caminho de inpainting, o worker detecta cenas, obtém regiões automáticas se
necessário, decide engine e executa composição/verificação. A separação de cenas
relocaliza intervalos das máscaras e rejeita resultados com geometria ou contagem
de frames incompatíveis. A montagem reutiliza áudio da entrada. A codificação
intermediária em H.264 CRF 0/YUV420 não equivale a preservar valores RGB originais.

`emit` incrementa a sequência de callback, grava estado e envia progresso. O
cancelamento é observado via `.cancel`; erros viram estado `failed` e são
relançados. O bloco `finally` remove o marcador e pode limpar intermediários.
Benchmarks precisam arquivar máscaras e parâmetros antes dessa limpeza. Não se
deve desativar limpeza global de produção para fazer pesquisa.

## Classificação dos componentes

| Componente | Evidência local | Classificação permitida |
|---|---|---|
| ProPainter oficial | `tasks.py` chama adapter quando quality/max e disponível | Caminho principal condicional; implantação não verificada |
| DiffuEraser oficial | Preferido para max quando disponível | Caminho principal condicional; implantação não verificada |
| TBE / TemporalFillEngine | Ramo clássico e fallback configurável | Caminho alternativo condicional |
| RapidOCR / Paddle / morfologia | `services/text_detect.py` seleciona e trata indisponibilidade | Detector efetivo depende do runtime |
| Farneback | `services/tracking.py` e engines clássicos | Implementação local alcançável |
| RAFT / recurrent flow completion / InpaintGenerator | Pesos exigidos pelos adapters e inferência upstream | Dependências externas; vendor ausente neste checkout |
| SD1.5 / VAE / PCM / BrushNet | Arquivos exigidos por `diffueraser_official.py` | Dependências do ramo max, não prova de disponibilidade |
| LaMa / STTN | Providers ONNX separados | Presentes; não classificar automaticamente como ramo de `run_pipeline` |
| SAM2 / GrabCut | Provider anuncia fallback; `available()` não implica SAM2 carregado | Presença do provider; registrar engine real |
| MediaPipe | Import opcional em `services/protect.py` | Condicional; fallback de proteção |
| subtitle finishing / pixel preservation | Flags e arquivos locais recentes | Opções locais; não promover a produção confirmada |

Não há base para declarar todos os providers como legado. Classificar como
legado requer histórico, callers e política de depreciação; ausência no caminho
principal não basta.

## Decisões relevantes para qualidade

O adapter ProPainter arredonda dimensões para múltiplos de oito e limita o maior
lado a 960 em quality ou 1280 em max, salvo configuração. Na GPU, quality usa
subvídeo 64, vizinhança 10 e referências a cada 10 por padrão local; restrições de
memória e opções por cena podem reduzir esses valores. O upstream consultado usa
subvídeo 80 e dilation 4; o adapter local passa dilation 1 ou 2. Isso é diferença
de integração, não demonstração de erro: a máscara local já pode conter expansão.

O modo de preservação de pixels está sob `PROPAINTER_PRESERVE_PIXELS`, padrão 0;
o acabamento de legendas usa `CLEANER_SUBTITLE_FINISH`, padrão 0. ROI está ativado
por padrão local e a margem vem de `CLEANER_INFERENCE_ROI_MARGIN` (96). Os valores
efetivos no servidor continuam desconhecidos. Nunca ler ou publicar secrets para
resolver essa incerteza; solicitar/exportar somente configuração não sensível.

O DiffuEraser requer CUDA e uma cadeia de pesos. Seu prior é ProPainter, portanto
a licença Apache do adapter/projeto não elimina a licença do prior. O handler
tem uma guarda de VRAM para max; esse limiar não prova adequação a toda resolução.

## Atualização do mapa

Use `inspect_component` para cada símbolo alterado e anexe hash/revisão ao registro.
O AST fornece callers candidatos e chamadas sintáticas, sem resolver dispatch
dinâmico. Atualize `pipeline.json` quando um ramo mudar; para afirmar implantação,
associe imagem imutável, versão do worker e relatório de job à mesma revisão.
