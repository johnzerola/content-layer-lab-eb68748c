import { DEFAULT_TIMING, type ChatSceneProject, type ChatSceneTimingMode } from "./types";

export interface ConversationTimingPreset {
  id: ChatSceneTimingMode;
  label: string;
  description: string;
}

export const CONVERSATION_TIMING_PRESETS: ConversationTimingPreset[] = [
  {
    id: "standard",
    label: "Padrão",
    description: "Ritmo livre, sem duração mínima.",
  },
  {
    id: "dynamic-fast",
    label: "Din\u00e2mico \u00b7 refer\u00eancia",
    description: "Texto sem voz segue ~280 palavras/min; com voz, respeita a dura\u00e7\u00e3o real para preservar o tom.",
  },
  {
    id: "long-2m",
    label: "Conversa longa · 2 min+",
    description: "Mantém as 46 falas e garante pelo menos 2 minutos no vídeo final.",
  },
];

/** Aplica somente o ritmo; não remove falas, áudio, personagens ou mídia. */
export function applyConversationTimingPreset(
  project: ChatSceneProject,
  mode: ChatSceneTimingMode,
): ChatSceneProject {
  if (mode === "dynamic-fast") {
    const { minimumDurationMs: _minimumDurationMs, ...existingTiming } = project.timing;
    return {
      ...project,
      timing: {
        ...DEFAULT_TIMING,
        ...existingTiming,
        mode,
        speed: 1,
        audioDriven: true,
        msPerWord: 214,
        msPerChar: 24,
        minReadMs: 620,
        maxReadMs: 2_800,
        typing: false,
        humanTyping: false,
        typingMs: 0,
        gapMs: 0,
        senderSwitchMs: 0,
        threadSwitchMs: 220,
        tailMs: 250,
      },
    };
  }

  if (mode === "long-2m") {
    return {
      ...project,
      timing: {
        ...project.timing,
        mode,
        minimumDurationMs: 120_000,
        speed: 1,
        audioDriven: true,
        gapMs: 260,
        senderSwitchMs: 180,
        threadSwitchMs: 820,
        // Keep the quick-chat typing behavior: generated voice is the clock.
        typing: false,
        humanTyping: false,
        typingMs: 0,
        tailMs: Math.max(project.timing.tailMs, 1_400),
      },
    };
  }

  const { minimumDurationMs: _minimumDurationMs, ...existingTiming } = project.timing;
  return {
    ...project,
    timing: {
      ...DEFAULT_TIMING,
      ...existingTiming,
      mode: "standard",
    },
  };
}
