/**
 * TRILHA DE ÁUDIO do editor profissional.
 * Guarda apenas metadados (JSONB no documento do projeto). A mixagem real
 * continua em `src/lib/audio-track.ts` (Web Audio) na hora de exportar.
 */

export type AudioClipKind = "music" | "voice" | "sfx" | "replacement";

export interface AudioClip {
  id: string;
  kind: AudioClipKind;
  name: string;
  /** URL da mídia (object URL, storage assinado ou data URL de narração) */
  url: string;
  /** início na linha do tempo (s) */
  startTime: number;
  /** duração usada (s); 0 = até o fim do arquivo */
  duration: number;
  /** 0..1.5 */
  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  loop: boolean;
}

export interface EditorAudio {
  tracks: AudioClip[];
  /** silencia o áudio original do vídeo */
  originalMuted: boolean;
  /** 0..1.5 — volume do áudio original */
  originalVolume: number;
  /** abaixa a música automaticamente sob a fala */
  duckUnderSpeech: boolean;
  /** quanto abaixar durante a fala (0..1) */
  duckAmount: number;
}

export function defaultEditorAudio(): EditorAudio {
  return {
    tracks: [],
    originalMuted: false,
    originalVolume: 1,
    duckUnderSpeech: true,
    duckAmount: 0.65,
  };
}

export function createAudioClip(patch: Partial<AudioClip> & { url: string; name: string }): AudioClip {
  return {
    id: `aud-${Math.random().toString(36).slice(2, 9)}`,
    kind: "music",
    startTime: 0,
    duration: 0,
    volume: 0.8,
    fadeIn: 0.5,
    fadeOut: 0.8,
    muted: false,
    loop: false,
    ...patch,
  };
}

/** Acervo inicial de faixas livres (CC0) carregadas sob demanda. */
export const STOCK_MUSIC: { id: string; name: string; mood: string; url: string }[] = [
  {
    id: "cc0-uplift",
    name: "Uplift Corporate",
    mood: "Energético",
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3",
  },
  {
    id: "cc0-lofi",
    name: "Lo-fi Study",
    mood: "Calmo",
    url: "https://cdn.pixabay.com/download/audio/2021/08/09/audio_88447e769f.mp3",
  },
  {
    id: "cc0-trap",
    name: "Trap Hook",
    mood: "Viral",
    url: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc7d9a4.mp3",
  },
];

/**
 * Envelope de ducking a partir das janelas de fala: 1 fora da fala,
 * (1 - amount) dentro dela, com rampa curta nas bordas.
 */
export function duckGainAt(
  speech: { start: number; end: number }[],
  t: number,
  amount: number,
  ramp = 0.25,
): number {
  const low = Math.max(0, 1 - amount);
  let gain = 1;
  for (const s of speech) {
    if (t >= s.start - ramp && t <= s.end + ramp) {
      const inEdge = Math.min(1, Math.max(0, (t - (s.start - ramp)) / ramp));
      const outEdge = Math.min(1, Math.max(0, (s.end + ramp - t) / ramp));
      const k = Math.min(inEdge, outEdge);
      gain = Math.min(gain, 1 - (1 - low) * k);
    }
  }
  return gain;
}
