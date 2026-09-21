/**
 * Post-processing contract for synthetic/licensed TTS audio.
 * This is intentionally separate from VoiceProfile identity and provider choice.
 */
export const VOICE_TRANSFORM_ENGINE_VERSION = "ffmpeg-baseline-2-effects";

/** Post-processing effects implemented by the local/remote FFmpeg worker. */
export type VoiceEffect =
  | "none"
  | "radio"
  | "telephone"
  | "megaphone"
  | "robot"
  | "cave"
  | "horror";

export type VoiceTransformMode =
  | "VARISPEED"
  | "TEMPO_ONLY"
  | "PITCH_ONLY"
  | "SPEED_AND_PITCH"
  | "VARISPEED_THEN_RESTORE_TEMPO";

export type VoiceTransformEvidenceLevel =
  | "BASELINE"
  | "COMMUNITY_REPRODUCED"
  | "EXPERIMENTAL_COMMUNITY_DERIVED"
  | "EXPERIMENTAL"
  | "INTERNAL_VALIDATED";

export interface VoiceNormalizationConfig {
  enabled: boolean;
  integratedLufs: number;
  truePeakDb: number;
  loudnessRange: number;
}

export interface VoiceTransformConfig {
  mode: VoiceTransformMode;
  speedMultiplier: number;
  /** Independent/additional pitch. Linked varispeed pitch is calculated separately. */
  pitchSemitones: number;
  linkedPitchToSpeed: boolean;
  preservePitch: boolean;
  preserveFormants: boolean;
  /** Optional for projects saved before the modifier catalog was added. */
  effect?: VoiceEffect;
  normalization: VoiceNormalizationConfig;
  outputCodec: "mp3";
}

export interface VoiceTransformSelection {
  presetId: string;
  config: VoiceTransformConfig;
}

export interface VoiceTransformPreset {
  id: string;
  displayName: string;
  simpleLabel: "Natural" | "Young" | "Teen / Viral" | "Child-like" | "Deep" | "Mature Character" | "Normal speed high pitch" | "Fast dialogue" | "Radio" | "Telephone" | "Megaphone" | "Robot" | "Cave" | "Horror";
  sourceCompatibility: string[];
  baseVoiceHint?: string;
  config: VoiceTransformConfig;
  evidenceLevel: VoiceTransformEvidenceLevel;
  description: string;
  effectivePitchSemitones: number;
  safeSpeedRange?: [number, number];
  safePitchRange?: [number, number];
  generationHints?: { stability: number; similarity: number; style: number; speed: number };
}

export const DEFAULT_VOICE_NORMALIZATION: VoiceNormalizationConfig = {
  enabled: true,
  integratedLufs: -18,
  truePeakDb: -1.5,
  loudnessRange: 11,
};

export function ratioToSemitones(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("A razão de tom deve ser maior que zero.");
  return 12 * Math.log2(ratio);
}

export function semitonesToRatio(semitones: number): number {
  if (!Number.isFinite(semitones)) throw new Error("O tom deve ser um número finito.");
  return 2 ** (semitones / 12);
}

/** Split tempo changes into portable FFmpeg atempo stages (0.5–2.0 each). */
export function buildAtempoChain(multiplier: number): number[] {
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error("A velocidade deve ser maior que zero.");
  const stages: number[] = [];
  let remaining = multiplier;
  while (remaining < 0.5 - 1e-9) {
    stages.push(0.5);
    remaining /= 0.5;
  }
  while (remaining > 2 + 1e-9) {
    stages.push(2);
    remaining /= 2;
  }
  if (Math.abs(remaining - 1) > 1e-9 || stages.length === 0) stages.push(remaining);
  return stages.map((value) => Number(value.toFixed(8)));
}

