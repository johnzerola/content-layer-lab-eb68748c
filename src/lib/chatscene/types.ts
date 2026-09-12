/**
 * Analogue ChatScene — documento único do projeto.
 *
 * Fonte de verdade de tudo que o usuário criou: participantes, mensagens, tema,
 * tempo e configuração de exportação. Nenhuma tela guarda cópia própria desse
 * estado. Camadas separadas por contrato:
 *
 *   CONTENT  participants/messages   (aqui)
 *   THEME    theme                   (./theme)
 *   TIMING   timing                  (./clock)
 *   RENDER   render                  (./renderer)
 */

export const CHATSCENE_PROJECT_MODE = "chatscene";
export const CHATSCENE_PROJECT_VERSION = 1;

export type ChatSceneAspect = "9:16" | "1:1" | "16:9";

export type MessageKind = "text" | "image" | "emoji" | "system" | "sticker" | "video";

/** Confirmação de entrega mostrada ao lado da hora, como em um app real. */
export type MessageStatus = "sent" | "delivered" | "read";

export type ChatKind = "direct" | "group";

export interface ChatParticipant {
  id: string;
  /** nome exibido no cabeçalho e acima das bolhas em conversa de grupo */
  name: string;
  /** o "eu" da história: bolha alinhada à direita */
  isSelf: boolean;
  /** cor de destaque do nome e do avatar (token hex) */
  color: string;
  /** URL pública do avatar; nunca base64 */
  avatarUrl?: string | null;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  kind: MessageKind;
  /** texto da mensagem, legenda da imagem ou aviso de sistema */
  text: string;
  /** URL pública da imagem quando kind === "image" */
  mediaUrl?: string | null;
  /** proporção da imagem (largura / altura), usada no layout */
  mediaAspect?: number | null;
  /** pausa extra antes desta mensagem, em milissegundos */
  delayMs?: number | null;
  /** tempo de "digitando…" antes desta mensagem; null usa o automático */
  typingMs?: number | null;
  /** id da mensagem citada (reservado para a próxima fase) */
  replyToId?: string | null;
  /** hora mostrada dentro da bolha; null usa o relógio automático da cena */
  time?: string | null;
  /** emoji de reação preso na base da bolha */
  reaction?: string | null;
}

export interface ChatSceneTiming {
  /** multiplicador global de velocidade: 0.5 = metade da velocidade */
  speed: number;
  /** pausa base entre mensagens (ms) */
  gapMs: number;
  /** tempo de leitura por caractere (ms) */
  msPerChar: number;
  /** leitura mínima e máxima por mensagem (ms) */
  minReadMs: number;
  maxReadMs: number;
  /** mostrar "digitando…" antes das mensagens de quem não é o "eu" */
  typing: boolean;
  /** duração automática do "digitando…" (ms) */
  typingMs: number;
  /** segundos parados no fim, para o laço não cortar a última mensagem */
  tailMs: number;
}

export interface ChatSceneRenderSettings {
  aspect: ChatSceneAspect;
  fps: number;
  /** altura alvo do arquivo exportado; a largura vem da proporção */
  height: number;
  /** mostrar as margens seguras das plataformas na prévia */
  safeZones: boolean;
}

export interface ChatSceneProject {
  id: string;
  version: number;
  title: string;
  themeId: string;
  /** variante do tema */
  dark: boolean;
  participants: ChatParticipant[];
  messages: ChatMessage[];
  timing: ChatSceneTiming;
  render: ChatSceneRenderSettings;
  /** conversa entre duas pessoas ou grupo com nome e foto próprios */
  chatKind?: ChatKind;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  /** hora inicial mostrada nas bolhas (HH:MM) */
  startClock?: string;
  /** mostrar os tiques de entregue/lido nas mensagens de quem escreve */
  receipts?: boolean;
}

export const DEFAULT_TIMING: ChatSceneTiming = {
  speed: 1,
  gapMs: 450,
  msPerChar: 42,
  minReadMs: 900,
  maxReadMs: 4200,
  typing: true,
  typingMs: 900,
  tailMs: 1400,
};

export const DEFAULT_RENDER: ChatSceneRenderSettings = {
  aspect: "9:16",
  fps: 30,
  height: 1920,
  safeZones: true,
};

export const ASPECT_RATIO: Record<ChatSceneAspect, number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "16:9": 16 / 9,
};

