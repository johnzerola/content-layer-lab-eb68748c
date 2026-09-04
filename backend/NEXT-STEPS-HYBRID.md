# Próximos passos — pipeline híbrida Hostear + RunPod

## Arquitetura alvo

- **Navegador/Supabase:** upload direto, autenticação e resultados.
- **VPS Hostear (CPU):** validação, probe, cenas, cache dos recortes,
  montagem final, áudio, callbacks e fallback rápido.
- **RunPod Serverless Queue (GPU):** segmentação e inpainting de um recorte por
  invocação, recebendo e devolvendo arquivos por URLs assinadas.

## Entregue nesta etapa

- Cada job mantém `gpu-plan.json` na pasta privada da VPS.
- `/v1/jobs/{id}/chunks/{index}/source` serve somente a janela solicitada.
- O recorte inclui overlap e fica em cache para retries.
- O handler usa `source_is_chunk` e não baixa nem recorta o master novamente.
- Tempos das máscaras são convertidos do vídeo completo para o recorte.

## Preservação da resolução original

O pipeline não reduz o master inteiro para depois fingir que recuperou 4K:

1. a VPS/worker conserva o chunk na resolução original;
2. detecção e tracking usam o proxy leve existente;
3. ProPainter trabalha com lado máximo de `1280` e DiffuEraser com `960`;
4. a saída da IA volta ao tamanho do master;
5. `composite_masked` troca somente os pixels dentro da máscara;
6. resolução, FPS, pixels não mascarados e áudio do original são preservados.

Perfis iniciais recomendados:

| Entrada | Análise | IA | Entrega |
| --- | --- | --- | --- |
| 720p | proxy até 540 px | até 720p | 720p |
| 1080p | proxy até 540 px | até 960/1280 px | 1080p |
| 4K | proxy até 540/720 px | até 960/1280 px | 4K original |

As variáveis `PROPAINTER_MAX_SIDE` e `DIFFUERASER_MAX_SIDE` permitem calibrar
VRAM, custo e qualidade sem alterar a resolução entregue ao cliente.

## Próximas entregas, em ordem

1. Eliminar reencode intermediário com keyframes planejados ou chunks enviados
   diretamente ao storage, medindo precisão versus velocidade.
2. Manter overlap na saída e aplicar blending real nas emendas.
3. Começar com 2–3 workers e ajustar duração/concurrency por resolução, VRAM,
   fila, modo e custo observado.
4. Adicionar warmup/fitness checks e métricas separadas de cold start, download,
   inferência e upload.
5. Fazer a VPS resolver casos temporais simples e mandar à GPU apenas fundos
   nunca expostos, objetos, movimento forte e retries reprovados.
6. Criar dataset próprio e medir textura, nitidez, flicker, resíduo e proteção
   de rosto/produto por chunk.
7. Adicionar orçamento por job, circuit breaker, idempotência e limpeza de
   chunks órfãos.
8. Registrar as licenças comerciais adquiridas, versões, escopo, expiração e
   checkpoints autorizados antes da ativação em produção.

## Critério para avançar

Executar três vídeos próprios (legenda fixa, marca móvel e objeto), comparando
bytes transferidos, custo, tempo e qualidade contra a versão anterior. Nenhum
worker deve baixar o master completo.
