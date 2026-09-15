# ChatScene — auditoria da base

15/09/2026. Base auditada: `60d82036b15ce48ed57e730a51be1311c716867d`.
Escopo: handoff V1, seis prints locais e extensão solicitada de histórias do Reddit.

| Área / fonte de verdade | Decisão | Evidência / ação |
|---|---|---|
| `src/lib/chatscene/types.ts` | KEEP / extensão aditiva | Documento único v2, `participantId` é identidade; `isSelf` é apresentação. Threads já suportam troca de contato. Não criar outro modelo de mensagens. |
| `serialize.ts`, `project.service.ts`, `history.ts`, `useProjectHistory.ts` | KEEP | JSON versionado, rascunho local, persistência remota e undo existentes. Campos opcionais podem sobreviver pelo normalizador com spreads. |
| `ChatSceneStudio.tsx` | KEEP | Documento, frame, seleção, atividade e estado de painéis separados. Já calcula plano e possui comandos de vozes/roteiro. |
| `clock.ts`, `timing.ts` | REFACTOR aditivo | Plano determinístico existente. Timing atual soma entrada + max(leitura, áudio) + pausas; não reproduz fala rápida diretamente. Preservar caminho legado. |
| `draw.ts:layoutMessages` | KEEP / adaptar | Já mede texto Canvas, nomes, hora, respostas, imagens, stickers, voz e reações. Reutilizar como estimador real; não duplicar cálculo aproximado de caracteres. |
| `draw.ts:threadFrame`, `autoPanelHeight`, `scroll-planner.ts` | REFACTOR gradual | Filtra por thread e cresce painel; histórico continua e faz scroll. Ainda não há partição de páginas por altura. |
| `renderer.ts`, `ChatScenePreview.tsx`, `RenderStage.tsx`, `encode-frames.ts` | KEEP | Prévia e exportação já convergem no Canvas. Fontes e proporções de mídias precisam estar resolvidas antes de certificar equivalência entre ambientes. |
| `events.ts`, `media.ts`, `message-kinds.ts`, `sfx.ts` | KEEP | Eventos e mídias existem. GIF é recurso de mídia, não necessariamente um novo tipo de mensagem. Som tem agenda própria derivada do plano. |
| `voice.ts`, `voice-resolution.ts`, `voice-cast.ts`, `voice-providers.ts`, `voice.functions.ts` | KEEP | Elenco reutilizável, direção por mensagem, providers e durações existentes. Não integrar novos providers nesta rodada. |
| `audio-mix.ts` | REVIEW antes de promover novo ritmo | Agenda usa appearFrame; pitchRate altera duração/reprodução. Speed global visual pode divergir da velocidade do áudio. V3 não deve herdar esse risco silenciosamente. |
| `story.ts`, `story.functions.ts`, `import-script.ts`, `StoryPanel.tsx` | KEEP / extensão | Criação de conversa e importador existentes; falta entrada dedicada para narrativa de post, com atribuição e revisão. |
| `ThemePanel`, `CreatorLayouts`, `ParticipantsPanel`, `MessagesPanel`, `VoicePanel`, `ChatSceneTimeline` | KEEP | Não reescrever editor/rotas para aproximar a referência. |
| `__tests__/chatscene-*` | KEEP / ampliar | Testes cobrem relógio, timing, mídia, threads, vozes, roteiro, projeto e eventos. Precisamos cenários de paginação, recalculo por áudio e importação de narrativa. |

Menor fatia correta: compilador V3 **experimental**, perfil opcional e gerenciador de páginas puro, usando a medição já disponível no desenho; integração visual deve consumir essa mesma partição, sem segundo documento. A criação Reddit usa o documento existente e não depende de instalar Remotion ou de copiar outro editor.

Não há motivo para DELETE agora. StoryBeat completo, providers de voz, migração destrutiva, renderer substituto e automação de publicação permanecem fora desta fatia.

Riscos confirmados por leitura, não por playback: normalização permissiva de dados; clipping de palavras muito longas; proporção carregada pode sobrepor proporção declarada; scroll/autoheight não equivalem a reset. Esses itens precisam de testes focados antes de qualquer promoção do preset.
