# Fase 4 — RealBasicVSR

Teste implementado em `phase4_restore.py`, isolado da produção. Recebe uma cena
contínua de até 80 quadros/3 segundos e ROI explícita da área filmada. Preserva a
resolução de entrada, executa x4 e reduz o resultado ao tamanho nativo. Mistura
padrão de 25%, limitada a 12 níveis por canal, com transição dentro da ROI.
Não alterar título, logotipo ou moldura fora dessa área.

## Verificação concluída

- Três testes de composição passaram: preservação externa, limitação da mudança
  e rejeição de geometria incorreta. Não medem reconstrução neural.
- Docker construído na VPS: `cleaner-research:phase4-realbasicvsr-20260910`.
- Ambiente: Python 3.10, Torch 1.13.1, CUDA 11.6, MMCV-full 1.7.1,
  MMEditing 0.16.0, NumPy 1.23.5, PyAV 14.0.1.
- Checkpoint oficial com SHA256
  `52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376`.
- Carregamento estrito do `generator_ema` e inferência CPU de dois quadros
  sintéticos 64×64 passaram: saída finita 256×256. Container sem rede, limitado
  a duas CPUs e 3 GB de RAM, removido ao terminar.
- Evidência copiada para `benchmarks/runs/phase4-smoke-20260910.log`.

## Pendente

Atualização da validação: oito testes locais passaram em 10/09. O runner agora
confere resolução, contagem decodificada, FPS racional, duração do vídeo e
presença/formato do áudio antes de aceitar a entrega. Isso detecta perdas na
montagem; não substitui avaliação visual e de sincronismo. Docker reconstruído
na VPS com essa revisão (`build-validation.log`). Nenhuma inferência real da
fase 4 foi executada nessa atualização.

Executar cenas reais em GPU, conferir sequências completas e áudio, medir picos,
avaliar junções das janelas temporais e fazer comparação cega. O teste CPU não
comprova melhora visual nem custo GPU. Não há vídeo real restaurado aprovado.

O limite de 600 segundos dentro do runner é cooperativo entre janelas; o executor
externo precisa impor timeout real durante carregamento e kernels. A imagem da
fase 4 ainda não é um handler RunPod. Não substituir a imagem do removedor por ela.

Imagem local da VPS ap?s as verifica??es de entrega: `sha256:09d71be92aaa432df359b3290f6e7da90f1daa74a5d2a3c1d6b92f29c1d09f43`.

## Tentativa real isolada na RunPod

Foi criada a imagem serverless
`nivaldo12/leaneria-runpod@sha256:e5aa232402ea76c0ea433acdd72985ac50172933e8a8d322b52ffc1f7743c53c`,
contendo o runner validado, handler descartavel e o checkpoint oficial. O
checkpoint dentro da imagem foi conferido novamente pelo SHA256 esperado.

O teste usou como entrada o resultado aprovado da cena 0002 (43 quadros,
1,433333 s, 1080x1920 a 30 FPS), com ROI `[250, 1300, 600, 300]` sobre o
vestigio no sueter e mistura de 25%. O job de saude permaneceu na fila enquanto
um worker ficou em `initializing` ate o prazo delimitado terminar. A inferencia
RealBasicVSR nao iniciou e nenhum candidato visual foi produzido. Portanto esta
tentativa nao permite aprovar ou rejeitar a qualidade do modelo.

O encerramento confirmou capacidade zero, exclusao do endpoint descartavel,
exclusao do template descartavel e exclusao do projeto temporario na Hostear.
Depois da limpeza, o endpoint original permaneceu em `workersMin=0` e
`workersMax=0`, sem pods, jobs em fila ou jobs em execucao. A taxa atual da conta
voltou para USD 0,005/h, correspondente ao armazenamento existente e nao a uma
GPU ativa.

Antes de repetir, reduzir a imagem de 5,7 GB ou preparar dependencias/checkpoint
em volume persistente. Repetir a mesma imagem sem corrigir o cold start apenas
aumentaria custo sem gerar evidencia visual.

Uma segunda tentativa aumentou o disco temporario de 20 GB para 30 GB e repetiu
o mesmo comportamento: um worker em `initializing`, job de saude na fila e
prazo encerrado antes do handler. A limpeza foi novamente confirmada. Isso
enfraquece a hipotese de falta de disco e aponta para a camada base monolitica ou
inicializacao da imagem. `Dockerfile.phase4-slim-runpod` prepara a proxima
revisao a partir do runtime CUDA, sem a camada Conda de aproximadamente 10 GB.

## Runtime enxuto

A imagem `phase4-slim-20260910` foi construida diretamente sobre CUDA/cuDNN e
publicada pelo digest
`sha256:20c2d4ad05e354c32137c638ba859435ef930b8afe5bcc3347679cb38dc32aae`.
Seu tamanho extraido e 4.612.845.428 bytes, contra 17,6 GB da imagem anterior,
uma reducao aproximada de 74%. Imports de Torch 1.13.1+cu116, MMCV 1.7.1 e
RealBasicVSR passaram, e o checkpoint manteve o SHA256 oficial.

No primeiro endpoint com a imagem enxuta, o health check concluiu em 163 ms
apos 91.345 ms de espera. CUDA, GPU de 24 GB e checkpoint foram confirmados. A
restauracao da ROI 600x300 iniciou, mas o worker terminou o job como `FAILED`,
sem retornar candidato; encerramento do processo pelo provedor/OOM e a hipotese
principal, mas nao foi comprovado por log preservado. Uma segunda tentativa com
ROI 400x200 nao recebeu worker antes do prazo. Em ambas, endpoint, template e
projeto Hostear foram excluidos e a capacidade voltou a zero.

Resultado: o cold start da imagem foi corrigido em pelo menos uma alocacao, mas
a qualidade visual do RealBasicVSR continua sem validacao. Antes do proximo
teste, o runner deve reduzir janela/contexto temporal, e o orquestrador deve
preservar logs de worker antes de excluir o endpoint em caso de falha.

Uma revisao posterior reduziu a janela de 6 para 3 quadros e o contexto de 4
para 2, mantendo processamento temporal. O health concluiu em 148 ms apos
54.874 ms de espera, novamente em uma GPU Blackwell MIG de 24 GB. O job de
restauracao 400x200 ainda terminou como `FAILED` antes de retornar artefato.
Como Torch 1.13/CUDA 11.6 antecedem Blackwell, incompatibilidade do runtime e
agora uma hipotese material junto com OOM. A variante permanece rejeitada e nao
foi integrada ao produto.
