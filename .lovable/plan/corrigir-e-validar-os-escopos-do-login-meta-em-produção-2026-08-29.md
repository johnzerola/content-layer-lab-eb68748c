# Corrigir e validar os escopos do Login Meta em produção

## Diagnóstico confirmado

- `META_LOGIN_SCOPES` não está configurada nos secrets atuais do projeto.
- O código atual permite somente `pages_show_list`, `pages_manage_posts`, `instagram_basic` e `instagram_content_publish`; `pages_read_engagement` é descartado mesmo se reaparecer em uma variável de ambiente.
- Há teste automatizado cobrindo exatamente esse bloqueio.
- O domínio publicado responde normalmente e seus arquivos públicos não contêm `pages_read_engagement`.
- A versão local atual está além do commit citado (`70282ec`), portanto não é necessário criar um commit vazio apenas para avançar o histórico.
- A parte decisiva ainda precisa ser confirmada no servidor publicado: a URL OAuth gerada ao clicar em conectar, pois a montagem ocorre em função server-side e não fica exposta no JavaScript público.

## Implementação

1. **Endurecer a configuração Meta**
   - Manter a allowlist mínima já existente.
   - Remover a documentação ambígua no código que sugere que `pages_read_engagement` pode ser reativado por variável.
   - Fazer o diagnóstico administrativo exibir, sem segredos, o modo efetivo (`classic` ou `business`) e a lista exata de permissões que serão enviadas.

2. **Cobrir regressões**
   - Garantir testes para configuração ausente, configuração contendo apenas escopos inválidos e configuração misturando escopos válidos/inválidos.
   - Confirmar que nenhuma URL clássica gerada contém `pages_read_engagement` e que o fluxo Business não envia `scope` manualmente.

3. **Publicar a versão atual**
   - Executar a verificação de segurança exigida antes da publicação.
   - Republicar o commit atual no domínio `content-layer-lab.lovable.app`.

4. **Validar no domínio publicado**
   - Abrir a integração com uma sessão autenticada e capturar a URL OAuth efetivamente produzida.
   - No modo clássico, confirmar `scope=pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish` e ausência de `pages_read_engagement`.
   - No modo Business, confirmar presença do `config_id` publicado e ausência do parâmetro `scope`, pois as permissões vêm da configuração da Meta.
   - Se a Meta ainda exibir o escopo inválido apesar da URL correta, tratar como configuração armazenada no painel/caso de uso da Meta, não como variável ou build do Lovable, e indicar exatamente onde removê-lo.

## Resultado esperado

O domínio publicado usará apenas as permissões necessárias para publicar em Facebook Page e Instagram profissional, e o diagnóstico mostrará claramente se qualquer erro restante vem da URL gerada pelo app ou da configuração externa da Meta.
