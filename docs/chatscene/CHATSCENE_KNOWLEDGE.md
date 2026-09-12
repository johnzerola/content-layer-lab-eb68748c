# ChatScene — Project Knowledge (constantes)

Apenas constantes. Decisões de fase e tarefas ficam no roadmap.

## Identidade

Analogue ChatScene é um **Conversation Story Video Creator**: transforma uma
conversa em vídeo curto vertical.

## Fonte de verdade

`ChatSceneProject` é a fonte única de verdade. Script, Preview, Timeline e
Renderer leem dele e escrevem através da sua camada de mutação. Nenhum estado
paralelo.

Campos raiz: `participants[]`, `messages[]`, `media`, `theme`, `voices`,
`timing`, `render`.

## Participantes

Sempre `participants[]`. Nunca `user` / `otherUser`. Grupo é o caso normal,
não uma exceção.

## Tipos de mensagem iniciais

`text`, `audio`, `image`, `video`, `gif`, `sticker`, `emoji`, `reaction`,
`reply`, `system`, `typing`.

## Separação obrigatória

- **CONTENT** — o que a mensagem diz.
- **THEME** — como aparece (apresentação apenas).
- **TIMING** — quando aparece (`ConversationClock`, determinístico).
- **RENDER** — como vira frames (`ConversationRenderer`).

Nenhuma camada invade a outra.

## Renderizador

`ConversationRenderer` é abstrato. `RemotionConversationRenderer` é a primeira
implementação candidata. Tipos do Remotion não entram em `ChatSceneProject`.

## Voz

`VoiceProfile` separa identidade, estilo e provedor. Só características
genéricas. Clonagem de voz de pessoa real exige autorização — sem ela, bloqueado.

## Limites do módulo

- ChatScene é módulo independente.
- Cleaner IA não é alterado.
- Editor V1 não é alterado.
- Editor V2 só é integrado em fase futura, por adaptador, atrás de flag.

## Assets

Asset sem licença conhecida é bloqueado. Seis campos obrigatórios: source,
license, commercialUse, attribution, author, version.

## Formato

9:16 é o formato principal; 1:1 e 16:9 são derivados. Safe zones: topo ~12%,
base ~18%.
