# Estúdio real e acesso com Google

## Objetivo
Transformar a entrada do editor em uma área de estúdio completa, preservando o editor profissional já existente e suas funções reais de timeline, cortes e exportação.

## O que será feito
- Redesenhar `/editor` com a identidade visual da landing: cabeçalho forte, upload 9:16, atalhos claros e galeria de projetos recentes.
- Manter o fluxo real: ao enviar um vídeo, criar e salvar o projeto e abrir o editor profissional existente.
- Destacar no editor a timeline multifaixa, cortes pela transcrição, prévia vertical e exportação MP4 real, sem criar uma segunda lógica de edição.
- Fazer os CTAs principais da landing, planos e demonstração enviarem usuários autenticados para `/editor`; visitantes continuam no cadastro/acesso.
- Preservar `/editor-demo` como demonstração pública, mas trocar seu CTA final pelo CTA inteligente de conta.
- Confirmar que o botão “Continuar com Google” inicia o acesso oficial e retorna para o estúdio.

## Validação
- Rodar a verificação completa do projeto e corrigir erros encontrados.
- Testar desktop e celular: landing → acesso, botão Google e abertura do estúdio.
- Testar com sessão autenticada quando houver uma conta de teste disponível; sem sessão, validar até a tela oficial do Google sem concluir uma conta em nome do usuário.

## Detalhes técnicos
- Reutilizar `SavedProjects`, criação persistida de projetos e a rota dinâmica do editor profissional.
- Reutilizar a renderização WebCodecs e a timeline existentes; não alterar CleanerIA, RunPod ou os motores do Editor V1/V2.
- Manter rotas e dados atuais compatíveis, alterando apenas apresentação e navegação necessárias.