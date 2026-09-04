/**
 * Manifesto de render versionado.
 *
 * É o contrato único entre o preview do editor, o render local (WebCodecs) e o
 * worker da VPS (FFmpeg). Qualquer mudança incompatível exige subir
 * RENDER_MANIFEST_VERSION para o worker recusar o que não sabe interpretar.
 */

export const RENDER_MANIFEST_VERSION = 1 as const;

export interface ManifestCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManifestKeyframe {
  time: number;
  crop: ManifestCrop;
  scale?: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export interface ManifestCaptionStyle {
  preset: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  highlight?: string;
  stroke?: string;
  position?: "top" | "center" | "bottom";
}

export interface ManifestCaptionCue {
  start: number;
  end: number;
  text: string;
  words?: { start: number; end: number; text: string }[];
}

export interface ManifestTransition {
  at: number;
  kind: "cut" | "fade" | "slide" | "zoom";
  duration: number;
}

export interface ManifestAudio {
  muteSource?: boolean;
  sourceGain?: number;
  musicUrl?: string | null;
  musicGain?: number;
  normalize?: boolean;
}

export interface ManifestBranding {
  logoUrl?: string | null;
  logoOpacity?: number;
  logoScale?: number;
  logoPosition?: "tl" | "tr" | "bl" | "br";
  headline?: string | null;
  cta?: string | null;
}

export interface ManifestVariation {
  seed: number;
  zoom?: number;
  speed?: number;
  saturation?: number;
  brightness?: number;
  mirror?: boolean;
  motionPreset?: string | null;
  noise?: number;
}

export interface ManifestOutput {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  format: "mp4";
}

export interface RenderManifest {
  version: typeof RENDER_MANIFEST_VERSION;
  itemId?: string;
  templateId?: string | null;
  output: ManifestOutput;
  trim?: { start: number; end: number } | null;
  crop?: ManifestCrop | null;
  keyframes: ManifestKeyframe[];
  transitions: ManifestTransition[];
  captions?: { style: ManifestCaptionStyle; cues: ManifestCaptionCue[] } | null;
  branding?: ManifestBranding | null;
  audio?: ManifestAudio | null;
  variation?: ManifestVariation | null;
}

const DEFAULT_OUTPUT: ManifestOutput = { width: 1080, height: 1920, fps: 30, format: "mp4" };

/** Normaliza qualquer entrada parcial em um manifesto completo e válido. */
export function buildRenderManifest(input: Partial<RenderManifest> = {}): RenderManifest {
  const output = { ...DEFAULT_OUTPUT, ...(input.output ?? {}) };
  return {
    version: RENDER_MANIFEST_VERSION,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    templateId: input.templateId ?? null,
    output: {
      width: Math.max(16, Math.round(output.width)),
      height: Math.max(16, Math.round(output.height)),
      fps: Math.min(60, Math.max(1, Math.round(output.fps))),
      ...(output.bitrate ? { bitrate: Math.max(100_000, Math.round(output.bitrate)) } : {}),
      format: "mp4",
    },
    trim: input.trim && input.trim.end > input.trim.start ? input.trim : null,
    crop: input.crop ?? null,
    keyframes: [...(input.keyframes ?? [])].sort((a, b) => a.time - b.time),
    transitions: [...(input.transitions ?? [])].sort((a, b) => a.at - b.at),
    captions: input.captions ?? null,
    branding: input.branding ?? null,
    audio: input.audio ?? null,
    variation: input.variation ?? null,
  };
}

export interface ManifestCheck {
  ok: boolean;
  reason?: string;
}

/** O worker/local usa isto antes de processar: versão desconhecida não roda. */
export function checkManifest(raw: unknown): ManifestCheck {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "manifesto ausente" };
  const m = raw as Partial<RenderManifest>;
  if (m.version !== RENDER_MANIFEST_VERSION) {
    return { ok: false, reason: `versão ${String(m.version)} incompatível (esperado ${RENDER_MANIFEST_VERSION})` };
  }
  if (!m.output || !m.output.width || !m.output.height) return { ok: false, reason: "saída inválida" };
  if (m.trim && m.trim.end <= m.trim.start) return { ok: false, reason: "corte inválido" };
  return { ok: true };
}

export interface AvExpectation {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Validação A/V do arquivo exportado contra o esperado pelo manifesto. */
export function validateAgainstManifest(
  manifest: RenderManifest,
  actual: AvExpectation,
  toleranceSec = 0.5,
): ManifestCheck {
  if (actual.width !== manifest.output.width || actual.height !== manifest.output.height) {
    return {
      ok: false,
      reason: `resolução ${actual.width}x${actual.height} difere de ${manifest.output.width}x${manifest.output.height}`,
    };
  }
  if (manifest.trim) {
    const expected = (manifest.trim.end - manifest.trim.start) / (manifest.variation?.speed ?? 1);
    if (Math.abs(actual.durationSec - expected) > toleranceSec) {
      return { ok: false, reason: `duração ${actual.durationSec.toFixed(2)}s fora da tolerância (${expected.toFixed(2)}s)` };
    }
  }
  if (actual.durationSec <= 0) return { ok: false, reason: "arquivo sem duração" };
  if (!actual.hasAudio && !manifest.audio?.muteSource) {
    return { ok: false, reason: "áudio ausente no arquivo exportado" };
  }
  return { ok: true };
}
