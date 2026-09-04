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
