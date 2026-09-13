/**
 * Ritmo por segundo da cena: para cada segundo da conversa, qual chat está no
 * ar, qual fundo aparece e quais mensagens entram. Só leitura — deriva tudo do
 * ChatSceneProject e do plano do relógio, sem criar estado paralelo.
 */
import type { ConversationPlan } from "./clock";
import { typingAt } from "./clock";
import { threadFrame } from "./draw";
import type { ChatMessage, ChatSceneBackground, ChatSceneProject } from "./types";
import { participantOf } from "./types";

export interface RhythmEvent {
  id: string;
  author: string;
  kind: ChatMessage["kind"];
  text: string;
}

export interface RhythmRow {
  second: number;
  /** rótulo do tempo, ex.: 0:07 */
  label: string;
  threadName: string;
  background: string;
  events: RhythmEvent[];
  /** quem está digitando nesse segundo, se alguém */
  typing: string | null;
}

export function backgroundLabel(bg: ChatSceneBackground): string {
  switch (bg.kind) {
    case "video":
      return `Vídeo — ${fileLabel(bg.videoUrl)}`;
    case "image":
      return `Imagem — ${fileLabel(bg.imageUrl)}`;
    case "gradient":
      return "Degradê";
    case "solid":
      return "Cor sólida";
    default:
      return "Do tema";
  }
}

function fileLabel(url?: string | null): string {
  if (!url) return "sem arquivo";
  const name = url.split("/").pop() ?? url;
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ");
}

export function timeLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function rhythmBySecond(project: ChatSceneProject, plan: ConversationPlan): RhythmRow[] {
  const fps = plan.fps || 30;
  const total = Math.max(1, Math.ceil(plan.totalFrames / fps));
  const rows: RhythmRow[] = [];
  for (let second = 0; second < total; second += 1) {
    const from = second * fps;
    const to = from + fps;
    const view = threadFrame(project, plan, Math.min(from, plan.totalFrames - 1));
    const typingMsg = typingAt(project, plan, Math.min(from, plan.totalFrames - 1));
    const events: RhythmEvent[] = project.messages
      .filter((msg) => {
        const appear = plan.byId[msg.id]?.appearFrame;
        return appear !== undefined && appear >= from && appear < to;
      })
      .map((msg) => ({
        id: msg.id,
        author: participantOf(project, msg.participantId).name,
        kind: msg.kind,
        text: msg.text ?? "",
      }));
    rows.push({
      second,
      label: timeLabel(second),
      threadName: view.thread.name,
      background: backgroundLabel(project.background),
      events,
      typing: typingMsg ? participantOf(project, typingMsg.participantId).name : null,
    });
  }
  return rows;
}

/** Mensagens por minuto — serve para comparar a cadência com o vídeo de referência. */
export function messagesPerMinute(project: ChatSceneProject, plan: ConversationPlan): number {
  const seconds = plan.totalFrames / (plan.fps || 30);
  if (seconds <= 0) return 0;
  return Math.round((project.messages.length / seconds) * 60 * 10) / 10;
}
