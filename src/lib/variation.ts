/** Anti-duplicidade: variações sutis aplicadas por vídeo. */

/** Curvas de movimento aplicadas ao longo do clipe (não só um valor fixo). */
export type MotionPreset = "none" | "breathe" | "kenburns" | "pulse" | "pushin";

export const MOTION_PRESETS: { id: MotionPreset | "auto"; label: string; hint: string }[] = [
  { id: "auto", label: "Automático", hint: "Sorteia um movimento diferente para cada vídeo" },
  { id: "breathe", label: "Respiração", hint: "Amplia devagar e volta ao tamanho normal, em ciclo" },
  { id: "kenburns", label: "Ken Burns", hint: "Deriva lenta de zoom com leve panorâmica" },
  { id: "pulse", label: "Pulso no ritmo", hint: "Pequenos avanços de zoom nos acentos do áudio" },
  { id: "pushin", label: "Push-in", hint: "Entra fechado e abre para o quadro normal" },
  { id: "none", label: "Nenhum", hint: "Zoom fixo do começo ao fim" },
];

export interface AntiDupConfig {
  auto: boolean;
  mirror: boolean;
  speed: number;
  /** amplitude máxima das variações automáticas */
  brightness: number; // ex 0.04 => ±4%
  saturation: number;
  zoom: number; // ex 0.03 => até +3% de zoom
  trim: number; // segundos cortados no início/fim (até)
  noise: number; // 0..1 intensidade do ruído
  rotate: number; // graus máximos de rotação (ex 0.3)
  border: number; // espessura máxima da moldura em px (no canvas 1080)
  pitch: number; // cents de variação de tom do áudio (ex 25)
  eq: number; // dB máximos de realce/corte sutil de agudos
  cleanMetadata: boolean;
  /** preset de movimento; "auto" sorteia por vídeo */
  motion: MotionPreset | "auto";
  /** amplitude extra de zoom do movimento (ex 0.08 => até +8%) */
  motionAmount: number;
  /** duração do ciclo de movimento em segundos */
  motionPeriod: number;
  /** micro deslocamento lento do enquadramento */
  microPan: boolean;
  /** brilho/saturação oscilando de forma quase imperceptível */
  colorDrift: boolean;
  /** balanço lento da rotação em vez de giro travado */
  sway: boolean;
}

export const defaultAntiDup = (): AntiDupConfig => ({
  auto: true,
  mirror: false,
  speed: 1,
  brightness: 0.05,
  saturation: 0.06,
  zoom: 0.04,
  trim: 0.25,
  noise: 0.03,
  rotate: 0.3,
  border: 8,
  pitch: 25,
  eq: 1.5,
  cleanMetadata: true,
  motion: "auto",
  motionAmount: 0.06,
  motionPeriod: 7,
  microPan: true,
  colorDrift: true,
  sway: true,
});

export interface Motion {
  preset: MotionPreset;
  /** amplitude extra de zoom (0..0.3) */
  amount: number;
  /** segundos por ciclo */
  period: number;
  /** deslocamento inicial do ciclo (0..1) */
  phase: number;
  /** deriva do enquadramento ao longo do clipe (-1..1, unidades de offset) */
  panX: number;
  panY: number;
  /** oscilação de brilho/saturação (0..0.05) */
  colorDrift: number;
  /** oscilação de rotação em graus */
  sway: number;
}

export interface Variation {
  mirror: boolean;
  speed: number;
  brightness: number; // multiplicador (1 = neutro)
  saturation: number;
  zoom: number; // 1 = neutro
  trimStart: number;
  trimEnd: number;
  noise: number;
  rotate: number; // graus
  border: number; // px
  borderColor: string;
  pitch: number; // cents
  eq: number; // dB
  motion: Motion;
}

/** Valores do movimento em um instante do clipe de saída. */
export interface MotionState {
  zoom: number;
  panX: number;
  panY: number;
  brightness: number;
  saturation: number;
  rotate: number;
}

