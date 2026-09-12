# Analogue ChatScene — Fundação (Skills, Conhecimento, Documentação)

Objetivo desta fase: preparar a base de trabalho do módulo ChatScene. Nada do
aplicativo, do Cleaner, do Editor V1 ou do Editor V2 é alterado.

## O que já existe (auditoria feita)

- Pacote oficial Remotion já presente no projeto, incluindo boas práticas,
  criação, marcação, estúdio, render, legendas, interatividade, multimídia,
  SaaS e documentação. **Não será recriado** — apenas ativado como conjunto.
- 14 competências de produto/design/engenharia já ativas (direção de produto,
  UX de editor, fluxos, interação, design system, frontend, padrões visuais,
  revisão visual, acessibilidade, desempenho, pesquisa, React, qualidade).
- 6 competências extras de UX/IA/acessibilidade presentes como rascunho.
- Competência de FFmpeg presente.

## Matriz de decisão das competências

| Responsabilidade | Decisão |
| --- | --- |
| Remotion (10 skills oficiais) | IMPORTED — ativar o pacote existente |
| UX geral, acessibilidade, QA visual, performance, React | EXISTING — reutilizar |
| chatstory-product-architect | CREATE |
| conversation-ux-designer | CREATE |
| message-animation-engineer | CREATE |
| conversation-timing-engineer | CREATE |
| media-message-engineer | CREATE |
| voice-casting-engineer | CREATE |
| short-form-video-designer | CREATE |
| chat-theme-designer | CREATE |
| chatstory-render-engineer | CREATE |
| chatstory-visual-qa | CREATE (chama a revisão visual existente, não duplica) |
| asset-license-gate | CREATE |

Cada nova competência segue o padrão pedido: nome, descrição curta, quando usar,
quando não usar, contexto necessário, ferramentas, procedimento, saída, portões
de qualidade, modos de falha e escalonamento. Descrições curtas para não entrar
em todo pedido.

## Ferramentas externas

- **Context7**: não existe conector nem servidor disponível neste ambiente.
  Registrado como NOT_AVAILABLE; a documentação externa vem da busca web e da
  competência de documentação do Remotion. Se você instalar o aplicativo de
  desktop, dá para reavaliar.
- **Playwright**: já disponível por linha de comando aqui. Usado sob demanda
  para testes de tela, teclado, arraste e erros de console. Nenhum servidor
  pesado permanece ligado.
- **Figma**: sem conexão ativa; exige o aplicativo de desktop. Não bloqueia o
  ChatScene.

## Matriz de repositórios (estudo, sem instalar nada agora)

| Projeto | Decisão | Motivo |
| --- | --- | --- |
| Remotion | USE_AS_DEPENDENCY (fase futura) | renderizador candidato |
| ChatScope chat-ui-kit | STUDY_ONLY | visual próprio é estratégico |
| Motion Canvas | REJECT | conflita com o renderizador escolhido |
| Emoji Mart | USE_AS_DEPENDENCY | seletor de emoji maduro |
| Lottie React | FUTURE | figurinhas animadas |
| Kokoro | FUTURE | voz, depende de licença e infraestrutura |
| VoxCPM | STUDY_ONLY | licença e custo a validar |

Licenças confirmadas antes de qualquer instalação.

## Conhecimento do projeto

Registro das constantes do ChatScene: projeto como fonte única de verdade,
lista de participantes, tipos de mensagem iniciais, separação entre conteúdo,
tema, tempo e renderização, módulo independente, renderizador abstraído e
bloqueio de material sem licença conhecida.

## Documentos gerados

Em `docs/chatscene/`:

- `CHATSCENE_SKILL_MATRIX.md`
- `CHATSCENE_MCP_MATRIX.md`
- `CHATSCENE_REPOSITORY_MATRIX.md`
- `CHATSCENE_KNOWLEDGE.md`
- `CHATSCENE_LICENSE_MATRIX.md`

## Fora do escopo agora

Nenhuma tela, rota, tabela ou recurso do produto é construído nesta fase.
A implementação da Fase 0/1 vem depois da sua aprovação desta fundação.
