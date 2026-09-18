# ElevenLabs no ChatScene

## O que está no código

- `Contas e credenciais` valida a chave com o catálogo oficial e guarda somente o
  valor criptografado por conta. O navegador recebe apenas a máscara, o nome e a
  quantidade de vozes.
- `Vozes e atuação` carrega o catálogo da conta, permite escolher uma voz por
  personagem e oferece um preset de elenco animado. A síntese é feita no servidor;
  a chave não é enviada ao navegador nem gravada no projeto.
- O áudio próprio continua separado da integração. Para clonar uma voz, use o
  fluxo de referência autorizada do personagem; a ElevenLabs não é acionada para
  clonar automaticamente um arquivo sem consentimento.

## Publicação

Antes de habilitar a integração no ambiente publicado:

1. Aplique `supabase/migrations/20260918150000_ai_provider_credentials.sql` no
   projeto Supabase conectado.
2. Configure, apenas no servidor, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` e uma `SOCIAL_TOKEN_ENCRYPTION_KEY` estável com no
   mínimo 32 caracteres. A última precisa ser a mesma depois de reiniciar o
   servidor, senão as chaves salvas não podem ser descriptografadas.
3. Publique o commit e teste com uma chave ElevenLabs restrita, com permissões
   somente para listar vozes e gerar Text to Speech. Não coloque a chave em
   `VITE_*`, em localStorage ou no Git.

O catálogo usa paginação, deduplicação e timeout. Falhas de quota, permissão,
chave inválida, servidor sem migração e timeout aparecem como estados distintos.
Nenhuma chamada real à ElevenLabs é feita pelos testes automatizados.

## Verificação realizada

Em 18/09/2026, o navegador isolado exercitou os componentes reais com respostas
simuladas, sem chave pessoal nem consumo de créditos:

- chave inválida, conexão bem-sucedida, máscara e desconexão;
- erro ao verificar conexão sem exibir falso estado desconectado;
- catálogo vazio, erro de catálogo e nova tentativa bem-sucedida;
- elenco com duas identidades distintas e restauração que preserva a voz;
- velocidade máxima de 1,2 para ElevenLabs, inclusive na fronteira do servidor;
- capturas em 1280 e 390 pixels, sem overflow horizontal no painel de vozes.

Artefatos locais em `output/playwright/elevenlabs-*.png`, não versionados.
O servidor simulado teve um 404 de favicon; não houve erro de execução React no
fluxo de vozes. A captura automática ADS não pôde rodar por falta das dependências
Playwright no caminho de resolução do script; não se declara auditoria WCAG completa.

O código foi enviado à `main`, mas a migração e os segredos do ambiente publicado
não foram aplicados/verificados nesta sessão. Os `.env` locais não contêm a chave
de serviço Supabase nem a chave de criptografia. Teste autenticado com conta real,
síntese real e qualidade auditiva continuam pendentes após essa configuração.

## Plano e uso comercial

O plano gratuito atual da ElevenLabs inclui 10.000 créditos mensais, mas a página
oficial informa que o plano Free não inclui licença comercial e exige atribuição ao
publicar conteúdo não comercial. Confira a licença do plano antes de publicar um
vídeo monetizado: [preços da ElevenLabs](https://elevenlabs.io/pricing) e
[política de publicação](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform).
