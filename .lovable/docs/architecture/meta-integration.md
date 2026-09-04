# Integração Meta API

O motor de publicação (`src/lib/publish.server.ts`) gerencia o fluxo de envio de vídeos para o Instagram Reels e Feed.

## Fluxo de Publicação
1. **Criação de Container:** O vídeo (URL pública) é enviado para a Meta para criação de um container de mídia.
2. **Polling de Status:** O sistema aguarda (`check_status`) até que a Meta processe o vídeo (status 'FINISHED').
3. **Publicação Final:** O container processado é publicado no perfil do usuário.

## Configurações Necessárias
- `META_ACCESS_TOKEN`: Token de longa duração da aplicação.
- `META_IG_USER_ID`: ID da conta comercial do Instagram.
- `PUBLISH_CRON_SECRET`: Chave de segurança para disparar o worker de publicação.

### Login Facebook/Instagram

O fluxo principal usa OAuth clássico para que as permissões sejam controladas pelo app, sem depender de um caso de uso do Login para Empresas:

```text
META_LOGIN_MODE=classic
META_LOGIN_SCOPES=pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish
```

Com `META_LOGIN_MODE=classic`, qualquer `META_LOGIN_CONFIG_ID` existente é ignorado. A URL envia o parâmetro `scope` e nunca envia `config_id` nem `pages_read_engagement`. Valores em `META_LOGIN_SCOPES` fora da allowlist acima são descartados.

No modo Business, o app envia `config_id` e não envia `scope`; nesse caso, as permissões vêm da configuração externa da Meta e podem incluir `pages_read_engagement` sem que esse valor exista no código.

## Tratamento de Erros
Erros da API da Meta são capturados e salvos na coluna `error_log` da tabela `scheduled_posts` para facilitar a depuração pelo usuário na interface de Agenda.
