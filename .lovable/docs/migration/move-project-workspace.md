# Como mover o VaiViral para outra conta ou workspace no Lovable

> **TL;DR:** Mover o projeto não apaga o código, mas desconecta o sync com GitHub e pode quebrar integrações sociais (Meta, YouTube, TikTok) e secrets do workspace. Este guia mostra como fazer a mudança sem perder dados nem funcionalidades.

---

## 1. O que acontece quando você move o projeto

Ao confirmar **Move** no modal do Lovable, o sistema faz o seguinte:

| Item | O que acontece | Ação necessária depois |
|------|----------------|------------------------|
| Código-fonte do app | **Permanece** no projeto Lovable | Nenhuma |
| Histórico de versões do Lovable | **Permanece** | Nenhuma |
| Sync GitHub | **É desconectado** | Reconectar GitHub no novo workspace |
| Repositório antigo no GitHub | **Não é apagado**, mas para de receber atualizações | Decidir se cria repo novo ou reusa o antigo |
| Banco de dados (Lovable Cloud / Supabase) | **Permanece** vinculado ao projeto, mas pode precisar de reautorização | Verificar conexão e tabelas |
| Colaboradores diretos do projeto | **Perdem acesso** | Reconvidar no novo workspace |
| Secrets de runtime (RunPod, Meta, YouTube etc.) | **Não acompanham** o projeto; ficam no workspace antigo | Recriar/reconfigurar no novo workspace |
| Integrações sociais (OAuth) | **Tokens expiram/invalidam** | Refazer login em cada plataforma |
| Analytics do Lovable | **É resetado** | Nenhuma (histórico antigo fica no workspace anterior) |

> **Importante:** o backend (banco, storage, auth) continua funcionando para o projeto, mas secrets que o agente/usava em server functions (`process.env`) precisam ser reconfigurados no novo workspace.

---

## 2. Antes de mover: faça um backup de segurança

1. **Exporte o código atual**
   - No Lovable, abra o Code Editor e clique em **Download codebase** (plano pago), ou
   - No repositório GitHub atual, faça `git clone` do repo para sua máquina.

2. **Anote as integrações ativas**
   - Vá em **Project Settings → Integrations** e anote tudo que está conectado:
     - GitHub (nome do repo)
     - Supabase / Lovable Cloud
     - Conectores (Meta, YouTube, TikTok, RunPod etc.)
   - Vá em **Settings → Secrets** (ou peça ao agente para listar com `fetch_secrets`) e anote os nomes dos secrets. **Nunca copie os valores dos secrets para um arquivo comum.**

3. **Verifique o estado do banco**
   - Confirme que as tabelas principais (`profiles`, `projects`, `cleaner_jobs`, `scheduled_posts`, `social_accounts` etc.) estão intactas.
   - Se tiver dados críticos, solicite uma exportação do banco antes da mudança.

4. **Pare agendamentos e jobs ativos**
   - Se houver posts agendados, publicações automáticas ou jobs do CleanerIA em andamento, aguarde a conclusão ou pause-os para evitar estados inconsistentes durante a transição.

---

## 3. Passo a passo da mudança

### 3.1. Crie/acesse a conta ou workspace de destino

1. Faça login na conta Lovable de destino.
2. (Opcional) Crie um workspace novo em **Settings → Workspaces → Create workspace**.
3. Verifique se o plano da conta de destino suporta as funcionalidades usadas (Lovable Cloud, conectores, múltiplos colaboradores etc.).

### 3.2. Inicie a mudança no projeto original

1. No projeto VaiViral original, vá em **Project Settings → Project → Move to workspace**.
2. Escolha o workspace de destino na lista.
3. Leia os avisos (colaboradores removidos, GitHub desconectado, analytics resetado).
4. Clique em **Confirm move**.

### 3.3. Aguarde a conclusão

- O projeto aparecerá na nova conta em poucos segundos.
- Se o projeto for grande, a cópia pode levar alguns minutos.

---

## 4. Depois de mover: checklist de religação

### 4.1. GitHub

1. Na nova conta, abra o projeto.
2. Clique no **+** no canto inferior esquerdo do chat → **GitHub → Connect project**.
3. Autorize o app do Lovable no GitHub.
4. Escolha se quer:
   - **Criar um repositório novo** (recomendado para não misturar histórico), ou
   - **Reconectar o repositório antigo** (se você for owner/admin dele).

> **Atenção:** se o repo antigo pertence ao workspace/conta anterior e você não for owner, crie um novo repo e faça push do código baixado no passo 2.

### 4.2. Lovable Cloud / Supabase

