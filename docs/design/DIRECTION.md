# Direção de produto e interface — VaiViral

Esta é a orientação para próximas alterações; não significa que todas as telas já
foram redesenhadas ou validadas. A prioridade é uma ferramenta de edição clara,
com personalidade própria e menos aparência de template genérico.

## Base existente

O projeto usa React, TanStack, Tailwind e componentes Radix. Os tokens estão em
`src/styles.css`: base escura, acento violeta, Figtree para leitura, Outfit para
títulos, Instrument Serif para usos editoriais e JetBrains Mono para dados técnicos.
Preservar essa base por padrão; introduzir mudanças coerentes nos tokens em vez de
cores, sombras e fontes arbitrárias em cada componente.

## Experiência desejada

- **Importação:** arquivos e listas de links fáceis de descobrir, progresso por item,
  erros acionáveis e retomada sem reenviar o que já funcionou.
- **Editor:** vídeo como foco, timeline legível, agulha e cortes precisos, controles
  próximos do objeto selecionado e prévias de filtros, estilos e transições.
- **CleanerIA:** modo automático/manual compreensível, máscaras visíveis e editáveis,
  comparação antes/depois sincronizada e teste curto antes do processamento completo.
- **Áudio:** voz e música distinguíveis, pré-escuta e volume por trilha; explicar
  processamento e possíveis resíduos sem prometer separação perfeita.
- **Jobs e resultados:** separar espera, processamento e entrega; mostrar falhas reais,
  permitir cancelamento e não confundir sucesso técnico com qualidade visual aprovada.

Estas prioridades orientam tarefas futuras, não autorizam implementá-las todas em
uma solicitação pequena. Vmake é uma referência de clareza de operação, não uma
especificação conhecida do seu motor ou autorização para copiar sua marca.

## Linguagem visual e interação

Hierarquia por escala, espaçamento e contraste. Acentos destacam seleção e ação
principal; não decorar cada painel. Reduzir caixas dentro de caixas, rótulos técnicos
desnecessários e ações concorrentes. Uma ação principal por etapa, mantendo ações
secundárias descobríveis. Configurações avançadas podem ser recolhíveis.

Usar os tempos e curvas de animação existentes. Transições curtas de estado,
expansão de painéis e feedback de seleção são úteis; partículas, brilho permanente,
animações de fundo e efeitos pesados não são padrão para o editor. Respeitar
`prefers-reduced-motion`, navegação por teclado e foco visível. Verificar contraste
e evitar que texto pequeno ou cinza muito apagado prejudique controles essenciais.

## Critério de entrega

Conferir a tela e o fluxo alterados em desktop e viewport estreito. Exercitar estados
vazio, carregando e erro quando pertinentes; conferir teclado, overflow e console.
Registrar evidência local sem dados sensíveis. Descrever separadamente o que foi
testado, o que foi apenas inspecionado e o que ainda depende de serviço externo.
Não chamar uma alteração de “100% funcional” sem evidência correspondente.
