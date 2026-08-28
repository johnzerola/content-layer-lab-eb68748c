# Acabar com a demora ao processar depois de uma edição simples

## O que os prints mostram

- Depois de "Aplicar edição" (só um corte 0:02 → 1:01.6), o lote fica parado em **"iniciando codificador"** com 1%–15% por vários minutos.
- O rodapé estima **34–38 min por vídeo** enquanto nada está sendo codificado ainda.
- No fim: **"0 vídeo(s) exportado(s) · 1 com erro · 432s — O render travou e foi interrompido"**.

Ou seja: não é só lentidão, o vídeo termina em erro e o usuário fica sem arquivo nenhum. E a estimativa de tempo mostrada durante a preparação não tem base real.

## O que já foi verificado no código

- "iniciando codificador" é a última etapa antes de mandar o trabalho para o worker; a partir daí existe um limite de 90s sem sinal de vida, que derruba o worker com "parou de responder".
- Antes disso, a preparação tem etapas com limites próprios: leitura do vídeo (15s), preparação do áudio (60s), carregamento do template (20s). Nenhuma delas informa quanto tempo levou.
- Com um único trecho (o caso do print), o decodificador não fica repassando o vídeo — então o gargalo **não** é o corte em si.
- O que a causa exata é ainda **não está confirmado**: pode ser a preparação do áudio, o início do codificador dentro do worker, ou o custo por quadro. Medir isso é o primeiro passo do plano, não um palpite.

## Plano

### 1. Descobrir onde o tempo vai (primeiro passo, obrigatório)
Reproduzir o caso real em teste automatizado: vídeo de ~60s, edição de corte aplicada, exportação 1080×1920, medindo separadamente: leitura do vídeo, preparação do áudio, template, tempo até o primeiro quadro sair do worker e quadros por segundo depois disso. Sem esse número, qualquer "otimização" é chute.

### 2. Nunca mais terminar com zero arquivos
- Quando o worker trava, o vídeo é reprocessado automaticamente no "modo seguro" (caminho da tela) em vez de virar erro — o usuário recebe o arquivo, mesmo que mais devagar.
- O relatório do lote passa a dizer em qual etapa travou e quanto cada etapa levou.

### 3. Progresso e tempo honestos
- Enquanto está preparando, mostrar a etapa real ("preparando áudio", "carregando template") **sem** estimativa de minutos.
- A estimativa só aparece depois que quadros reais começam a ser codificados.
- Uma única barra em toda a tela: o cartão de dentro e o rodapé continuam lendo o mesmo estado.

### 4. Atacar o gargalo medido
Conforme o resultado do passo 1, aplicar a correção correspondente:
- áudio lento → reaproveitar o áudio já decodificado entre variações e formatos e cortar só os trechos usados;
- início do codificador lento → configurar o codificador antes da preparação pesada, para o primeiro quadro sair cedo;
- custo por quadro alto → o fundo desfocado em baixa resolução (já implementado) e redução automática de qualidade do fundo assumem, e a validação mede o ganho real.

### 5. Validar
Typecheck, os 144 testes, build, e a medição do passo 1 repetida antes/depois para provar em números que uma edição simples de 1 minuto exporta em tempo razoável e sem erro.

## Detalhes técnicos

Arquivos envolvidos: `src/lib/render-pool.ts` (etapas de preparação, limites e watchdog), `src/lib/render.ts` (encadeamento worker → tela → gravação e reprocesso no modo seguro), `src/lib/encode-core.ts` (loop de quadros e primeiro sinal de progresso), `src/lib/batch-runtime.ts` e `src/components/BatchProgressDock.tsx` (estado de progresso e estimativa), além de um teste de medição novo em `src/lib/__tests__/`.

## Fora deste plano

Renderização na VPS ("Renderizar na nuvem") continua indisponível enquanto o worker do servidor não estiver publicado — isso é um trabalho separado.
