# Contrato de template

Template é dado estruturado, nunca um MP4 fechado. A definição declara id, versão, duração, aspect ratios e placeholders. A instance futura contém tracks, clips, texto, mídia, captions, efeitos, transições e animações editáveis.

Validação mínima atual:

- id e nome;
- duração positiva;
- pelo menos um aspect ratio;
- placeholders sem ids duplicados.

Os exemplos `Social Focus` e `Clean Podcast` são originais e usam mini render programático. A aplicação completa de templates ao documento será implementada após o manifest V2.
