# Diagnóstico do Login do Facebook e plano de correção

## O que eu já verifiquei (fatos, não suposições)

- As páginas exigidas pela Meta estão no ar em produção: `/privacidade`, `/termos`, `/exclusao-de-dados` e `/api/public/meta/data-deletion` respondem 200.
- O diálogo de login clássico da Meta para o seu App ID abre normalmente (sem "App não configurado" e sem "Recurso indisponível"). Ou seja, o app em si existe e responde.
- No código, o botão só redireciona depois de passar por uma validação local: a URL gerada precisa ter o caminho `/<versão do Graph>/dialog/oauth` e o `redirect_uri` exatamente igual ao configurado. Se a versão do Graph configurada no servidor não bater, o app mostra "A configuração gerada para o Facebook não passou na validação de segurança" e **nem abre o login** — o sintoma que você descreve.
- O fluxo usa `config_id` (Login para Empresas) + `override_default_response_type=true`. Se essa configuração não estiver publicada/ativa, a Meta rejeita antes de mostrar a tela de consentimento.

## O que está errado nas telas da Meta (pelas capturas)

1. Em "URIs de redirecionamento do OAuth válidos" existe apenas o callback do Facebook. Falta o callback do Instagram:
   `https://content-layer-lab.lovable.app/integracoes/instagram/callback`
2. "Domínios permitidos para o SDK do JavaScript" está com barra final (`https://content-layer-lab.lovable.app/`). Deve ser sem barra.
3. O app não tem ícone e não tem Página do app — a Meta bloqueia o login exibindo "estamos atualizando detalhes adicionais" enquanto isso faltar.
4. Precisa confirmar: app em modo **Ativo (Live)** e a configuração do Login para Empresas realmente **publicada** e associada ao mesmo `config_id` guardado no servidor.

## O que vou implementar no app

1. **Tela de diagnóstico Meta** (visível só para admin, em `/integracoes`):
   - mostra a versão do Graph configurada, o `redirect_uri` efetivo, o `config_id` mascarado, e a URL de autorização gerada;
   - executa uma checagem no servidor contra a Graph API confirmando se o `config_id` existe, está publicado e pertence ao App ID;
   - lista, em português, o que falta ajustar no painel da Meta.
2. **Mensagens de erro reais em vez da genérica**: substituir "não passou na validação de segurança" por um erro que diga exatamente qual campo divergiu (versão do Graph, origem, caminho) e registre isso no log do servidor.
3. **Tratamento do retorno com erro**: quando a Meta devolver `error`, `error_code`, `error_reason` no callback, exibir a mensagem original da Meta na tela em vez de uma falha silenciosa.
4. **Alinhar a versão do Graph** com a que está no painel (v26.0), e validar na inicialização que `FACEBOOK_REDIRECT_URI`, `META_REDIRECT_URI` e `PUBLIC_SITE_URL` apontam para `content-layer-lab.lovable.app`.

## O que só você pode fazer no painel da Meta

- Adicionar o redirect do Instagram e remover a barra final do domínio do SDK.
- Enviar um ícone quadrado do app e criar/associar a Página do app.
- Publicar a configuração do Login para Empresas e colocar o app em modo Ativo (ou adicionar sua conta como testadora).

## Detalhes técnicos

Arquivos envolvidos: `src/lib/facebook-oauth.server.ts` (validação de config e URL de autorização), `src/lib/meta.server.ts` (versão do Graph), `src/routes/integracoes.tsx` (validação no cliente e UI de diagnóstico), rota de callback do Facebook (mensagens de erro da Meta). Nenhum segredo novo é necessário; o diagnóstico nunca expõe `META_APP_SECRET`.
