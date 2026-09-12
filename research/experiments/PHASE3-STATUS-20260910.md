# Fase 3: prova DiffuEraser

Estado: execução local interrompida por pressão de RAM; prova remota pendente.

## Atualização: acesso e imagem Docker

A conclusão anterior sobre a credencial foi corrigida: com `requests.Session`
e o carregador de ambiente já existente no projeto, REST respondeu HTTP 200 para
endpoint, template, volumes e Pods. Não foi necessário trocar a chave. O 403
anterior não comprovava falta de permissões; a causa exata não foi determinada.

A imagem `nivaldo12/leaneria-runpod:phase3-diffueraser-20260910` foi construída
na VPS e enviada ao registro. Digest:
`sha256:6211f0368323f3647df796aa18f40d7807d1d148f1236a36f96723ef079dc7c8`.
Leva os pesos DiffuEraser em `/opt/cleaneria-max-models`, evitando depender da
montagem `/workspace` do template quando a imagem espera `/runpod-volume`.
Teste sem rede no container confirmou todos os arquivos exigidos; somente CUDA
estava ausente na VPS. Isso ainda não confirma inferência em GPU.

O endpoint existente segue sem alteração nesta etapa. Usar GPU Ampere/Ada de
24 GB para a prova; a imagem CUDA 12.1/Torch 2.3.1 não deve ser destinada à RTX
5090. A presença dessa placa na lista configurada é uma incompatibilidade a
resolver na configuração isolada de teste. Não se migrou o runtime da produção.

## Evidências

- Runner isolado: `phase3_diffueraser.py`. Uma cena contínua, original conferido
  contra os pixels da v3, máscaras com hashes, uma tentativa e prazo de 600 s.
- Cena do tecido: 43 quadros. RTX 2060, 6 GiB de VRAM, aproximadamente 16 GiB
  de RAM. Torch 2.3.1+cu121, Diffusers 0.29.2, Transformers 4.41.1.
- Carregamento interrompido quando a RAM livre chegou a 964600 KiB.
  Tempo total da tentativa: 209,266 s. Não houve candidato nem conclusão visual.
  Não classificar como CUDA OOM: a interrupção foi preventiva por RAM.
- Processo filho encerrado. Cópia temporária PCM, recorte e vídeo de máscara
  removidos; relatório, hashes e log preservados em
  `../benchmarks/runs/phase3-tecido-20260910/`.
- Consulta posterior à API RunPod de saúde: zero jobs em execução/fila e zero
  workers em todos os estados. Nenhuma solicitação de inferência foi enviada.
- Inspeção de configuração via REST falhou; consulta GraphQL retornou HTTP 403.
  A chave aceita leitura de saúde, mas não permitiu confirmar template/modelos
  pela consulta realizada. Não presumir a causa ou mudar capacidade sem conhecer
  a configuração. Tarifas e custo de inferência desta fase permanecem desconhecidos.

## Próxima execução necessária

Atualização posterior: a configuração do endpoint foi temporariamente alterada
para testes limitados e restaurada. REST e GraphQL confirmaram capacidade 1,
mas `/run` retornou `409 ENDPOINT_PAUSED`, inclusive após espera de 60 segundos.
Detalhes atuais, limpeza e pendências em
[RUNPOD-PRE-FASE5-20260910.md](RUNPOD-PRE-FASE5-20260910.md).
As observações anteriores de 403 são históricas; não significam credenciais
inválidas. Ainda não há candidato de inferência cloud desta fase.

Com acesso REST e imagem confirmados, selecionar GPU com memória adequada e executar a mesma cena
com limite de um worker, prazo, cancelamento e capacidade zero ao terminar.
Validar contagem/FPS/geometria e preservação externa antes da comparação visual.
O runner local registra reamostragem do upstream; ela não pode ser ocultada em
um benchmark que exige geometria de inferência idêntica.

Não foram alterados pipeline de produção, configurações do site ou resultados
aprovados. Fase 3 não concluída e superioridade sobre v3/Vmake não demonstrada.