1. Vá em **Backend → Overview** e confirme que o projeto ainda aponta para o mesmo banco.
2. Teste uma leitura simples (ex.: abra a página `/projetos` e veja se seus projetos aparecem).
3. Se o banco parecer vazio ou desconectado:
   - Vá em **Project Settings → Integrations → Supabase** e reconecte.
   - Caso seja necessário, restaure os dados a partir da exportação feita no passo 2.

### 4.3. Secrets de runtime

Secrets como `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, `CLEANER_WORKER_SECRET`, `PUBLISH_HOOK_SECRET`, `META_APP_SECRET`, `YOUTUBE_CLIENT_SECRET` etc. **não migram automaticamente**. Você precisa reconfigurá-los:

1. Vá em **Project Settings → Secrets** (ou peça ao agente para usar `add_secret`).
2. Para cada secret que estava no projeto antigo, adicione novamente:
   - `RUNPOD_API_KEY` → chave da API da RunPod
   - `RUNPOD_ENDPOINT_ID` → ID do endpoint serverless
   - `CLEANER_WORKER_URL` → URL do worker CleanerIA (VPS ou RunPod)
   - `CLEANER_WORKER_SECRET` → segredo compartilhado com o worker
   - `PUBLISH_HOOK_SECRET` → segredo dos crons de publicação automática
   - Secrets de OAuth (Meta, YouTube, TikTok) geralmente são reconectados pelos conectores, não manualmente.

> **Dica:** se não lembrar de todos os secrets, peça ao agente para listar com `fetch_secrets` no projeto antigo **antes** de mover.

### 4.4. Conectores sociais (Meta, YouTube, TikTok)

1. Vá em **Project Settings → Connectors**.
2. Para cada plataforma que estava conectada, clique em **Connect** e refaça o OAuth.
3. No VaiViral, depois de reconectar, acesse **Integrações** (`/integracoes`) e verifique se as contas/páginas aparecem.

### 4.5. Domínio publicado (se houver)

1. Se o projeto estava publicado em domínio customizado, o domínio continua apontando para o projeto antigo.
2. Na nova conta, vá em **Publish → Add custom domain** e reconecte o domínio.
3. Atualize os registros DNS no provedor do domínio, se necessário.

### 4.6. Colaboradores

1. No novo workspace, vá em **Share** e reconvide os membros com os papéis corretos (Viewer, Editor, Admin).
2. Se você quiser que eles vejam **todos** os projetos da nova conta, convide pelo **Workspace Settings → People**.

---

## 5. Validação pós-migração

Após religar tudo, execute estes testes rápidos:

- [ ] Login funciona (`/auth` ou fluxo normal).
- [ ] Página inicial carrega sem erros.
- [ ] `/projetos` lista projetos existentes.
- [ ] `/limpar-ia` ou `/remover` consegue consultar o worker CleanerIA (health check).
- [ ] `/integracoes` mostra contas sociais reconectadas.
- [ ] Agendamento: crie um post de teste agendado para 2 minutos no futuro e confirme se o cron publica.
- [ ] Editor profissional (`/estudio`) abre e salva projetos no banco.
- [ ] GitHub: faça uma pequena alteração no Lovable e confirme que ela apareceu no repositório.

---

## 6. Problemas comuns

### O projeto sumiu da conta antiga mas não aparece na nova
- Saia e faça login novamente na conta de destino.
- Verifique se você entrou com o mesmo e-mail/usuário.
- Espere até 5 minutos e recarregue a página.

### GitHub não conecta
- Revogue o acesso do Lovable GitHub App nas configurações do GitHub → Applications, depois tente novamente.
- Certifique-se de que você é owner do workspace de destino.

### Banco parece vazio
- O projeto pode ter sido desvinculado do Supabase original. Vá em **Project Settings → Integrations** e reconecte.
- Se o banco realmente estiver vazio, restaure a partir da exportação feita antes da migração.

### Publicação social falha
- Tokens OAuth não migram. Refaça a conexão em `/integracoes`.
- Verifique se os secrets `PUBLISH_HOOK_SECRET` e chaves de conectores foram recriados.

### CleanerIA parou de funcionar
- Confirme `CLEANER_WORKER_URL` e `CLEANER_WORKER_SECRET` em **Secrets**.
- Se usar RunPod, reconecte o conector ou reinsira `RUNPOD_API_KEY` / `RUNPOD_ENDPOINT_ID`.
- Teste o health check do worker em `/api/public/cleaner-health`.

---

## 7. Resumo para não esquecer

1. **Backup:** baixe o código e exporte o banco.
2. **Mova:** Project Settings → Move to workspace.
3. **Religue:** GitHub → Supabase → Secrets → Conectores sociais → Domínio → Colaboradores.
4. **Valide:** login, projetos, CleanerIA, integrações, agendamento, GitHub sync.

Se alguma integração exigir credenciais que você não tem mais em mãos, peça ao agente para ajudar a reconfigurar usando os fluxos seguros de secrets do Lovable.
