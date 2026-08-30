# Corrigir conexão de múltiplos canais do YouTube

## Objetivo
Permitir que o usuário conecte seus dois ou mais canais do YouTube sem que uma nova autorização substitua o canal já salvo.

## Alterações
- Forçar o seletor de conta/canal do Google em cada nova autorização.
- Tratar cada canal autorizado como uma conexão independente, identificada pelo ID oficial do canal.
- Ajustar a interface para exibir claramente **Adicionar outro canal** e manter **Sincronizar canais** para atualizar conexões existentes.
- Corrigir os textos que hoje sugerem incorretamente que uma única autorização sempre descobre todos os canais de marca.
- Adicionar testes para garantir que canais distintos são preservados e que o OAuth abre o seletor.

## Resultado esperado
Após conectar o primeiro canal, o usuário poderá clicar em **Adicionar outro canal**, escolher o segundo canal no Google e ver ambos listados em **Conexão oficial Google**.

## Detalhes técnicos
- OAuth Google com `prompt=select_account consent` e acesso offline.
- Persistência priorizando `provider_account_id` (ID imutável do canal), sem depender apenas do nome/handle.
- Nenhuma alteração na integração Meta ou nas permissões existentes.