const NO_MOTION: Motion = {
  preset: "none",
  amount: 0,
  period: 7,
  phase: 0,
  panX: 0,
  panY: 0,
  colorDrift: 0,
  sway: 0,
};

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/**
 * Estado do movimento no instante `t` (segundos do clipe de saída).
 * `energy` (0..1) é a intensidade do áudio naquele ponto, usada pelo preset "pulse".
 */
export function motionAt(v: Variation, t: number, duration: number, energy = 0): MotionState {
  const m = v.motion ?? NO_MOTION;
  const dur = Math.max(0.2, duration);
  const p = Math.min(1, Math.max(0, t / dur));
  const period = Math.max(1, m.period || 7);
  const wave = Math.sin(2 * Math.PI * (t / period + (m.phase ?? 0)));

  let zoomExtra = 0;
  let px = 0;
  let py = 0;
  switch (m.preset) {
    case "breathe":
      zoomExtra = m.amount * (0.5 + 0.5 * wave);
      break;
    case "kenburns":
      zoomExtra = m.amount * easeInOut(p);
      px = m.panX * easeInOut(p);
      py = m.panY * easeInOut(p);
      break;
    case "pulse":
      zoomExtra = m.amount * (0.15 + 0.85 * Math.min(1, Math.max(0, energy)));
      break;
    case "pushin": {
      // entra fechado nos primeiros ~15% e abre até o quadro normal
      const k = Math.min(1, p / 0.18);
      zoomExtra = m.amount * (1 - easeInOut(k));
      break;
    }
    default:
      zoomExtra = 0;
  }

  if (m.preset !== "kenburns") {
    px = m.panX * Math.sin(2 * Math.PI * (t / (period * 1.7) + (m.phase ?? 0)));
    py = m.panY * Math.sin(2 * Math.PI * (t / (period * 2.3) + (m.phase ?? 0) * 0.5));
  }

  const drift = (m.colorDrift ?? 0) * Math.sin(2 * Math.PI * (t / (period * 1.3) + (m.phase ?? 0)));
  const driftSat = (m.colorDrift ?? 0) * Math.sin(2 * Math.PI * (t / (period * 2.1) + 0.25));

  return {
    zoom: v.zoom * (1 + zoomExtra),
    panX: px,
    panY: py,
    brightness: v.brightness * (1 + drift),
    saturation: v.saturation * (1 + driftSat),
    rotate: v.rotate + (m.sway ?? 0) * Math.sin(2 * Math.PI * (t / (period * 1.9) + (m.phase ?? 0))),
  };
}


function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG determinístico: mesma seed => mesma variação (reprocessar dá o mesmo arquivo). */
function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Movimento determinístico: preset, fase e amplitude sorteados pela seed. */
function makeMotion(cfg: AntiDupConfig, r: () => number, random: boolean): Motion {
  const preset: MotionPreset =
    cfg.motion === "auto"
      ? (["breathe", "kenburns", "pulse", "pushin"] as const)[Math.floor(r() * 4)] ?? "breathe"
      : cfg.motion;
  if (preset === "none") return { ...NO_MOTION, period: cfg.motionPeriod ?? 7 };
  const amp = cfg.motionAmount ?? 0;
  const dir = () => (r() < 0.5 ? -1 : 1);
  return {
    preset,
    amount: random ? amp * (0.6 + r() * 0.6) : amp,
    period: Math.max(1, (cfg.motionPeriod ?? 7) * (random ? 0.75 + r() * 0.5 : 1)),
    phase: random ? r() : 0,
    panX: cfg.microPan ? (random ? dir() * (0.02 + r() * 0.05) : 0.04) : 0,
    panY: cfg.microPan ? (random ? dir() * (0.02 + r() * 0.05) : 0.03) : 0,
    colorDrift: cfg.colorDrift ? (random ? 0.006 + r() * 0.014 : 0.01) : 0,
    sway: cfg.sway ? (random ? dir() * (0.05 + r() * 0.2) : 0.1) : 0,
  };
}