const config = (
  mode: VoiceTransformMode,
  speedMultiplier: number,
  pitchSemitones: number,
  linkedPitchToSpeed: boolean,
  preservePitch: boolean,
  effect: VoiceEffect = "none",
): VoiceTransformConfig => ({
  mode,
  speedMultiplier,
  pitchSemitones,
  linkedPitchToSpeed,
  preservePitch,
  preserveFormants: false,
  effect,
  normalization: { ...DEFAULT_VOICE_NORMALIZATION },
  outputCodec: "mp3",
});

const linkedPitch = (speed: number, extra = 0) => ratioToSemitones(speed) + extra;

export const VOICE_TRANSFORM_PRESETS: VoiceTransformPreset[] = [
  {
    id: "dialogue_fast",
    displayName: "Conversa rápida · experimental",
    simpleLabel: "Fast dialogue",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("TEMPO_ONLY", 1.3, 0, false, true),
    evidenceLevel: "EXPERIMENTAL",
    description: "Acelera a fala preservando o tom. Ponto de partida para diálogo rápido; a velocidade final depende da voz-base, não garante palavras por minuto fixas.",
    effectivePitchSemitones: 0,
    safeSpeedRange: [1.1, 1.5],
  },
  {
    id: "adam_natural",
    displayName: "Adam — Natural",
    simpleLabel: "Natural",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "Adam ou outra voz masculina adulta sintética compatível",
    config: config("TEMPO_ONLY", 1, 0, false, true),
    evidenceLevel: "BASELINE",
    description: "Voz-base sem alteração perceptível de velocidade ou tom.",
    effectivePitchSemitones: 0,
  },
  {
    id: "adam_young",
    displayName: "Adam — Young",
    simpleLabel: "Young",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "Adam ou outra voz masculina adulta sintética compatível",
    config: config("SPEED_AND_PITCH", 1.15, 2.5, false, false),
    evidenceLevel: "EXPERIMENTAL",
    description: "Caráter mais jovem e ágil; não representa uma idade autêntica.",
    effectivePitchSemitones: 2.5,
    safeSpeedRange: [1.12, 1.18],
    safePitchRange: [2, 3],
  },
  {
    id: "adam_roblox_teen",
    displayName: "Adam — Roblox Teen",
    simpleLabel: "Teen / Viral",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "ElevenLabs Adam ou voz masculina adulta sintética compatível",
    config: config("VARISPEED", 1.3, 0, true, false),
    evidenceLevel: "COMMUNITY_REPRODUCED",
    description: "Narração rápida, brilhante e aguda em estilo viral; não é uma voz adolescente autêntica.",
    effectivePitchSemitones: linkedPitch(1.3),
    generationHints: { stability: 50, similarity: 75, style: 0, speed: 1 },
  },
  {
    id: "adam_child_male",
    displayName: "Adam — Child-like Male",
    simpleLabel: "Child-like",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "Adam ou outra voz masculina adulta sintética compatível",
    config: config("SPEED_AND_PITCH", 1.3, 0.75, true, false),
    evidenceLevel: "EXPERIMENTAL_COMMUNITY_DERIVED",
    description: "Efeito masculino infantilizado e ficcional; não imita uma criança real.",
    effectivePitchSemitones: linkedPitch(1.3, 0.75),
    safePitchRange: [5, 5.8],
  },
  {
    id: "adam_child_cartoon",
    displayName: "Adam — Child-like Cartoon",
    simpleLabel: "Child-like",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "Adam ou outra voz masculina adulta sintética compatível",
    config: config("SPEED_AND_PITCH", 1.35, 0.5, true, false),
    evidenceLevel: "EXPERIMENTAL",
    description: "Efeito cartunesco agudo dentro de uma faixa conservadora.",
    effectivePitchSemitones: linkedPitch(1.35, 0.5),
    safePitchRange: [5.5, 6.2],
  },
  {
    id: "adam_deep",
    displayName: "Adam — Deep Adult",
    simpleLabel: "Deep",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "Adam ou outra voz masculina adulta sintética compatível",
    config: config("SPEED_AND_PITCH", 0.95, -1.5, false, false),
    evidenceLevel: "EXPERIMENTAL",
    description: "Efeito adulto mais grave, sem alegação de identidade ou idade.",
    effectivePitchSemitones: -1.5,
    safePitchRange: [-2, -1],
  },
  {
    id: "adam_mature_character",
    displayName: "Adam — Mature Character",
    simpleLabel: "Mature Character",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "Adam ou outra voz masculina adulta sintética compatível",
    config: config("SPEED_AND_PITCH", 0.91, -2.25, false, false),
    evidenceLevel: "EXPERIMENTAL",
    description: "Efeito tonal de personagem maduro; não é uma voz idosa autêntica.",
    effectivePitchSemitones: -2.25,
    safeSpeedRange: [0.88, 0.95],
    safePitchRange: [-3, -1.5],
  },
  {
    id: "adam_child_pitch_only",
    displayName: "Adam — Normal Speed High Pitch",
    simpleLabel: "Normal speed high pitch",
    sourceCompatibility: ["adult-male", "elevenlabs-adam"],
    baseVoiceHint: "Adam ou outra voz masculina adulta sintética compatível",
    config: config("VARISPEED_THEN_RESTORE_TEMPO", 1.3, 0, true, true),
    evidenceLevel: "EXPERIMENTAL",
    description: "Eleva o tom por varispeed e restaura aproximadamente a duração original.",
    effectivePitchSemitones: linkedPitch(1.3),
  },
  {
    id: "child_bright",
    displayName: "Personagem — Criança brilhante",
    simpleLabel: "Child-like",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("SPEED_AND_PITCH", 1.12, 4.5, false, false),
    evidenceLevel: "EXPERIMENTAL",
    description: "Efeito infantil agudo e claro; não representa uma criança real nem cria nova identidade vocal.",
    effectivePitchSemitones: 4.5,
    safeSpeedRange: [1.05, 1.18],
    safePitchRange: [3.5, 5.5],
  },
  {
    id: "teen_energetic",
    displayName: "Personagem — Adolescente energético",
    simpleLabel: "Teen / Viral",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("SPEED_AND_PITCH", 1.18, 2.5, false, false),
    evidenceLevel: "EXPERIMENTAL",
    description: "Efeito jovem, rápido e brilhante para vídeos curtos; não é uma voz adolescente autêntica.",
    effectivePitchSemitones: 2.5,
    safeSpeedRange: [1.1, 1.25],
    safePitchRange: [1.5, 3.5],
  },
  {
    id: "elderly_warm",
    displayName: "Personagem — Idoso caloroso",
    simpleLabel: "Mature Character",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("SPEED_AND_PITCH", 0.9, -2.5, false, false),
    evidenceLevel: "EXPERIMENTAL",
    description: "Efeito mais grave e lento para personagem maduro; não é uma voz idosa autêntica.",
    effectivePitchSemitones: -2.5,
    safeSpeedRange: [0.85, 0.98],
    safePitchRange: [-4, -1.5],
  },
  {
    id: "narrator_deep",
    displayName: "Locução — Narrador grave",
    simpleLabel: "Deep",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("SPEED_AND_PITCH", 0.96, -1.5, false, false),
    evidenceLevel: "BASELINE",
    description: "Locução encorpada com ritmo controlado e normalização de volume.",
    effectivePitchSemitones: -1.5,
  },
  {
    id: "news_radio",
    displayName: "Locução — Notícias / rádio",
    simpleLabel: "Radio",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("TEMPO_ONLY", 1, 0, false, true, "radio"),
    evidenceLevel: "BASELINE",
    description: "Faixa de rádio com compressão e corte de graves/agudos extremos.",
    effectivePitchSemitones: 0,
  },
  {
    id: "telephone",
    displayName: "Efeito — Telefone",
    simpleLabel: "Telephone",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("TEMPO_ONLY", 1, 0, false, true, "telephone"),
    evidenceLevel: "BASELINE",
    description: "Banda estreita de telefone para mensagens, chamadas e diálogos.",
    effectivePitchSemitones: 0,
  },
  {
    id: "megaphone",
    displayName: "Efeito — Megafone",
    simpleLabel: "Megaphone",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("TEMPO_ONLY", 1, 0, false, true, "megaphone"),
    evidenceLevel: "BASELINE",
    description: "Médio-agudos destacados e compressão para efeito de megafone.",
    effectivePitchSemitones: 0,
  },
  {
    id: "robot",
    displayName: "Efeito — Robô",
    simpleLabel: "Robot",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("TEMPO_ONLY", 1, 0, false, true, "robot"),
    evidenceLevel: "EXPERIMENTAL",
    description: "Modulação e eco curtos para personagem robótico; não é conversão neural.",
    effectivePitchSemitones: 0,
  },
  {
    id: "cave_echo",
    displayName: "Efeito — Caverna / eco",
    simpleLabel: "Cave",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("TEMPO_ONLY", 1, 0, false, true, "cave"),
    evidenceLevel: "BASELINE",
    description: "Eco curto para ambientes, cavernas e transições dramáticas.",
    effectivePitchSemitones: 0,
  },
  {
    id: "horror",
    displayName: "Efeito — Terror",
    simpleLabel: "Horror",
    sourceCompatibility: ["synthetic-voice", "licensed-voice"],
    config: config("SPEED_AND_PITCH", 0.94, -1, false, false, "horror"),
    evidenceLevel: "EXPERIMENTAL",
    description: "Tom levemente grave com ambiência curta para suspense e terror.",
    effectivePitchSemitones: -1,
  },
];

