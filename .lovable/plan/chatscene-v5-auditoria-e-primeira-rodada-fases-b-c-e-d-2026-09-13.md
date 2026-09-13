# ChatScene V5 — Auditoria e primeira rodada (Fases B, C e D)

## 1. O que já existe

Módulo isolado, sem tocar em Cleaner, Editor de vídeo ou publicação:

- `src/lib/chatscene/` — 24 arquivos (~4.900 linhas): `types.ts` (documento), `timing.ts` (ritmo humano), `clock.ts` (relógio em quadros), `draw.ts` (desenho), `theme.ts`, `voice*.ts` (elenco de vozes), `assets.ts`, `media.ts`, `serialize.ts`, `project.service.ts`, `encode-frames.ts`, `rhythm.ts`, `sfx.ts`, `camera.ts`, `scroll-planner.ts`, `qa.ts`, `message-kinds.ts`, `__tests__/` (78 testes).
- `src/components/chatscene/` — 12 painéis: Studio, Preview, Timeline, Mensagens, Participantes, Tema, Vozes, Música, Marca, Layouts.
- Telas: `/chatscene` (estúdio) e `/chatscene/comparar` (comparação com referência).

## 2. Arquitetura encontrada (já alinhada à especificação)

- `ChatSceneProject` já é a única fonte de verdade; não existem listas paralelas de mensagens.
- O relógio é determinístico e puro: `timing.ts` → `clock.ts` → mesma tabela de quadros para prévia e exportação. Não há `setTimeout` espalhado.
- Prévia e render usam o mesmo desenho (`draw.ts`), então mesmo tempo = mesmo quadro.
- Já existem: conversas múltiplas com corte entre chats, layouts (inclusive Creator Split), fundo em vídeo/imagem/degradê, tipos de mensagem (texto, emoji, foto, figurinha, vídeo, voz, sistema, cartão), resposta citada, reação em emoji, elenco de vozes por personagem com cache e fila, autosave local + nuvem com versão de formato, mapa de ritmo por segundo e critérios de QA.

## 3. Divergências em relação à especificação V5

1. **Histórico inicial** — não existe `initial`: toda mensagem entra durante o vídeo.
2. **Entrega e leitura** — o tipo `MessageStatus` existe, mas nada no modelo nem no desenho usa; não há enviado/entregue/lido com tempo.
3. **Eventos de conversa** — só existem mensagens; não há eventos de ficar online, digitar/parar/voltar a digitar, ler, reagir num instante.
4. **Perfil de personagem** — participante é nome + cor + avatar + voz; falta personalidade de digitação (tamanho de frase, abreviação, emoji, velocidade, hesitação, quebra de mensagem).
5. **Separação de estados** — o estúdio concentra 21 estados locais em um arquivo de 1.625 linhas; seleção, reprodução e interface estão misturadas com o documento; não há desfazer/refazer formal.
6. **Rolagem** — `scroll-planner.ts` existe mas é mínimo e não considera altura real de mídia nem do indicador de digitação em todos os casos.
7. Fases posteriores (gerador de história, motor de gameplay, analisador de referência, editor avançado) ainda não existem — ficam para depois, como pedido.

## 4. Riscos

- Reorganizar tudo para `src/features/chatscene/` seria um movimento grande de arquivos com risco alto e zero ganho visível agora. Proposta: manter `src/lib/chatscene` + `src/components/chatscene` e criar subpastas por assunto conforme cada fase entra.
- `draw.ts` e o estúdio são os dois arquivos pesados: toda mudança precisa dos testes existentes passando (78 hoje).
- Mudança de formato do documento precisa de migração: projetos salvos devem continuar abrindo.

## 5. O que será implementado agora (Fases B + C + D)

**Fase B — modelo e estados**
- `CharacterProfile` embutido no participante: personalidade de digitação (tamanho de frase, abreviação, emoji, pontuação, velocidade, hesitação, chance de dividir mensagem), base emocional e estilo de reação.
- `ConversationEvent` derivado: online, digitando, parou de digitar, mensagem, entregue, lido, reação, voz — gerado pelo relógio, sem virar segunda lista editável.
- Separação de estados: documento (projeto), seleção, reprodução e interface em hooks próprios; reprodução a 30/60 fps deixa de tocar no documento.
- Desfazer/refazer com histórico das operações (adicionar, apagar, duplicar, editar, reordenar, trocar personagem, mudar tempo).
- Migração de formato (schemaVersion) mantendo projetos antigos abrindo.

**Fase C — fidelidade visual**
- Cabeçalho, papel de parede, bolhas, agrupamento por remetente (espaço menor entre mensagens do mesmo autor, rabinho só na última), nome do remetente no grupo, hora dentro da bolha.
- Marcas de enviado / entregue / lido animadas no tempo certo.
- Creator Split com proporções ajustáveis (chat 40/50/60%), tema próprio, sem marca de terceiros.

**Fase D — relógio da conversa**
- `getStateAt(tempo)` devolvendo mensagens visíveis, quem digita, estados de entrega, reação ativa, voz ativa, mídia ativa, rolagem e presença.
- Histórico inicial (`initial: true`): conversa já começa com mensagens na tela.
- Digitação humana com parar/pausar/voltar a digitar, derivada da personalidade.
- Rolagem automática suave considerando altura real de foto, voz e indicador de digitação.

## 6. Verificação antes de parar

Tipos, lint, testes (incluindo casos novos: 2/3/5/10 personagens, direto e grupo, histórico inicial, digitação cancelada, entregue/lido, mídia, 9:16 / 16:9 / 1:1, recarregar a página) e build; prévia sem erros; captura de tela do resultado; lista do que ficou pendente e o próximo passo.

## 7. Fora desta rodada

Gerador de história, humanizador, motor de gameplay, analisador de referência, editor avançado completo, GIF/figurinha vindos de biblioteca externa, publicação social, Remotion na nuvem. Cleaner IA, Editor V1/V2 e publicação continuam intocados.
