# Publicação social

## Arquitetura

```text
vídeo -> scheduled_posts -> scheduler -> claim RPC -> social_account
      -> social_connection -> publish() -> provider adapter -> API externa
```

`video_path` é a referência permanente. Cada tentativa cria uma nova URL
assinada no servidor; `video_url` existe apenas para compatibilidade com
registros antigos.

`claim_due_scheduled_posts` reivindica trabalhos com `FOR UPDATE SKIP LOCKED`,
incrementa `attempts` e também recupera locks vencidos. Falhas temporárias
retornam a `agendado` com `next_attempt_at`; falhas permanentes ou tentativas
esgotadas passam para `falhou`.

## Configuração

Use os nomes documentados em `.env.example`. Segredos nunca usam prefixo
`VITE_`. O endpoint aceita somente:

```text
POST /api/public/hooks/publish-due
Authorization: Bearer <PUBLISH_CRON_SECRET>
```

O segredo deve ter pelo menos 32 caracteres. Em desenvolvimento, faça uma
chamada manual com esse header. A resposta contém apenas contadores.

## Scheduler

O Supabase hospedado suporta Cron (`pg_cron`), chamadas HTTP por `pg_net` e
segredos criptografados no Vault. A ativação não está em migration porque URL e
segredo variam por ambiente e nunca devem entrar no Git.

### Ativação recomendada no Supabase

1. Publique a aplicação e configure nela `PUBLISH_CRON_SECRET` com um valor
   aleatório de pelo menos 32 caracteres.
2. No Dashboard do Supabase, abra **Integrations → Vault** e crie:
   - `publish_dispatch_url`: URL completa HTTPS terminando em
     `/api/public/hooks/publish-due`;
   - `publish_cron_secret`: exatamente o mesmo valor configurado na aplicação.
3. Abra **Integrations → Cron → Create job**.
4. Use o nome `publish-due-every-minute` e a expressão `* * * * *`.
5. Escolha SQL snippet e salve exatamente:

```sql
select net.http_post(
  url := (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'publish_dispatch_url'
  ),
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'publish_cron_secret'
    )
  ),
  body := jsonb_build_object('triggered_at', now()),
  timeout_milliseconds := 55000
) as request_id;
```

O intervalo recomendado é um minuto: mantém precisão suficiente para posts e
permite que `next_attempt_at` seja reavaliado automaticamente sem chamadas
excessivas.

### Validação

Teste primeiro o endpoint fora do Cron:

```bash
curl --request POST \
  --header "Authorization: Bearer $PUBLISH_CRON_SECRET" \
  --header "Content-Type: application/json" \
  "https://SEU_DOMINIO/api/public/hooks/publish-due"
```

Resposta saudável, mesmo sem posts:

```json
{ "ok": true, "processed": 0, "published": 0, "retrying": 0, "failed": 0 }
```