/** Dimensões do arquivo exportado, sempre pares (exigência dos codecs). */
export function renderSize(render: ChatSceneRenderSettings): { width: number; height: number } {
  const height = Math.max(2, Math.round(render.height / 2) * 2);
  const width = Math.max(2, Math.round((height * ASPECT_RATIO[render.aspect]) / 2) * 2);
  return { width, height };
}

let seq = 0;
export function chatSceneId(prefix: string): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${seq.toString(36)}`;
}

export function createParticipant(init: Partial<ChatParticipant> = {}): ChatParticipant {
  return {
    id: init.id ?? chatSceneId("p"),
    name: init.name ?? "Participante",
    isSelf: init.isSelf ?? false,
    color: init.color ?? "#7c5cff",
    avatarUrl: init.avatarUrl ?? null,
  };
}

export function createMessage(participantId: string, init: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: init.id ?? chatSceneId("m"),
    participantId,
    kind: init.kind ?? "text",
    text: init.text ?? "",
    mediaUrl: init.mediaUrl ?? null,
    mediaAspect: init.mediaAspect ?? null,
    delayMs: init.delayMs ?? null,
    typingMs: init.typingMs ?? null,
    replyToId: init.replyToId ?? null,
    time: init.time ?? null,
    reaction: init.reaction ?? null,
  };
}

/** Hora mostrada na bolha: a informada pelo usuário ou o relógio da cena. */
export function messageClock(project: ChatSceneProject, index: number, message: ChatMessage): string {
  if (message.time) return message.time;
  const [h, min] = (project.startClock ?? "21:14").split(":");
  const base = (Number(h) || 21) * 60 + (Number(min) || 14) + Math.floor(index / 3);
  const total = ((base % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Projeto novo já com dois participantes e uma conversa de exemplo curta. */
export function createChatSceneProject(init: Partial<ChatSceneProject> = {}): ChatSceneProject {
  const me = createParticipant({ name: "Você", isSelf: true, color: "#7c5cff" });
  const other = createParticipant({ name: "Ana", color: "#ff5c8a" });
  return {
    id: init.id ?? chatSceneId("cs"),
    version: CHATSCENE_PROJECT_VERSION,
    title: init.title ?? "Nova conversa",
    themeId: init.themeId ?? "zap",
    dark: init.dark ?? false,
    chatKind: init.chatKind ?? "direct",
    groupName: init.groupName ?? null,
    groupAvatarUrl: init.groupAvatarUrl ?? null,
    startClock: init.startClock ?? "21:14",
    receipts: init.receipts ?? true,
    participants: init.participants ?? [me, other],
    messages:
      init.messages ??
      [
        createMessage(other.id, { text: "Você não vai acreditar no que aconteceu hoje" }),
        createMessage(me.id, { text: "fala logo" }),
        createMessage(other.id, { text: "lembra daquele vídeo que eu postei ontem?" }),
        createMessage(me.id, { text: "o que tinha 200 views?" }),
        createMessage(other.id, { text: "1,2 milhão agora 😭" }),
      ],
    timing: { ...DEFAULT_TIMING, ...(init.timing ?? {}) },
    render: { ...DEFAULT_RENDER, ...(init.render ?? {}) },
  };
}

export function participantOf(project: ChatSceneProject, id: string): ChatParticipant {
  return (
    project.participants.find((p) => p.id === id) ??
    project.participants[0] ??
    createParticipant({ name: "Participante" })
  );
}

/** Migração defensiva de documentos salvos em versões anteriores. */
export function normalizeChatSceneProject(raw: Partial<ChatSceneProject> | null | undefined): ChatSceneProject {
  const base = createChatSceneProject();
  if (!raw) return base;
  const participants =
    Array.isArray(raw.participants) && raw.participants.length
      ? raw.participants.map((p) => createParticipant(p))
      : base.participants;
  const validIds = new Set(participants.map((p) => p.id));
  const fallbackId = participants[0]!.id;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map((m) =>
        createMessage(validIds.has(m.participantId) ? m.participantId : fallbackId, m),
      )
    : [];
  return {
    ...base,
    ...raw,
    id: raw.id ?? base.id,
    version: CHATSCENE_PROJECT_VERSION,
    participants,
    messages,
    timing: { ...DEFAULT_TIMING, ...(raw.timing ?? {}) },
    render: { ...DEFAULT_RENDER, ...(raw.render ?? {}) },
  };
}
