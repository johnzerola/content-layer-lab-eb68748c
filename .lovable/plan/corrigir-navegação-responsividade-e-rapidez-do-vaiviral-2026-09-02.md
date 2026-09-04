# Corrigir navegação, responsividade e rapidez do VaiViral

## Objetivo
Eliminar o travamento visual ao sair de Integrações, manter navegação consistente em todas as áreas e reduzir esperas desnecessárias sem alterar publicação, créditos, processamento ou contratos existentes.

## Diagnóstico confirmado
- Em `/integracoes`, os atalhos de ferramenta do menu chamam apenas `setMode`. Isso muda o item ativo, mas não navega para `/`, então o conteúdo de Integrações permanece na tela.
- O mesmo padrão local aparece em Agenda, Biblioteca, Armazenamento e Live; em Métricas, Perfis e Admin alguns callbacks do menu não fazem nada.
- Rotas centrais como Cortes, Editor, Estilos, Estúdio, Projetos, Contas, FotoViral e CleanerIA não usam o shell compartilhado, fazendo o menu desaparecer e quebrando o retorno entre áreas.
- A navegação por links reais do menu funciona: no teste, `/integracoes` abriu `/projetos`; o problema específico ocorre nos atalhos de ferramenta baseados em estado.

## Implementação

### 1. Corrigir a navegação das ferramentas
- Criar um contrato único no `AppShell` para abrir ViralBatch, LimpaVídeo e CleanerIA a partir de qualquer rota.
- Nas páginas externas, navegar para `/` levando a ferramenta escolhida de forma explícita; na home, continuar trocando de ferramenta sem recarregar a página.
- Fazer a home consumir essa seleção na chegada e limpar o estado pendente, preservando filas e handoffs existentes.
- Remover callbacks vazios ou estados locais que apenas mudam o destaque do menu sem trocar a tela.

### 2. Padronizar o shell nas páginas internas
- Aplicar o `RouteShell`/variante adequada em Cortes, Editor, Estilos, Projetos, Contas, FotoViral e CleanerIA.
- Criar uma variante compacta para Estúdio e editores de tela cheia, mantendo ao menos marca, voltar, menu móvel e acesso às áreas principais sem reduzir a área de trabalho.
- Evitar shells aninhados e manter um único comportamento de menu, conta, créditos e Nuvem.

### 3. Melhorar usabilidade e responsividade
- Garantir drawer móvel funcional com fechamento após navegação, foco acessível, rolagem independente e botão de menu sempre visível.
- Ajustar cabeçalhos, barras de ações e grades densas de Integrações para empilhar corretamente em telas menores, sem corte horizontal ou botões espremidos.
- Preservar indicação ativa baseada na URL real, não em estado visual desconectado.
- Trocar links internos que recarregam toda a aplicação por navegação TanStack quando não forem fluxos OAuth externos.

### 4. Melhorar rapidez percebida e real
- Manter o shell estável entre trocas de página e exibir estado de navegação/carregamento no conteúdo, evitando a sensação de clique sem resposta.
- Carregar diagnósticos e listas de contas de Integrações de forma independente, com placeholders e falha isolada por seção.
- Evitar consultas repetidas de sessão/contas causadas por mounts duplicados e revisar dependências dos efeitos dessa página.
- Aplicar prefetch por intenção nos links principais e reduzir animações custosas em dispositivos lentos ou com movimento reduzido.

### 5. Procurar e corrigir bugs equivalentes
- Auditar todos os usos de `AppShell` para callbacks vazios, mudanças locais de modo e páginas sem saída de navegação.
- Revisar links internos, overlays/drawers persistentes e estados de carregamento que possam bloquear cliques ou deixar conteúdo antigo visível.
- Corrigir os casos encontrados pelo mesmo padrão central, sem criar soluções específicas duplicadas por rota.

## Validação
- Reproduzir via navegador: partir de `/integracoes` e abrir cada ferramenta e cada rota do menu, confirmando URL, título e conteúdo corretos.
- Repetir o fluxo a partir de Agenda, Métricas, Perfis, Biblioteca, Armazenamento e Live.
- Testar desktop e mobile: abrir/fechar menu, navegar, voltar pelo navegador e confirmar ausência de overflow e sobreposição.
- Verificar que OAuth, publicação, filas, upload, editor e dados persistidos continuam intactos.
- Conferir erros de build, runtime, console e requisições após as mudanças.
