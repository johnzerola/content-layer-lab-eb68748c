/** Opt-in compiler pilot. Legacy buildPlan remains the production clock until parity QA. */
import { effectiveVoice } from "./voice-resolution";
import { threadIdOf, type ChatMessage, type ChatSceneProject } from "./types";
import { FAST_GAMEPLAY_CHAT, validateStyleProfile, type ChatSceneStyleProfile } from "./style-profile";
import { buildConversationPages, type MessageLayoutEstimator } from "./page-manager";

export interface ClockV3Entry {
  messageId: string;
  sessionId: string;
  appearMs: number;
  speechStartMs: number;
  speechEndMs: number;
  endMs: number;
  durationSource: "MEASURED_AUDIO" | "ESTIMATED_TEXT";
  pageId: string;
}

function nonNegative(value: number | null | undefined, fallback = 0): number {
  if (value == null) return fallback;
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid timing value");
  return value;
}

export function estimateSpeechDuration(message: ChatMessage, project: ChatSceneProject, style: ChatSceneStyleProfile): number {
  const voice = effectiveVoice(project, message);
  const rate = (voice?.profile.speed ?? 1) * (voice?.direction.speedMultiplier ?? 1);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid speaking rate");
  const text = message.text.trim();
  const words = text ? text.split(/\s+/u).length : 0;
  const punctuation = (text.match(/[,;:.!?…]/gu) ?? []).length * 35;
  // Estimate only. Decoded voiceMs bypasses rate and punctuation completely.
  return Math.max(500, Math.round((Math.max(words * 60000 / style.wordsPerMinute,
    [...text].length * 1000 / style.charsPerSecond) + punctuation) / rate));
}

export class ConversationClockV3 {
  private readonly entries: ClockV3Entry[];
  private readonly pages: ReturnType<typeof buildConversationPages>;
  private readonly pageStartIndices = new Map<string, number>();
  readonly durationMs: number;

  constructor(project: ChatSceneProject, options: {
    measure: MessageLayoutEstimator;
    maxContentHeight: number;
    style?: ChatSceneStyleProfile;
    /** Beat/manual boundaries reference IDs, so regenerated audio cannot stale timestamps. */
    resetBeforeMessageIds?: readonly string[];
  }) {
    const style = { ...(options.style ?? FAST_GAMEPLAY_CHAT) };
    validateStyleProfile(style);
    if (project.timing.speed !== 1) throw new Error("V3 requires speed 1 until audio time-stretch is validated");
    if (project.messages.some((m) => m.initial)) throw new Error("V3 initial-history migration is not validated yet");
    const ids = new Set<string>();
    let cursor = 0;
    this.entries = project.messages.map((message) => {
      if (!message.id || ids.has(message.id)) throw new Error("Duplicate or empty message ID");
      ids.add(message.id);
      if (!project.participants.some((p) => p.id === message.participantId)) throw new Error("Unknown sender");
      const duration = message.voiceMs == null ? estimateSpeechDuration(message, project, style) : nonNegative(message.voiceMs);
      if (duration <= 0) throw new Error("Audio duration must be positive");
      const appearMs = cursor + nonNegative(message.delayMs) + nonNegative(message.voiceDirection?.pauseBeforeMs);
      const speechStartMs = appearMs + style.bubbleLeadMs;
      const speechEndMs = speechStartMs + duration;
      cursor = speechEndMs + nonNegative(message.pauseAfterMs, style.postSpeechGapMs) + nonNegative(message.voiceDirection?.pauseAfterMs);
      return { messageId: message.id, sessionId: threadIdOf(project, message), appearMs, speechStartMs,
        speechEndMs, endMs: cursor, durationSource: message.voiceMs == null ? "ESTIMATED_TEXT" : "MEASURED_AUDIO", pageId: "" };
    });
    const resets = new Set(options.resetBeforeMessageIds ?? []);
    for (const id of resets) if (!ids.has(id)) throw new Error("Reset references unknown message");
    this.pages = buildConversationPages(this.entries.map((entry, i) => ({
      message: project.messages[i]!, sessionId: entry.sessionId, startMs: entry.appearMs,
      forceReset: resets.has(entry.messageId) || project.messages[i]!.kind === "card",
    })), options.measure, options.maxContentHeight, style.maxMessagesPerPage);
    const pageIds = new Map(this.pages.flatMap((page) => page.messageIds.map((id) => [id, page.id] as const)));
    this.entries.forEach((entry, index) => {
      entry.pageId = pageIds.get(entry.messageId)!;
      if (!this.pageStartIndices.has(entry.pageId)) this.pageStartIndices.set(entry.pageId, index);
    });
    this.durationMs = this.entries.length ? cursor + style.tailMs : 0;
  }

  inspect() {
    return structuredClone({ entries: this.entries, pages: this.pages, durationMs: this.durationMs });
  }

  getStateAt(timeMs: number) {
    if (!Number.isFinite(timeMs)) throw new Error("Invalid playback time");
    const t = Math.max(0, Math.min(timeMs, this.durationMs));
    // Binary search makes repeated seeking independent of playback history.
    let lo = 0, hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.entries[mid]!.appearMs <= t) lo = mid + 1;
      else hi = mid;
    }
    const active = this.entries[lo - 1];
    const visible = active ? this.entries.slice(this.pageStartIndices.get(active.pageId)!, lo) : [];
    const audio = active?.durationSource === "MEASURED_AUDIO" && t >= active.speechStartMs && t < active.speechEndMs ? active : null;
    return {
      timeMs: t, pageId: active?.pageId ?? null, sessionId: active?.sessionId ?? null,
      visibleMessageIds: visible.map((entry) => entry.messageId), activeMessageId: active?.messageId ?? null,
      activeAudio: audio ? { messageId: audio.messageId, offsetMs: t - audio.speechStartMs } : null,
      typingMessageId: null, chatOffset: 0, pageTransition: "INSTANT" as const, backgroundTimeMs: t,
    };
  }
}
