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
    label: "Dinamico - referencia",
    description: "Texto marca o ritmo (~280 palavras/min); vozes longas sao encaixadas sem esticar a cena.",
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
        fitVoiceToTiming: true,
        msPerWord: 214,
        msPerChar: 24,
        minReadMs: 620,
        maxReadMs: 2_800,
        typing: false,
        humanTyping: false,
        typingMs: 0,
        gapMs: 80,
        senderSwitchMs: 0,
        threadSwitchMs: 220,
        tailMs: 500,
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
        fitVoiceToTiming: false,
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
