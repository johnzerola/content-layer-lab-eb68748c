# O que falta para lançar o VaiViral

Estado verificado hoje: o app compila sem erros, o fluxo de criar template, importar, processar em lote, exportar, agendar e publicar existe, e Facebook/Instagram/YouTube já publicam de verdade. O que impede um lançamento comercial hoje são quatro pontos concretos.

## Bloqueio 1 — Pagamento é simulado (crítico)

Hoje a assinatura é criada e ativada sem nenhuma cobrança real: todo plano nasce marcado como "simulado" e o checkout apenas libera o acesso. Ninguém paga.

O que fazer:
- Ligar um provedor de pagamento real (Stripe ou Paddle) com os planos atuais.
- Ativar/renovar/cancelar a assinatura pelo aviso do provedor, não pelo clique do usuário.
- Bloquear o uso quando o período acabar e mostrar aviso antes de expirar.
- Manter os créditos por plano já existentes ligados ao ciclo pago.

## Bloqueio 2 — Os vídeos exportados não ficam guardados

A Biblioteca registra o que foi exportado, mas o arquivo só existe no computador de quem exportou. Quem troca de máquina, ou fecha sem baixar, perde o resultado.

O que fazer:
- Guardar cada arquivo final no armazenamento privado, com link de download por tempo limitado.
- Unificar na Biblioteca resultados locais e da nuvem, com prévia, baixar individual e em lote.
- Definir quanto tempo cada plano guarda os arquivos, com aviso antes de apagar.

## Bloqueio 3 — TikTok aparece mas não publica

Instagram, Facebook e YouTube publicam de verdade. TikTok é sempre recusado internamente, mesmo aparecendo na interface.

O que fazer (escolher um):
- Concluir a publicação oficial do TikTok (aprovação do app + envio de conteúdo); ou
- Esconder o TikTok da agenda até estar aprovado, deixando claro "em breve" em vez de erro.

## Bloqueio 4 — Peso e lentidão da tela principal

A tela inicial tem 3.677 linhas e carrega todos os estúdios de uma vez. É a maior fonte de lentidão no primeiro acesso e em máquinas fracas.

O que fazer:
- Separar cada estúdio em seu próprio arquivo e carregar sob demanda.
- Evitar redesenhar a prévia quando nada mudou.

## Antes de abrir para o público (checklist curto)

- Página de preços coerente com os planos cobrados e limites reais.
- Termos, privacidade e exclusão de dados publicados e acessíveis (já existem as telas).
- Um teste completo real: criar conta, pagar, importar, processar lote, baixar, agendar e publicar.
- Monitoramento de erros e um canal de suporte visível.

## Ordem sugerida

```text
Pagamento real
    ↓
Resultados guardados na nuvem + download confiável
    ↓
TikTok: concluir ou esconder
    ↓
Performance da tela principal
    ↓
Teste completo e lançamento
```

## Notas técnicas

- Pagamento: substituir `activatePlan`/`simulated` em `src/lib/subscription.ts` por ativação via webhook em `src/routes/api/public/`, com a tabela `subscriptions` como espelho do provedor.
- Resultados: persistir no Storage privado com URL assinada; `ResultLibrary` passa a ler linhas do banco além do histórico local.
- TikTok: `activeProvider` em `src/lib/publish.server.ts` retorna `null` para `tiktok`; ou implementar o Content Posting API ou filtrar a plataforma na agenda.
- Performance: dividir `src/routes/index.tsx` e usar carregamento sob demanda dos estúdios.
