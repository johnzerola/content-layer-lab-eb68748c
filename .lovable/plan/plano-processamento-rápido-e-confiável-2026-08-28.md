# Plano: processamento rápido e confiável

## Diagnóstico confirmado

- O backend do aplicativo está saudável e com baixa utilização; a lentidão não vem dele.
- A VPS responde normalmente em `/v1/health`, mas está em CPU e sem os motores GPU prontos.
- A VPS instalada contém somente as rotas do CleanerIA. As rotas de render em lote `/v1/render/*` usadas pelo aplicativo não existem e retornam `404`.
- O lote de nuvem mais recente foi criado no banco, mas falhou em cerca de 1 segundo; o item permaneceu em `uploading` porque a criação do trabalho na VPS falhou antes do upload.
- No processamento local, a barra só recebe eventos depois que leitura do arquivo, decodificação do áudio e preparação do worker terminam. Essa etapa pode consumir minutos e deixar a tela em `0%`, parecendo travada.
- A concorrência local pode abrir até quatro trabalhos externos e, dentro de cada um, outro pool de até quatro workers. Isso pode disputar memória, decoder e GPU e deixar todos lentos ou parados.

## 1. Corrigir imediatamente a experiência local

- Emitir progresso real desde o primeiro passo: leitura do arquivo, áudio, imagens do template, inicialização do decoder, render e finalização.
- Mostrar etapa, tempo decorrido e atividade recente; não exibir ETA falso enquanto ainda não houver velocidade medida.
- Adicionar watchdog por etapa. Se uma etapa não avançar no limite esperado, cancelar somente aquela tentativa e reiniciar automaticamente em modo seguro.
- Encerrar e recriar worker que falhar ou parar de responder, liberando a promessa pendente e evitando processamento infinito.
- Unificar os dois níveis de concorrência: um único escalonador adaptativo, começando com 1–2 renders simultâneos conforme memória/núcleos, sem multiplicar workers internamente.
- Decodificar áudio uma única vez por vídeo e limitar o tamanho de buffers transferidos; manter cache compartilhado entre variações.
- Corrigir pausa/cancelamento para alcançar também preparação de áudio, leitura de arquivo e workers, não apenas a codificação.

## 2. Implementar a fila real na VPS existente

Adicionar ao worker FastAPI já existente, sem criar outra VPS:

- `POST /v1/render/jobs`: validar preset, itens, callback e token HMAC; persistir o lote em disco.
- `POST /v1/render/items/{id}/upload`: receber o vídeo por streaming, validar tamanho/formato e associar ao lote.
- `POST /v1/render/jobs/{id}/start`: colocar o lote em uma fila durável e retornar imediatamente.
- `GET /v1/render/jobs/{id}`: devolver estado e progresso por item para recuperação por polling.
- `POST /v1/render/jobs/{id}/cancel`: cancelar itens pendentes e interromper o processo ativo.
- `GET /v1/render/items/{id}/result`: entregar o MP4 final somente com token assinado.
- Processador FFmpeg com progresso por tempo renderizado, preservação de áudio/sincronia, formatos verticais/horizontais, bitrate e resolução por plataforma.
- Callbacks assinados para atualizar o banco após cada etapa; persistência em disco para sobreviver a reinícios do container.
- Concorrência limitada de acordo com a capacidade real da máquina, com fila FIFO, retenção e limpeza de arquivos antigos.

## 3. Fortalecer a ponte aplicativo ↔ VPS

- Aplicar timeout em todas as chamadas à VPS e traduzir `404` para “motor de render ainda não instalado”, em vez de erro genérico.
- Não iniciar o lote se algum arquivo necessário não tiver sido enviado; identificar itens por ID, nunca apenas pelo nome do arquivo.
- Atualizar lote e itens juntos em toda falha, evitando item eternamente em `uploading`.
- Fazer upload com progresso em bytes, tentativas com backoff e retomada segura quando possível.
- Atualizar a fila imediatamente após criar, enviar, iniciar ou sincronizar um lote.
- Permitir “Tentar novamente” no lote falho sem reenviar arquivos que a VPS já confirmou.

## 4. UX de processamento

- Separar claramente os modos:
  - **Neste dispositivo**: mais rápido para poucos vídeos curtos, exige navegador ativo.
  - **Na VPS**: indicado para lotes/arquivos longos, continua com navegador fechado.
- Após clicar em renderizar na VPS, abrir imediatamente o lote na fila e mostrar `Enviando`, `Na fila`, `Renderizando`, `Finalizando` ou `Falhou`.
- Exibir mensagem acionável no item com erro e oferecer reenviar/reprocessar.
- Remover a promessa “pode minimizar — continua rodando” do modo local; essa garantia pertence somente à VPS.

## 5. Deploy e validação real

- Adicionar testes de contrato, autenticação, upload, cancelamento, reinício e download ao worker.
- Fazer deploy atômico no worker existente, preservando segredo, domínio, armazenamento e serviços atuais.
- Confirmar no `/v1/health` que o recurso `batch_render` está disponível antes de habilitar o botão.
- Executar um teste real com um vídeo curto:
  1. criar lote;
  2. enviar arquivo;
  3. fechar/reabrir a página;
  4. acompanhar progresso persistido;
  5. baixar o resultado;
  6. conferir imagem, áudio e sincronização.
- Executar um segundo teste com vários vídeos e validar cancelamento, falha isolada e retomada.
- Só considerar concluído após a VPS responder às novas rotas e um MP4 real terminar e baixar corretamente.

## Resultado esperado

- A barra local começa a avançar durante a preparação e detecta travamentos automaticamente.
- Lotes grandes são enviados à VPS uma vez e continuam processando com o navegador fechado.
- O usuário sempre vê o estado real, consegue retomar após voltar ao site e baixa os resultados pela biblioteca/fila.
