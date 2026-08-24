# Corrigir definitivamente a conexão com Facebook

## Diagnóstico confirmado

- O callback publicado `https://content-layer-lab.lovable.app/integracoes/facebook/callback` existe e responde normalmente.
- O print mais recente abriu `facebook.com/dialog/oauth` sem versão.
- O código atual já gera `facebook.com/v26.0/dialog/oauth` com `config_id`, `response_type=code` e `override_default_response_type=true`.
- Portanto, a publicação acessada no teste está desatualizada em relação ao código atual. Ainda não há evidência de que novas mudanças no formato da URL resolverão um eventual bloqueio da configuração no painel da Meta.

## Implementação

1. **Validar a configuração antes de redirecionar**
   - Criar uma verificação segura no servidor para confirmar que App ID, redirect URI, Graph version e config ID estão presentes.
   - Nunca devolver segredo ou token ao navegador.
   - Retornar mensagens específicas para configuração ausente, URL divergente e rejeição da Meta.

2. **Fortalecer e testar a URL do Facebook Login for Business**
   - Manter o endpoint versionado e os parâmetros obrigatórios atuais.
   - Adicionar testes dedicados para Facebook, cobrindo URL, callback, `state`, ausência de `scope` manual e troca do código.
   - Garantir que Instagram e Facebook continuem usando o mesmo fluxo empresarial e que a conta Instagram vinculada seja descoberta após o login.

3. **Melhorar o diagnóstico na tela de Integrações**
   - Antes de sair do VaiViral, exibir um erro acionável quando a configuração não estiver pronta.
   - No retorno da Meta, preservar e mostrar o código e a descrição segura do erro, sem credenciais.
   - Diferenciar erro do VaiViral de rejeição externa da configuração empresarial da Meta.

4. **Publicar e validar a versão efetivamente servida**
   - Publicar a correção no domínio em uso.
   - Confirmar que o botão publicado gera `/v26.0/dialog/oauth`, o `redirect_uri` exato do domínio publicado e o `config_id` configurado.
   - Executar o fluxo em sessão autenticada até o diálogo da Meta e verificar o retorno ao callback.

5. **Se a Meta ainda mostrar a página genérica**
   - Tratar como bloqueio da configuração empresarial, pois nessa etapa a requisição já saiu corretamente do VaiViral.
   - Orientar a recriação da configuração de Facebook Login for Business no mesmo App ID e a substituição segura apenas do `META_LOGIN_CONFIG_ID`.
   - Repetir o teste com a configuração nova antes de alterar qualquer outro código.

## Resultado esperado

O botão publicado usa comprovadamente a versão atual do fluxo. Falhas locais aparecem com diagnóstico claro; se a Meta rejeitar o `config_id`, o sistema identifica essa fronteira e informa a única ação externa necessária, sem novas tentativas aleatórias no código.