export const DEFAULT_VOICE_TRANSFORM_PRESET_ID = "adam_natural";

export function voiceTransformPreset(id: string | undefined): VoiceTransformPreset {
  return VOICE_TRANSFORM_PRESETS.find((preset) => preset.id === id)
    ?? VOICE_TRANSFORM_PRESETS.find((preset) => preset.id === DEFAULT_VOICE_TRANSFORM_PRESET_ID)!;
}

export function selectionFromTransformPreset(id: string): VoiceTransformSelection {
  const preset = voiceTransformPreset(id);
  return { presetId: preset.id, config: structuredClone(preset.config) };
}

/** Render explicit tone controls into the clip; legacy pitch-only presets stay compatible. */
export function synthesisTransformForProfile(profile: {
  pitch?: number;
  transform?: VoiceTransformSelection | undefined;
}): VoiceTransformSelection | undefined {
  const pitch = Math.max(-6, Math.min(6, profile.pitch ?? 0));
  if (!profile.transform) return undefined;
  const selection = structuredClone(profile.transform);
  if (pitch !== 0) {
    selection.config.pitchSemitones = effectiveTransformPitch(selection.config) + pitch;
    selection.config.linkedPitchToSpeed = false;
    selection.config.mode = selection.config.speedMultiplier === 1
      ? "PITCH_ONLY" : "SPEED_AND_PITCH";
  }
  return selection;
}

export function effectiveTransformPitch(configValue: VoiceTransformConfig): number {
  const linked = configValue.linkedPitchToSpeed ? ratioToSemitones(configValue.speedMultiplier) : 0;
  return linked + configValue.pitchSemitones;
}

export function validateVoiceTransformConfig(value: VoiceTransformConfig): VoiceTransformConfig {
  const speedMultiplier = Math.max(0.25, Math.min(4, value.speedMultiplier));
  const pitchSemitones = Math.max(-12, Math.min(12, value.pitchSemitones));
  return {
    ...value,
    speedMultiplier,
    pitchSemitones,
    preserveFormants: false,
    effect: value.effect ?? "none",
    outputCodec: "mp3",
    normalization: {
      enabled: Boolean(value.normalization?.enabled),
      integratedLufs: Math.max(-30, Math.min(-12, value.normalization?.integratedLufs ?? -18)),
      truePeakDb: Math.max(-6, Math.min(-1, value.normalization?.truePeakDb ?? -1.5)),
      loudnessRange: Math.max(1, Math.min(20, value.normalization?.loudnessRange ?? 11)),
    },
  };
}