export function makeVariation(cfg: AntiDupConfig, seed: string): Variation {
  const base: Variation = {
    mirror: cfg.mirror,
    speed: cfg.speed,
    brightness: 1,
    saturation: 1,
    zoom: 1,
    trimStart: 0,
    trimEnd: 0,
    noise: 0,
    rotate: 0,
    border: 0,
    borderColor: "#000000",
    pitch: 0,
    eq: 0,
    motion: NO_MOTION,
  };
  const r = rng(seed);
  // modo manual: os valores dos sliders são aplicados exatamente como estão
  if (!cfg.auto) {
    const tintM = 16;
    return {
      ...base,
      brightness: 1 + cfg.brightness,
      saturation: 1 + cfg.saturation,
      zoom: 1 + cfg.zoom,
      trimStart: Number(cfg.trim.toFixed(2)),
      trimEnd: Number(cfg.trim.toFixed(2)),
      noise: cfg.noise,
      rotate: Number((cfg.rotate ?? 0).toFixed(2)),
      border: Math.round(cfg.border ?? 0),
      borderColor: `rgb(${tintM},${tintM},${tintM})`,
      pitch: Math.round(cfg.pitch ?? 0),
      eq: Number((cfg.eq ?? 0).toFixed(2)),
      motion: makeMotion(cfg, r, false),
    };
  }


  const spread = (amp: number) => (r() * 2 - 1) * amp;

  const border = Math.round(r() * (cfg.border ?? 0));
  const tint = Math.round(r() * 24);

  return {
    mirror: cfg.mirror,
    speed: Number((cfg.speed + spread(0.02)).toFixed(3)),
    brightness: 1 + spread(cfg.brightness),
    saturation: 1 + spread(cfg.saturation),
    zoom: 1 + r() * cfg.zoom,
    trimStart: Number((r() * cfg.trim).toFixed(2)),
    trimEnd: Number((r() * cfg.trim).toFixed(2)),
    noise: cfg.noise * (0.5 + r() * 0.5),
    rotate: Number(spread(cfg.rotate ?? 0).toFixed(2)),
    border,
    borderColor: `rgb(${tint},${tint},${tint})`,
    pitch: Math.round(spread(cfg.pitch ?? 0)),
    eq: Number(spread(cfg.eq ?? 0).toFixed(2)),
    motion: makeMotion(cfg, r, true),
  };
}


const MOTION_LABEL: Record<MotionPreset, string> = {
  none: "",
  breathe: "respiração",
  kenburns: "ken burns",
  pulse: "pulso",
  pushin: "push-in",
};

export function describeVariation(v: Variation) {
  const m = v.motion;
  return [
    v.mirror ? "espelho" : null,
    `${v.speed.toFixed(3)}x`,
    `brilho ${(v.brightness * 100).toFixed(0)}%`,
    `sat ${(v.saturation * 100).toFixed(0)}%`,
    `zoom ${((v.zoom - 1) * 100).toFixed(1)}%`,
    m && m.preset !== "none"
      ? `mov ${MOTION_LABEL[m.preset]} +${(m.amount * 100).toFixed(1)}%/${m.period.toFixed(1)}s`
      : null,
    v.rotate ? `giro ${v.rotate}°` : null,
    v.border ? `moldura ${v.border}px` : null,
    v.pitch ? `tom ${v.pitch > 0 ? "+" : ""}${v.pitch}c` : null,
    v.eq ? `eq ${v.eq > 0 ? "+" : ""}${v.eq}dB` : null,
    `corte ${v.trimStart.toFixed(2)}s/${v.trimEnd.toFixed(2)}s`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Assinatura curta da variação — serve pra conferir que dois exports diferem. */
export function variationFingerprint(v: Variation) {
  const s = JSON.stringify(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

