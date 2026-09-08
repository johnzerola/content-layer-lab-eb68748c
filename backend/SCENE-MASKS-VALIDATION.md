# CleanerIA — validação scene-masks-v1

Atualização: 2026-09-08. Infraestrutura: Hostear (CPU) + RunPod (GPU).

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
