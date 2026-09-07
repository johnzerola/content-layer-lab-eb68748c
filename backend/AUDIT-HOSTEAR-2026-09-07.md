# Auditoria CleanerIA — Hostear e RunPod, 07/09/2026

## Evidência consultada

- SSH na Hostear `104.234.186.50`, usando a chave de implantação existente.
- Saúde HTTPS do worker, inventário Docker e estados dos jobs.
- Imagem `nivaldo12/leaneria-runpod:6bba537` existente na Hostear,
  inspecionada sem rede e sem iniciar o handler/GPU.
- Código local e evidências de vídeo em `G:\dowloand\teste`.

## Situação observada

Hostear saudável: aproximadamente 11,4 GiB RAM total, 84 GiB livres no disco.
Worker CPU com limite de 8 GiB e cerca de 2 GiB usados; Caddy ativo. Nenhum
subprocesso de inferência apareceu no inventário naquele momento. Existe um
estado antigo `inpainting` no storage; esse rótulo sozinho não comprova que
um processamento continua ativo. Não foram apagados registros nem vídeos.

O endpoint de saúde reporta ProPainter disponível em CPU, OCR RapidOCR
PP-OCRv5 e DiffuEraser indisponível (código, pesos e CUDA ausentes).
Esse estado pertence à Hostear, não informa a disponibilidade dos modelos
montados no volume RunPod.

O arquivo local `padro-01-001 (15).mp4` tem 80,682667 segundos, 1080x1920,
30 fps e áudio AAC. `(15)` é parte do nome. Existe também um trecho de 5 s.
Há registros de testes de 15,008 s na VPS.

O resultado CPU de 15 s registrado no job
`61cc0e9d-266c-4f35-b2a1-c4b6348bdadb` informa engine `propainter-official`,
residual_text=0,516 e sharpness_ratio=0,06. São indicadores heurísticos,
não porcentagens exatas de sucesso ou de perda. Dois resultados de chunks
GPU registram residual_text=1. Concluir execução não valida a qualidade.

Confirmação direta: o `text_pixel_mask` instalado no container CPU e na
imagem Docker `6bba537` preenche linhas inteiras (`local[top:bottom, :] = 255`).
O código local já removeu esse comportamento. Isso amplia a área a reconstruir
e contribui para faixas/manchas; não prova que seja a única causa. A máscara
do logo também precisa abranger o emblema completo, não apenas suas letras.

## Correções desta auditoria

- Política de execução/TTL enviada ao RunPod para impor limites mesmo sem ticker.
- Diagnóstico runsync pendente solicita cancelamento; TTL cobre resposta perdida.
- Resultado COMPLETED sem `output.ok=true` passa a ser considerado falha.
- Falha definitiva de chunk cancela os irmãos antes da limpeza de artefatos.
- Documentação corrigida para Hostear e para a política real de retentativas.

## Pendências para o teste real

Não há RUNPOD_API_KEY configurada no ambiente local nem nos arquivos de
configuração inspecionados na Hostear. Portanto não foi possível confirmar o
estado atual do endpoint `km860ju9ded2e0`, cancelar jobs externos ou conferir
workersMin/idleTimeout. Nenhum novo job GPU foi enviado nesta auditoria.

É necessário configurar acesso à API do RunPod, verificar fila e escala zero,
reconstruir/publicar a imagem com as correções de máscara, verificar os pesos
montados e somente então executar um único trecho de 5 s. Preservar resolução,
duração e áudio; comparar máscaras e resultado antes/depois, inclusive durante
mudanças de cena e palavras coloridas. Usar a mesma origem para comparar.

Prioridade de desempenho: confirmar CUDA e engine efetivo, medir download,
detecção, inferência e upload separadamente, validar recorte temporal na
Hostear antes do envio. Reduzir paralelismo durante validação evita acumular
testes ruins; aumentar placas não resolve máscaras incorretas.

As alterações de código ainda precisam ser publicadas para ter efeito no
serviço. Esta auditoria não produziu um novo vídeo limpo nem certifica remoção
sem artefatos. A evidência visual existente ainda mostra manchas e logo residual.
