# Agendamento confiável: alerta de token + aviso de falha

## Situação atual (verificada)

- Os posts agendados ficam salvos no banco, com o vídeo no armazenamento privado — nada depende do navegador do usuário.
- Um job no servidor roda a cada minuto, com trava contra publicação duplicada e novas tentativas automáticas.
- A fila já marca posts como "falhou" e guarda um código de erro, e a tela da Agenda já tem botão "Publicar agora".

Conclusão: agendar dentro do VaiViral é seguro mesmo com a página fechada ou sem internet. O que falta é **aviso**: hoje o usuário só descobre o problema se abrir a Agenda e olhar a fila.

## O que será construído

### 1. Alerta preventivo de conexão expirando

- Na Agenda, um aviso no topo do bloco "Contas conectadas" quando a conexão de uma conta estiver expirada ou expirando em menos de 7 dias.
- Marcação visual no próprio card da conta (badge "Reconectar" / "Expira em X dias") com atalho para reconectar.
- Ao agendar um post para uma conta com conexão inválida ou prestes a expirar antes do horário escolhido, mostrar um aviso claro antes de confirmar — sem bloquear o agendamento.

### 2. Aviso de falha na publicação com reenvio em 1 clique

- Banner de resumo na Agenda: "N publicações falharam" com atalho para a lista filtrada.
- Cada item falho mostra a mensagem de erro em linguagem simples (token inválido, formato de mídia recusado, limite da plataforma, etc.), não o código bruto.
- Botão "Tentar de novo" que reenfileira o post (limpa o erro, restaura o status agendado para agora) além do "Publicar agora" já existente.
- Reenvio em lote para todos os posts falhos do dia.

## Detalhes técnicos

- Reaproveitar o carregamento de contas já existente na Agenda, incluindo o dado de expiração da conexão que já é exposto para a tela de Perfis; nenhuma mudança de schema é necessária.
- Mapeamento de código de erro → mensagem amigável em um módulo compartilhado, usado na Agenda e na fila.
- O "Tentar de novo" reutiliza a função de publicação existente, apenas resetando status/erro/tentativa; a trava de concorrência do worker continua valendo.
- Sem alteração no job do servidor, na lógica de publicação por plataforma ou nas rotas de API.
