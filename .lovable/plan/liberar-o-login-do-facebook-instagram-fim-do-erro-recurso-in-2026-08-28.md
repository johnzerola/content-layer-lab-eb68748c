# Liberar o Login do Facebook/Instagram (fim do erro "Recurso indisponível")

O erro que aparece hoje vem da Meta, não do app: o Login fica desativado enquanto o app não tem os dados obrigatórios (política de privacidade, exclusão de dados, categoria, ícone, e-mail) e enquanto o domínio/redirect não batem exatamente.

Metade disso é conteúdo que o app precisa publicar (eu faço), metade é configuração no painel da Meta (você faz, passo a passo abaixo).

## O que eu implemento no app

1. **Página de privacidade adaptada à Meta** (`/privacidade`)
   - Seção específica sobre Facebook/Instagram: quais dados são recebidos (ID da conta, nome de usuário, páginas, token de acesso criptografado), para quê são usados (publicar Reels/feed/stories no seu nome), quanto tempo ficam guardados e como revogar.
   - Contato de privacidade visível (e-mail).

2. **Página pública de exclusão de dados** (`/exclusao-de-dados`)
   - Explica o que é apagado e em quanto tempo.
   - Formulário simples de solicitação (e-mail + confirmação) e instrução de remoção imediata pela tela "Minhas contas".
   - É a URL que a Meta pede em "Solicitações de exclusão de dados".

3. **Callbacks obrigatórios da Meta** (rotas públicas)
   - `/api/public/meta/deauthorize` — recebe o aviso quando o usuário desautoriza o app e apaga a conexão + token daquele usuário.
   - `/api/public/meta/data-deletion` — recebe o pedido de exclusão de dados, valida a assinatura do `signed_request` com o App Secret, apaga as contas conectadas e responde no formato exigido (`url` + `confirmation_code`).

4. **Links no rodapé/vendas e na tela "Minhas contas"** para privacidade, termos e exclusão de dados (a Meta verifica se as páginas são alcançáveis).

5. **Aviso automático na tela "Minhas contas"**: se o retorno do Facebook indicar app indisponível/em revisão, o card mostra o motivo provável e o que fazer, em vez de só falhar.

## O que você faz no painel da Meta (developers.facebook.com > app "sistema postagem")

**Configurações do app > Básico**
- Ícone do app (1024x1024) e Categoria (Empresas / Ferramentas de produtividade).
- E-mail de contato.
- URL da Política de Privacidade: `https://content-layer-lab.lovable.app/privacidade`
- URL dos Termos: `https://content-layer-lab.lovable.app/termos`
- Domínios do app: `content-layer-lab.lovable.app`
- Salvar.

**Login do Facebook para Empresas > Configurações**
- URIs de redirecionamento do OAuth válidos (exatos, sem barra no final):
  - `https://content-layer-lab.lovable.app/integracoes/facebook/callback`
  - `https://content-layer-lab.lovable.app/integracoes/instagram/callback`
- Desautorizar URL de retorno: `https://content-layer-lab.lovable.app/api/public/meta/deauthorize`
- URL de solicitação de exclusão de dados: `https://content-layer-lab.lovable.app/api/public/meta/data-deletion`
- Salvar alterações.

**Login do Facebook para Empresas > Configurações (Configurações de login)**
- Abrir a configuração usada pelo app, confirmar que ela está **publicada/ativa** e que o ID dela é o mesmo do segredo `META_LOGIN_CONFIG_ID`.
- Permissões da configuração: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management`.

**Ativar o app**
- No topo do painel, mudar de "Em desenvolvimento" para **Ativo**. Enquanto estiver em desenvolvimento, só contas com papel (Admin/Desenvolvedor/Testador) conseguem logar — qualquer outra vê "Recurso indisponível".

**Teste rápido antes de ativar**
- Funções do app > adicionar sua conta como Testador e tentar conectar em Minhas contas.

## Observações técnicas

- O app usa o preview em `preview--content-layer-lab.lovable.app`, mas o `redirect_uri` enviado é sempre o do domínio publicado (`content-layer-lab.lovable.app`) — por isso apenas esses dois URIs precisam estar cadastrados. A conexão deve ser feita pelo site publicado.
- O `data-deletion` valida `signed_request` com HMAC-SHA256 usando `META_APP_SECRET` (segredo já existente) antes de apagar qualquer coisa; retorna 400 se a assinatura não conferir.
- As duas rotas ficam sob `src/routes/api/public/` porque a Meta chama de fora, sem sessão.
- A exclusão remove `social_connections`, `social_connection_credentials` e marca as `social_accounts` do usuário como desconectadas.
