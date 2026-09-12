/**
 * ConversationClock — o tempo da conversa, convertido em quadros.
 *
 * O ritmo em milissegundos vem do ConversationTimingEngine (./timing). Aqui ele
 * vira uma tabela de quadros usada pela prévia e pela exportação, então o vídeo
 * final é igual ao que o usuário viu. Nada de setTimeout espalhado pela tela.
 */
import { computeMessageTimings, totalDurationMs, readingMs, typingMsOf } from "./timing";
import type { MessageTiming } from "./timing";
import type { ChatMessage, ChatSceneProject } from "./types";

export { typingMsOf } from "./timing";

export interface ClockEntry {
  messageId: string;
  /** quadro em que a bolha começa a aparecer */
  appearFrame: number;
  /** quadro em que o "digitando…" começa; igual a appearFrame quando não há */
  typingFrame: number;
  /** quadros que a animação de entrada dura */
  entranceFrames: number;
  /** quadro em que a mensagem já está totalmente lida (fim da leitura) */
  endFrame: number;
  /** tempos em milissegundos, para a interface mostrar */
  timing: MessageTiming;
}

export interface ConversationPlan {
  fps: number;
  totalFrames: number;
  durationMs: number;
  entries: ClockEntry[];
  byId: Record<string, ClockEntry>;
}

/** Tempo de leitura estimado de uma mensagem, em milissegundos. */
export function readMs(message: ChatMessage, project: ChatSceneProject): number {
  return readingMs(message, project);
}

/** Constrói a tabela de tempo do projeto inteiro. */
export function buildPlan(project: ChatSceneProject): ConversationPlan {
  const fps = Math.max(1, Math.round(project.render.fps));
  const speed = project.timing.speed > 0 ? project.timing.speed : 1;
  const toFrame = (ms: number) => Math.round((ms / speed / 1000) * fps);

  const timings = computeMessageTimings(project);
  const entries: ClockEntry[] = timings.map((t) => ({
    messageId: t.messageId,
    typingFrame: toFrame(t.typingStartMs),
    appearFrame: toFrame(t.appearMs),
    entranceFrames: Math.max(1, toFrame(t.entranceMs)),
    endFrame: toFrame(t.endMs),
    timing: t,
  }));

  const durationMs = totalDurationMs(project, timings);
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

/** Índice da mensagem que está no ar neste quadro (para a mini timeline). */
export function activeIndexAt(plan: ConversationPlan, frame: number): number {
  let index = -1;
  plan.entries.forEach((e, i) => {
    if (frame >= e.appearFrame) index = i;
  });
  return index;
}

export type { MessageTiming };
export { typingMsOf as typingDurationOf };
