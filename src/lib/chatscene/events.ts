/**
 * ConversationEvent — a conversa vista como uma linha de eventos no tempo.
 *
 * Tudo aqui é derivado do ChatSceneProject + ConversationPlan. Não há estado
 * próprio: mesmo projeto + mesmo instante = mesmo resultado, na prévia e no
 * vídeo final.
 */
import { typingAt, visibleAt, type ConversationPlan } from "./clock";
import { threadIdOf, type ChatMessage, type ChatSceneProject, type MessageStatus } from "./types";

export type ConversationEventType =
  | "MESSAGE"
  | "TYPING_START"
  | "TYPING_STOP"
  | "PAUSE"
  | "READ"
  | "REACTION"
  | "VOICE_START"
  | "VOICE_END"
  | "MEDIA"
  | "ONLINE";

export interface ConversationEvent {
  type: ConversationEventType;
  frame: number;
  messageId: string;
  participantId: string;
  threadId: string;
}

/** Quadros até a confirmação de entrega e de leitura das mensagens enviadas. */
const DELIVERED_MS = 520;
const READ_MS = 2200;

function msToFrames(project: ChatSceneProject, plan: ConversationPlan, ms: number): number {
  const speed = project.timing.speed > 0 ? project.timing.speed : 1;
  return Math.round((ms / speed / 1000) * plan.fps);
}

/** Linha de eventos completa da cena, em ordem de tempo. */
export function conversationEvents(project: ChatSceneProject, plan: ConversationPlan): ConversationEvent[] {
  const events: ConversationEvent[] = [];
  project.messages.forEach((message) => {
    const entry = plan.byId[message.id];
    if (!entry) return;
    const base = {
      messageId: message.id,
      participantId: message.participantId,
      threadId: threadIdOf(project, message),
    };
    if (entry.typingFrame < entry.appearFrame) {
      events.push({ ...base, type: "TYPING_START", frame: entry.typingFrame });
      if (entry.timing.typingGapMs > 0) {
        const gapStart = entry.typingFrame + msToFrames(project, plan, entry.timing.typingGapStartMs);
        events.push({ ...base, type: "TYPING_STOP", frame: gapStart });
        events.push({
          ...base,
          type: "TYPING_START",
          frame: gapStart + msToFrames(project, plan, entry.timing.typingGapMs),
        });
      }
      events.push({ ...base, type: "TYPING_STOP", frame: entry.appearFrame });
    }
    events.push({ ...base, type: "MESSAGE", frame: entry.appearFrame });
    if (message.kind === "voice") {
      events.push({ ...base, type: "VOICE_START", frame: entry.appearFrame });
      events.push({ ...base, type: "VOICE_END", frame: entry.endFrame });
    }
    if (message.kind === "image" || message.kind === "video" || message.kind === "sticker") {
      events.push({ ...base, type: "MEDIA", frame: entry.appearFrame });
    }
    if (message.reaction) {
      events.push({ ...base, type: "REACTION", frame: entry.appearFrame + msToFrames(project, plan, 700) });
    }
    events.push({ ...base, type: "READ", frame: entry.appearFrame + msToFrames(project, plan, READ_MS) });
    if (entry.timing.pauseAfterMs > 400) {
      events.push({ ...base, type: "PAUSE", frame: entry.endFrame });
    }
  });
  return events.sort((a, b) => a.frame - b.frame);
}

/** Estado de entrega de uma mensagem enviada por "mim" neste quadro. */
export function deliveryStateAt(
  project: ChatSceneProject,
  plan: ConversationPlan,
  message: ChatMessage,
  frame: number,
): MessageStatus {
  const entry = plan.byId[message.id];
  if (!entry) return "sent";
  if (message.initial) return "read";
  const delivered = entry.appearFrame + msToFrames(project, plan, DELIVERED_MS);
  // a leitura chega quando o outro responde, ou depois de um tempo curto
  const next = project.messages.find(
    (m) =>
      m.participantId !== message.participantId &&
      threadIdOf(project, m) === threadIdOf(project, message) &&
      (plan.byId[m.id]?.typingFrame ?? Infinity) > entry.appearFrame,
  );
  const byAnswer = next ? (plan.byId[next.id]?.typingFrame ?? Infinity) : Infinity;
  const read = Math.min(byAnswer, entry.appearFrame + msToFrames(project, plan, READ_MS));
  if (frame >= read) return "read";
  if (frame >= delivered) return "delivered";
  return "sent";
}

export interface ConversationState {
  frame: number;
  timeMs: number;
  threadId: string;
  visibleMessages: ChatMessage[];
  activeTyping: { participantId: string; threadId: string } | null;
  deliveryStates: Record<string, MessageStatus>;
  activeReaction: ChatMessage | null;
  activeVoice: ChatMessage | null;
  activeMedia: ChatMessage | null;
  onlineParticipantIds: string[];
}

/** Estado completo da conversa em um instante — a leitura única do relógio. */
export function getStateAt(
  project: ChatSceneProject,
  plan: ConversationPlan,
  frame: number,
): ConversationState {
  const visible = visibleAt(project, plan, frame);
  const typing = typingAt(project, plan, frame);
  const last = visible[visible.length - 1] ?? null;
  const threadId = typing
    ? threadIdOf(project, typing)
    : last
      ? threadIdOf(project, last)
      : threadIdOf(project, project.messages[0] ?? ({ id: "", participantId: "" } as ChatMessage));

  const deliveryStates: Record<string, MessageStatus> = {};
  for (const message of visible) {
    deliveryStates[message.id] = deliveryStateAt(project, plan, message, frame);
  }

  const inThread = visible.filter((m) => threadIdOf(project, m) === threadId);
  const online = new Set<string>();
  if (typing) online.add(typing.participantId);
  for (const m of inThread.slice(-4)) online.add(m.participantId);

  return {
    frame,
    timeMs: (frame / plan.fps) * 1000,
    threadId,
    visibleMessages: visible,
    activeTyping: typing ? { participantId: typing.participantId, threadId: threadIdOf(project, typing) } : null,
    deliveryStates,
    activeReaction: [...inThread].reverse().find((m) => !!m.reaction) ?? null,
    activeVoice:
      [...inThread]
        .reverse()
        .find((m) => m.kind === "voice" && frame < (plan.byId[m.id]?.endFrame ?? 0)) ?? null,
    activeMedia:
      [...inThread].reverse().find((m) => m.kind === "image" || m.kind === "video" || m.kind === "sticker") ??
      null,
    onlineParticipantIds: [...online],
  };
}
