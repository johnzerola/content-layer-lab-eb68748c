/**
 * ConversationClock — o tempo da conversa, calculado uma vez.
 *
 * Função pura: mesmo documento, mesma tabela de tempo. Prévia e exportação leem
 * exatamente a mesma tabela, então o vídeo exportado é igual ao que o usuário
 * viu. Nada de setTimeout espalhado pela interface.
 */
import { participantOf, type ChatMessage, type ChatSceneProject } from "./types";

export interface ClockEntry {
  messageId: string;
  /** quadro em que a bolha começa a aparecer */
  appearFrame: number;
  /** quadro em que o "digitando…" começa; igual a appearFrame quando não há */
  typingFrame: number;
  /** quadro em que a mensagem já está totalmente lida (fim da leitura) */
  endFrame: number;
}

export interface ConversationPlan {
  fps: number;
  totalFrames: number;
  durationMs: number;
  entries: ClockEntry[];
  byId: Record<string, ClockEntry>;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Tempo de leitura estimado de uma mensagem, em milissegundos. */
export function readMs(message: ChatMessage, timing: ChatSceneProject["timing"]): number {
  const chars = message.kind === "image" ? Math.max(24, message.text.length) : message.text.length;
  return clamp(chars * timing.msPerChar, timing.minReadMs, timing.maxReadMs);
}

/** Duração do "digitando…" desta mensagem, em milissegundos (0 = sem). */
export function typingMsOf(
  message: ChatMessage,
  project: ChatSceneProject,
): number {
  if (typeof message.typingMs === "number") return Math.max(0, message.typingMs);
  if (!project.timing.typing) return 0;
  if (message.kind === "system") return 0;
  const author = participantOf(project, message.participantId);
  // quem escreve a história não "digita" na tela: a bolha dele entra direto
  return author.isSelf ? 0 : project.timing.typingMs;
}

/** Constrói a tabela de tempo do projeto inteiro. */
export function buildPlan(project: ChatSceneProject): ConversationPlan {
  const fps = Math.max(1, Math.round(project.render.fps));
  const speed = project.timing.speed > 0 ? project.timing.speed : 1;
  const toFrame = (ms: number) => Math.round((ms / speed / 1000) * fps);

  const entries: ClockEntry[] = [];
  let cursorMs = 0;

  for (const message of project.messages) {
    cursorMs += Math.max(0, message.delayMs ?? 0);
    const typing = typingMsOf(message, project);
    const typingFrame = toFrame(cursorMs);
    cursorMs += typing;
    const appearFrame = toFrame(cursorMs);
    cursorMs += readMs(message, project.timing) + project.timing.gapMs;
    entries.push({
      messageId: message.id,
      appearFrame,
      typingFrame,
      endFrame: toFrame(cursorMs),
    });
  }

  const durationMs = cursorMs + project.timing.tailMs;
  const totalFrames = Math.max(1, toFrame(durationMs));
  const byId: Record<string, ClockEntry> = {};
  for (const e of entries) byId[e.messageId] = e;

  return { fps, totalFrames, durationMs: durationMs / speed, entries, byId };
}

/** Mensagens já visíveis em um quadro, na ordem do roteiro. */
export function visibleAt(project: ChatSceneProject, plan: ConversationPlan, frame: number): ChatMessage[] {
  return project.messages.filter((m) => {
    const entry = plan.byId[m.id];
    return entry ? frame >= entry.appearFrame : false;
  });
}

/** Mensagem cujo "digitando…" está na tela neste quadro, se houver. */
export function typingAt(
  project: ChatSceneProject,
  plan: ConversationPlan,
  frame: number,
): ChatMessage | null {
  for (const m of project.messages) {
    const entry = plan.byId[m.id];
    if (!entry) continue;
    if (entry.typingFrame < entry.appearFrame && frame >= entry.typingFrame && frame < entry.appearFrame) {
      return m;
    }
  }
  return null;
}
