/**
 * Elenco de vozes do ChatScene — camada CONTENT/VOICE.
 *
 * Três coisas separadas de propósito:
 *
 *   IDENTIDADE  de quem é a voz (participante)
 *   ESTILO      como ela fala (calma, animada, séria, nervosa…)
 *   PROVEDOR    quem sintetiza o áudio (trocável)
 *
 * As vozes são genéricas e sintéticas. O produto não clona nem imita a voz de
 * uma pessoa real, e não guarda amostras de voz de ninguém.
 */

export type VoiceGender = "feminina" | "masculina" | "neutra";
export type VoiceAge = "jovem" | "adulta" | "madura";
export type VoiceStyle =
  | "natural"
  | "animada"
  | "seria"
  | "sussurro"
  | "nervosa"
  | "sarcastica"
  | "assustada";

export interface VoiceProfile {
  /** voz genérica escolhida no elenco */
  presetId: string;
  style: VoiceStyle;
  /** 0.7 a 1.3 */
  speed: number;
  /** volume relativo da fala desta pessoa (0.2 a 1.5) */
  gain: number;
}

export interface VoicePreset {
  id: string;
  label: string;
  gender: VoiceGender;
  age: VoiceAge;
  /** nome da voz genérica no provedor padrão */
  providerVoice: string;
}

/** Vozes genéricas do elenco, sem relação com pessoas reais. */
export const VOICE_PRESETS: VoicePreset[] = [
  { id: "f-jovem", label: "Feminina jovem", gender: "feminina", age: "jovem", providerVoice: "shimmer" },
  { id: "f-adulta", label: "Feminina adulta", gender: "feminina", age: "adulta", providerVoice: "nova" },
  { id: "f-madura", label: "Feminina madura", gender: "feminina", age: "madura", providerVoice: "sage" },
  { id: "m-jovem", label: "Masculina jovem", gender: "masculina", age: "jovem", providerVoice: "echo" },
  { id: "m-adulta", label: "Masculina adulta", gender: "masculina", age: "adulta", providerVoice: "onyx" },
  { id: "m-madura", label: "Masculina madura", gender: "masculina", age: "madura", providerVoice: "ash" },
  { id: "neutra", label: "Neutra", gender: "neutra", age: "adulta", providerVoice: "alloy" },
];

export const VOICE_STYLES: { id: VoiceStyle; label: string; direction: string }[] = [
  { id: "natural", label: "Natural", direction: "Fale em português do Brasil, em tom natural de conversa." },
  { id: "animada", label: "Animada", direction: "Fale em português do Brasil, animada e rápida, como quem conta uma novidade." },
  { id: "seria", label: "Séria", direction: "Fale em português do Brasil, em tom sério e contido." },
  { id: "sussurro", label: "Sussurro", direction: "Fale em português do Brasil, baixinho, quase sussurrando." },
  { id: "nervosa", label: "Nervosa", direction: "Fale em português do Brasil, com tensão e respiração curta." },
  { id: "sarcastica", label: "Sarcástica", direction: "Fale em português do Brasil, com ironia leve." },
  { id: "assustada", label: "Assustada", direction: "Fale em português do Brasil, assustada, com urgência." },
];

export const DEFAULT_VOICE: VoiceProfile = {
  presetId: "f-adulta",
  style: "natural",
  speed: 1,
  gain: 1,
};

export function voicePreset(id: string | undefined): VoicePreset {
  return VOICE_PRESETS.find((v) => v.id === id) ?? VOICE_PRESETS[1]!;
}

export function voiceDirection(style: VoiceStyle | undefined): string {
  return (VOICE_STYLES.find((s) => s.id === style) ?? VOICE_STYLES[0]!).direction;
}

/** Ajustes da trilha inteira. */
export interface VoiceMixSettings {
  /** gerar e incluir as falas no vídeo exportado */
  enabled: boolean;
  /** abaixar a música enquanto alguém fala */
  ducking: boolean;
  /** deixar todas as falas no mesmo volume */
  normalize: boolean;
  /** música de fundo opcional (arquivo do usuário ou licenciado) */
  musicUrl?: string | null;
  musicGain: number;
}

export const DEFAULT_VOICE_MIX: VoiceMixSettings = {
  enabled: false,
  ducking: true,
  normalize: true,
  musicUrl: null,
  musicGain: 0.25,
};

/**
 * Chave de cache da fala: o mesmo texto, com a mesma voz e o mesmo estilo,
 * nunca é sintetizado duas vezes.
 */
export function voiceKey(text: string, profile: VoiceProfile): string {
  const raw = `${text.trim()}|${profile.presetId}|${profile.style}|${profile.speed.toFixed(2)}`;
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    h1 = Math.imul(h1 ^ raw.charCodeAt(i), 16777619) >>> 0;
    h2 = ((h2 << 5) + h2 + raw.charCodeAt(i)) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

/** Texto que realmente vai ser falado (mídia e avisos não têm fala). */
export function speakableText(kind: string, text: string): string {
  if (kind === "system" || kind === "sticker") return "";
  return text.replace(/\s+/g, " ").trim();
}