Depois confira o job e as últimas execuções no SQL Editor:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'publish-due-every-minute';

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'publish-due-every-minute'
)
order by start_time desc
limit 20;
```

No aplicativo, valide que `last_attempt_at` avança e que posts vencidos deixam
`agendado`. Para falhas temporárias, confirme `next_attempt_at` no futuro.

Para desativar com segurança:

```sql
select cron.unschedule('publish-due-every-minute');
```

## Contas e credenciais

`social_connections` é server-only: `anon` e `authenticated` não têm grants e
não há policy de leitura. Ela guarda somente referências opacas para um secret
store externo, nunca tokens em texto puro. Antes de habilitar OAuth real, é
necessário escolher e configurar esse secret store. `social_oauth_states`
reserva estados OAuth com digest e expiração, também server-only.

O fallback global existente continua disponível para Instagram:

- Ayrshare: `AYRSHARE_API_KEY`;
- Meta: `META_ACCESS_TOKEN` + `META_IG_USER_ID`.

Durante o estágio atual de teste/administração, a vinculação Meta valida no
servidor o `id` e o `username` retornados por `graph.instagram.com` e persiste
somente `provider = meta`, `provider_account_id` e o estado `conectado`. O token
global permanece exclusivamente no ambiente do servidor; nenhum `secret_ref`
falso é criado. Uma `social_connection` explícita sempre tem prioridade sobre
o fallback global, que existe apenas para registros legados `pending`.

Uma conexão por conta pode selecionar `meta` ou `ayrshare`, mas credenciais por
usuário só devem ser ativadas depois que o secret store estiver disponível.

Facebook e Instagram usam OAuth oficial da Meta e adapters próprios de
publicação. TikTok e YouTube continuam em preparação.

## OAuth Meta (Facebook e Instagram)

O conector combinado usa Facebook Login, troca o código por token de longa
duração e chama `GET /me/accounts` para obter os tokens das Páginas e a conta
Instagram profissional vinculada. A listagem percorre todas as páginas da
resposta da Graph API. Como a Meta pode omitir da lista agregada um ativo que o
usuário acabou de selecionar, o callback também lê os `target_ids` granulares
de `/debug_token` e consulta diretamente cada ID ausente. Os resultados são
mesclados por Page ID antes da persistência. Os scopes mínimos são fixos no
código:

```text
pages_show_list
pages_read_engagement
pages_manage_posts
instagram_basic
instagram_content_publish
```

`pages_read_engagement` não é opcional neste fluxo: ela é necessária para ler
as Páginas e o vínculo `instagram_business_account`. Definir um secret não
adiciona uma permissão ao App Dashboard da Meta.

No painel Meta for Developers, abra os casos de uso **Gerenciar Páginas** e
**API do Instagram com login do Facebook**, depois entre em **Permissões e
recursos**. Cada permissão acima deve estar adicionada ao app. Se
`pages_read_engagement` mostrar o botão **Adicionar** ou apenas **Encontrado em
casos de uso**, clique em **Adicionar** (ou em **Add required content
permissions** no assistente do Instagram) antes de testar o login.

Secrets de produção:

```text
META_APP_ID=<app id numérico>
META_APP_SECRET=<segredo do app>
META_GRAPH_VERSION=v26.0
META_LOGIN_MODE=classic
FACEBOOK_REDIRECT_URI=https://content-layer-lab.lovable.app/integracoes/facebook/callback
PUBLIC_SITE_URL=https://content-layer-lab.lovable.app
```

O modo clássico é o padrão e sempre envia os scopes acima. Um
`META_LOGIN_CONFIG_ID` antigo é ignorado. Para usar Login para Empresas, altere
explicitamente para `META_LOGIN_MODE=business`, defina
`META_LOGIN_CONFIG_ID` e publique na Meta uma configuração que contenha todos
os scopes obrigatórios.

Após o callback, o servidor consulta `/debug_token` e interrompe a conexão se o
token pertencer a outro app ou se faltar qualquer permissão. O painel
administrativo em `/integracoes` mostra modo, scopes e URL OAuth sem expor
segredos ou tokens.

Ao atualizar a seleção, escolha as Páginas e depois as contas profissionais do
Instagram vinculadas. O retorno mostra separadamente quantas Páginas e quantos
Instagrams foram sincronizados. Se um ID selecionado não liberar Page Access
Token, o callback preserva as demais contas e informa quantas exigem revisão de
controle total no Business Portfolio.

Referências de implementação: coleção oficial da Meta para Instagram API e o
projeto MIT `Binary-Black-Holes/instagram-api`. O projeto AGPL BrightBean Studio
foi usado apenas para comparação de comportamento; nenhum código AGPL foi
copiado.

## Diagnóstico

Consulte `scheduled_posts.status`, `attempts`, `error_code`, `error` e
`next_attempt_at`. Logs estruturados incluem IDs, plataforma, provider,
tentativa, duração e código normalizado. Eles não incluem tokens, API keys,
authorization codes nem URLs assinadas.
