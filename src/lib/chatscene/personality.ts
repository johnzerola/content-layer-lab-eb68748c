/**
 * TextingPersonality — o jeito de escrever de cada personagem.
 *
 * Só dados e funções puras: o ritmo de digitação e a quebra de mensagens
 * derivam daqui, sem estado próprio. O documento continua sendo a fonte única.
 */
import type { ChatParticipant } from "./types";

export type MessageLength = "curta" | "media" | "longa";
export type PunctuationStyle = "correta" | "solta" | "nenhuma";
export type ResponseStyle = "rapida" | "pensada" | "objetiva" | "calorosa";

export interface TextingPersonality {
  messageLength: MessageLength;
  /** 0 = escreve tudo por extenso, 1 = abrevia bastante */
  abbreviationLevel: number;
  /** 0 = sem emoji, 1 = emoji quase sempre */
  emojiFrequency: number;
  punctuationStyle: PunctuationStyle;
  responseStyle: ResponseStyle;
  /** caracteres por segundo */
  typingSpeed: number;
  /** 0 = digita direto, 1 = para e volta a digitar */
  hesitationLevel: number;
  /** chance de quebrar uma frase longa em várias mensagens (0–1) */
  messageSplitProbability: number;
}

export const DEFAULT_PERSONALITY: TextingPersonality = {
  messageLength: "media",
  abbreviationLevel: 0.3,
  emojiFrequency: 0.3,
  punctuationStyle: "solta",
  responseStyle: "rapida",
  typingSpeed: 9,
  hesitationLevel: 0.25,
  messageSplitProbability: 0.25,
};

export interface PersonalityPreset {
  id: string;
  label: string;
  hint: string;
  value: TextingPersonality;
}

export const PERSONALITY_PRESETS: PersonalityPreset[] = [
  {
    id: "neutro",
    label: "Neutro",
    hint: "Ritmo comum, sem marca forte.",
    value: { ...DEFAULT_PERSONALITY },
  },
  {
    id: "mae",
    label: "Mãe / pai",
    hint: "Frases médias, pontuação certa, emoji de vez em quando.",
    value: {
      messageLength: "media",
      abbreviationLevel: 0.1,
      emojiFrequency: 0.35,
      punctuationStyle: "correta",
      responseStyle: "calorosa",
      typingSpeed: 6.5,
      hesitationLevel: 0.3,
      messageSplitProbability: 0.15,
    },
  },
  {
    id: "filho",
    label: "Filho / adolescente",
    hint: "Mensagens curtas, abreviação, emoji, resposta rápida.",
    value: {
      messageLength: "curta",
      abbreviationLevel: 0.8,
      emojiFrequency: 0.7,
      punctuationStyle: "nenhuma",
      responseStyle: "rapida",
      typingSpeed: 12,
      hesitationLevel: 0.15,
      messageSplitProbability: 0.6,
    },
  },
  {
    id: "chefe",
    label: "Chefe",
    hint: "Direto, frases curtas, pouca informalidade.",
    value: {
      messageLength: "curta",
      abbreviationLevel: 0.05,
      emojiFrequency: 0.05,
      punctuationStyle: "correta",
      responseStyle: "objetiva",
      typingSpeed: 8.5,
      hesitationLevel: 0.08,
      messageSplitProbability: 0.1,
    },
  },
  {
    id: "avo",
    label: "Avô / avó",
    hint: "Respostas mais longas, ritmo lento, sem abreviação.",
    value: {
      messageLength: "longa",
      abbreviationLevel: 0,
      emojiFrequency: 0.2,
      punctuationStyle: "correta",
      responseStyle: "pensada",
      typingSpeed: 3.6,
      hesitationLevel: 0.55,
      messageSplitProbability: 0.05,
    },
  },
];

export function personalityOf(participant: ChatParticipant): TextingPersonality {
  return { ...DEFAULT_PERSONALITY, ...(participant.personality ?? {}) };
}

/** Número estável entre 0 e 1 — mesma entrada, mesmo resultado. */
export function stableChance(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Quebra uma frase longa em mensagens curtas conforme a personalidade.
 * Determinístico: nunca quebra "às vezes diferente" para o mesmo texto.
 */
export function splitByPersonality(text: string, personality: TextingPersonality, seed = ""): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const chance = personality.messageSplitProbability;
  if (chance <= 0 || clean.length < 40) return [clean];
  if (stableChance(`${seed}:${clean}`) > chance) return [clean];
  const parts = clean
    .split(/(?<=[.!?…,])\s+|\s+(?=mas |porque |e aí |aí )/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return [clean];
  const max = personality.messageLength === "curta" ? 3 : 2;
  if (parts.length <= max) return parts;
  // junta o excedente na última mensagem para não virar spam de bolhas
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join(" ")];
}
