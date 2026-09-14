# TikTok real na Biblioteca

## Resultado
A Biblioteca permitirá escolher uma conta TikTok conectada, enviar um vídeo já pronto pela API oficial e acompanhar o processamento até exibir o link da publicação.

## Implementação
- Ativar o OAuth oficial do TikTok na tela de Integrações, com as permissões de perfil, upload e publicação já previstas no projeto.
- Implementar o adaptador do TikTok Content Posting API para iniciar o Direct Post por URL privada temporária, consultar o estado e obter o identificador/link público quando disponível.
- Renovar automaticamente o token TikTok antes do envio e persistir a credencial renovada de forma criptografada.
- Habilitar contas TikTok na Biblioteca e na fila somente quando estiverem conectadas; validar vídeo, legenda e consentimento antes do upload.
- Mostrar os estados “enviando”, “processando”, “publicado” e “falhou”, preservando o link retornado para abrir o post.
- Atualizar testes do adaptador e da fila, documentação e checklist de lançamento.

## Segurança e limites externos
- Tokens permanecem somente no servidor e criptografados; a Biblioteca nunca recebe credenciais.
- O envio usa exclusivamente a API oficial, sem automação de navegador.
- Para produção, o app do TikTok precisa estar aprovado para Direct Post e os segredos `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` e a URL de retorno precisam estar configurados. Sem aprovação, o TikTok pode restringir o post a privado ou impedir publicação direta.

## Validação
- Testes de upload, renovação de token, falhas do provedor e link do post.
- TypeScript, testes, build e fluxo visual da Biblioteca/Integrações.
