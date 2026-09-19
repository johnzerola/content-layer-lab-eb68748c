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
