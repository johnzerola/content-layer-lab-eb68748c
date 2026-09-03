# CleanerIA: destravar o motor e garantir qualidade sem blur

## O que o "BACKEND OFFLINE · error code: 1003" significa

O painel mostra o texto que o próprio motor devolveu no health check. `error code: 1003` não é um código do VaiViral — é a resposta padrão da Cloudflare para "acesso direto por IP não permitido". Ou seja: a URL configurada do worker está apontando para um IP/host que a Cloudflare recusa, então a checagem falha e o botão "Enviar para IA" fica bloqueado.

Não é bug de código do estúdio: é configuração de endereço do worker GPU.

## Resposta direta sobre qualidade tipo vmake.ai

O projeto já tem a invariante de nunca usar blur/mosaico — nem o motor GPU nem o modo local aplicam desfoque. A diferença de qualidade está em qual motor roda:

- ProPainter/DiffuEraser em GPU (CUDA) = qualidade comparável à do vmake.ai: reconstrói o fundo com coerência temporal, sem borrão e sem "fantasma".
- CPU sem pesos ProPainter = cai em reconstrução clássica; funciona, mas em cenas com câmera em movimento aparece rastro.
- Modo local no navegador (WebCodecs) = reconstrução por mediana temporal. Excelente para legenda/marca fixa com fundo em movimento, limitado quando o fundo atrás da marca nunca muda.

Conclusão honesta: para ter o padrão vmake.ai é obrigatório um worker com GPU CUDA e os pesos oficiais baixados. Sem isso não existe atalho — qualquer promessa de qualidade equivalente em CPU seria falsa.

## Plano

### 1. Diagnóstico e correção do endereço do worker
- Adicionar um diagnóstico no health: distinguir "URL não configurada", "recusado pela borda (1003/HTML)", "autenticação inválida" e "motor sem GPU/pesos", com mensagem em português e a ação sugerida no próprio card.
- Preferir sempre a URL pública HTTPS válida; recusar hosts que sejam IP puro, avisando explicitamente que a Cloudflare bloqueia esse formato.
- Mostrar no card, quando online, o dispositivo detectado (GPU/CPU) e quais pesos estão faltando.

### 2. Não bloquear o fluxo
- Quando o motor estiver offline ou sem GPU, o botão principal passa a oferecer o processamento local (já implementado) com rótulo claro do que ele faz e dos limites, em vez de ficar desabilitado.
- Fila local de reprocessamento: se o motor voltar, o item pode ser reenviado para a GPU sem refazer as máscaras.

### 3. Trilha de qualidade máxima (GPU)
- Documentar e validar o deploy do worker com CUDA + pesos `ProPainter.pth`, `recurrent_flow_completion.pth`, `raft-things.pth` (e prior DiffuEraser no preset "Máxima qualidade").
- Preset "Verificar resultado" reprocessa automaticamente o trecho com texto residual, garantindo saída limpa em vez de aceitar borrão.

## Detalhes técnicos

- `src/lib/cleaner.server.ts`: classificar o motivo do offline em `workerHealth()` e recusar base com host IP.
- `src/components/CleanerIAStudio.tsx`: card de status com causa + ação, e botão que alterna GPU/local conforme disponibilidade.
- `backend/app/engines/propainter_official.py` já expõe pesos/CUDA faltantes; propagar isso no `/v1/health` para o card.
- Nenhuma mudança de schema; nenhuma alteração no compromisso "sem blur/mosaico".

## O que preciso de você

Para a etapa 3, o endereço público HTTPS do worker GPU (domínio, não IP) e a confirmação de que a instância tem GPU CUDA. Com isso eu ligo o motor de qualidade máxima; sem isso entrego as etapas 1 e 2 e o sistema continua utilizável no modo local.
