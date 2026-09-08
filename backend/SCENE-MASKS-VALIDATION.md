# CleanerIA — validação scene-masks-v1

Atualização: 2026-09-08. Infraestrutura: Hostear (CPU) + RunPod (GPU).

## Atualização do teste autenticado (2026-09-08)

O acesso REST/GraphQL foi liberado. O endpoint foi atualizado para o template
de validação `wblwqgy54h`, com a imagem corrigida por digest e a credencial
privada de Docker Hub já cadastrada na conta. O primeiro template criado pelo
teste não tinha herdado a credencial; esse vínculo foi corrigido. A imagem
permanece privada. `PROPAINTER_MAX_SIDE` passou de 1280 para 960 no template
de validação; esse ajuste ainda não teve benchmark GPU.

Os diagnósticos não chegaram a executar o handler: houve workers unhealthy/
EXITED e espera em fila até o limite de 240 segundos. O primeiro diagnóstico
foi cancelado; o último expirou e sua consulta passou a retornar 404. Foram
enviados somente diagnósticos de saúde, nenhum job de inpainting. Isso não
prova custo zero de infraestrutura durante as tentativas de inicialização.

Estado final consultado: `workersMin=0`, `workersMax=0`; todos os contadores
de workers em zero e fila/execução em zero. Volumes e modelos não foram
excluídos. **O endpoint está pausado para evitar novas alocações e precisa
ser reabilitado conscientemente após resolver a inicialização.** Não
publique como remoção validada. Os logs dos workers encerrados não estavam
disponíveis pela consulta tentada; foi solicitado o export da aba Logs.

Artefatos locais em `G:\dowloand\teste\cleaneria-validacao-20260908`:
original de teste de 15 s, quadros comparativos e relatórios `gpu-teste-*`.
O arquivo original com `(15)` no nome tem 80,68 s, não 15 s. Não há novo
vídeo limpo. O executor `scripts/validate_runpod_sample.py` limita amostras a
5 s, preserva o áudio via montagem Hostear, valida checksum/dimensões e
desativa capacidade no finally; dois testes unitários cobrem bloqueio da
remoção quando o diagnóstico falha e preservação da credencial privada.

As seções abaixo registram a etapa anterior de implementação/validação CPU.

## Implementado

- Inferência separada em cada mudança de cena, sem misturar quadros de cenas diferentes.
- Máscaras de karaokê recalculadas por quadro, sem unir palavras distantes ou congelar a faixa inteira.
- Máscaras de letras mais conservadoras; símbolos estáticos sobre borda uniforme recebem uma máscara gráfica completa. É uma heurística, não reconhecimento semântico infalível.
- Transporte de `mask_kind=graphic` preservado pela validação do app.
- Falhas de composição e saída com quadros/dimensões incorretos abortam em vez de entregar um sucesso aparente.
- Avisos de texto residual, possível borrado e instabilidade preservados até a montagem final.
- Concorrência GPU padrão 1, até 2 tentativas técnicas por chunk. Segunda comparação com DiffuEraser desligada por padrão, limitada a uma cena de até 5 s, sempre a partir do original.

## Publicação efetivamente realizada

- Hostear: imagem `content-layer-lab-cleaner-worker-cpu:scene-masks-20260907`, saúde pública respondeu com `pipeline_revision=scene-masks-v1`.
- Recuperação: imagem `content-layer-lab-cleaner-worker-cpu:before-scene-masks-20260907` e arquivo `/opt/cleaneria-scene-masks-20260907/hostear-app-before.tar.gz` preservados.
- Docker GPU publicado: `docker.io/nivaldo12/leaneria-runpod:scene-masks-20260907`.
- Digest GPU: `sha256:df9b6633b6941491b7fb57391923b436396c24a463fe7f29684784947f3fe243`.
- **Endpoint RunPod ainda não atualizado nem consultado:** falta acesso autenticado. Publicar a imagem no registro não modifica o endpoint.

## Evidência de teste

- Backend: 70 testes passaram, incluindo montagem real de um vídeo sintético com FFmpeg.
- Integração TypeScript: 9 testes direcionados passaram (ciclo GPU e transporte das máscaras).
- Após integrar as alterações remotas do Lovable: suíte completa do app com 213 testes em 33 arquivos passou; build de produção passou. Existem avisos de depreciação já presentes no build.
- Amostra real: `G:\dowloand\teste\padro-01-001-teste-5s.mp4`, duração confirmada de 5 segundos.
- Detecção/máscaras executadas somente na CPU Hostear: 27 regiões, uma cena; cobertura aproximada 5,85%, 6,06%, 6,14% nos três quadros inspecionados.
- Prévia local revisada: `G:\dowloand\teste\cleaneria-mascaras-20260907\revisada\mask-preview`.
- **As imagens verdes são máscaras; não são resultado de remoção. Nenhum novo job GPU foi enviado nesta validação.**

## Pendências antes de aprovar qualidade

1. Configurar `RUNPOD_API_KEY` somente no ambiente servidor/local, nunca no chat ou Git.
2. Consultar endpoint `km860ju9ded2e0`, conferir trabalhos pendentes e confirmar escala zero em repouso; não presumir que está desligado sem consulta.
3. Aplicar a imagem GPU acima, verificar caminhos/pesos/capacidades e licenças dos modelos.
4. Executar um único teste de 5 segundos pelo fluxo app → Hostear → RunPod → Hostear. Manter comparação alternativa desativada inicialmente.
5. Inspecionar vídeo em movimento e quadros antes/depois, conferir áudio, duração e enquadramento. Heurísticas aprovadas não garantem remoção perfeita.
6. Cancelar trabalhos deste teste em erro/timeout e confirmar ausência de jobs e workers ativos ao terminar. Não excluir volumes/modelos.

Carregamento persistente de modelos e inferência espacial somente na região afetada ainda não foram implementados. O benchmark GPU real é necessário para medir ganho de tempo e custo. Consulte também `DEPLOY-RUNPOD.md` para limitações de licença.
