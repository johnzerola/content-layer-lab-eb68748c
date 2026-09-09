# Comparação real com a referência Vmake — 2026-09-08

## Evidências e limites

Pasta local: `G:\dowloand\teste\comparacao-vmake-20260908\comparacao.html`.
Inclui players dos arquivos originais e quadros extraídos com FFmpeg em 1, 3 e 4 segundos.
Nenhum vídeo original foi alterado.

| Arquivo | Duração | Geometria / FPS | Áudio |
| --- | --- | --- | --- |
| padro-01-001 (15).mp4 | 80,683 s | 1080×1920 / 30 | sim |
| padro-01-001-sem-legendas-e-marcas-vps.mp4 | 80,682 s | 1080×1920 / 30 | sim |
| VMAKE.IA.mp4 | 4,928 s | 1080×1920 / 30 | sim |

Em 1 s, a saída antiga substitui MANDATO por uma faixa escura; em 3 s,
estica uma textura sobre a roupa. A referência reconstrói essas regiões com
aparência muito mais natural. O avatar/logotipo superior permanece nos dois.
O Vmake remove o selo azul que ainda aparece na saída antiga.
Há diferenças de aparência também fora das áreas apagadas e pequeno possível
deslocamento temporal. Não usar PSNR/SSIM contra a referência como prova de
recuperação correta: ela não é o original sem sobreposições (ground truth).
Não conhecemos o modelo interno do Vmake.

A saída antiga tem data de 05/09, anterior à revisão scene-masks-v1.
Não foi encontrado aqui um registro que prove qual motor gerou esse MP4.
O padrão do defeito é compatível com preenchimento espacial/temporal falho,
mas o aspecto visual sozinho não identifica o motor.

## Falha concreta corrigida no código local

O modo rápido TemporalFillEngine copiava doadores sem checar consistência de
fluxo ida/volta e tratava coordenadas fora do quadro como fundo disponível.
Agora rejeita esses doadores e também rejeita amostras bilineares que tocam
uma máscara do quadro vizinho. Testes sintéticos cobrem fluxo inconsistente,
translação válida, bordas e preservação dos pixels não mascarados.

Isso NÃO torna o fallback equivalente ao ProPainter/Vmake: pixels sem doador
válido ainda usam preenchimento espacial, que pode borrar. Há dois cálculos
de fluxo por doador, com o mesmo limite de doadores; o custo real deve ser
medido antes de publicar. Não implantado nesta etapa.

Validação local: `python -m pytest backend/tests -q` — 75 testes passaram.
`git diff --check` sem erros de whitespace.

## Estrutura recomendada e situação atual

1. Hostear CPU: upload original, cortes de cena, regiões de texto/logotipo,
   confirmação visual das máscaras e preparação de uma amostra de até 5 s.
2. RunPod GPU: reconstrução temporal por cena. ProPainter oficial já está
   integrado, mas a imagem privada apresentou IMAGE_AUTH_ERROR no print do
   usuário; não há teste válido do motor novo enquanto isso não for resolvido.
3. Preservar pixels originais fora da máscara na composição final (já existe).
   Usar máscaras que incluam contorno/sombra das letras, não faixas grandes.
4. Próxima otimização a implementar/medir: inferência por região com contexto,
   mantendo maior resolução local. O limite atual de lado 960 em um vídeo
   1080×1920 reduz detalhes disponíveis para reconstrução; aumentar tudo
   indiscriminadamente pode exceder memória. Não há benchmark GPU dessa mudança.
5. Segunda alternativa somente em cenas reprovadas, partindo do original.
   Não encadear 4–5 motores sobre um resultado já danificado. O mecanismo
   seletivo existe, permanece desativado e ainda não foi validado em GPU.
6. Comparar amostra em movimento, áreas apagadas e áreas preservadas; avisos
   heurísticos são sinais para revisão, não certificação de 100% de qualidade.

RunPod consultada nesta etapa: workersMin=0, workersMax=0, zero workers,
zero jobs em andamento/fila. Nenhuma tarefa GPU enviada nesta comparação.
Não foi gerado novo vídeo limpo nem realizado deploy.

Referências primárias consultadas:
- https://github.com/sczhou/ProPainter — máscaras por quadro, ajustes de memória,
  resolução e contexto; licença própria deve ser respeitada antes de uso comercial.
- https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html — fluxo óptico.
