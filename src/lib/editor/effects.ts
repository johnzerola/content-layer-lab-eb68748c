/**
 * EFEITOS DE CLIPE
 *
 * Efeitos aplicados ao quadro inteiro em um intervalo de tempo (glitch, zoom
 * burst, flash, tremor, VHS…). Rodam em canvas 2D puro, então funcionam igual
 * na prévia e dentro do worker de exportação, sem WebGL e sem dependências.
 *
 * O efeito tem duas partes:
 *  - `pre`: transformação aplicada ANTES de desenhar o quadro (zoom, tremor);
 *  - `post`: passe sobre o quadro já desenhado (flash, glitch, scanlines).
 */

export type EffectId =
  | "zoom-burst"
  | "shake"
  | "flash"
  | "rgb-split"
  | "glitch"
  | "vhs"
  | "film-grain"
  | "light-leak"
  | "slow-zoom"
  | "vignette"
  | "pulse"
  | "whip";

export interface EffectDef {
  id: EffectId;
  label: string;
  hint: string;
  /** duração sugerida em segundos (0 = contínuo) */
  suggested: number;
}

export const EFFECTS: EffectDef[] = [
  { id: "zoom-burst", label: "Zoom Burst", hint: "Aproxima com impacto no início", suggested: 0.5 },
  { id: "shake", label: "Tremor", hint: "Câmera na mão / impacto", suggested: 0.6 },
  { id: "flash", label: "Flash", hint: "Estouro de luz na virada", suggested: 0.3 },
  { id: "rgb-split", label: "RGB Split", hint: "Separação de cor estilo glitch", suggested: 0.6 },
  { id: "glitch", label: "Glitch", hint: "Fatias deslocadas e ruído digital", suggested: 0.6 },
  { id: "vhs", label: "VHS", hint: "Scanlines e leve distorção", suggested: 0 },
  { id: "film-grain", label: "Granulado", hint: "Textura de filme", suggested: 0 },
  { id: "light-leak", label: "Luz vazada", hint: "Faixa quente atravessando", suggested: 1.2 },
  { id: "slow-zoom", label: "Zoom lento", hint: "Aproximação contínua (Ken Burns)", suggested: 0 },
  { id: "vignette", label: "Vinheta", hint: "Escurece as bordas", suggested: 0 },
  { id: "pulse", label: "Pulso no beat", hint: "Escala pulsando no ritmo", suggested: 0 },
  { id: "whip", label: "Whip pan", hint: "Rastro lateral de virada", suggested: 0.35 },
];

export interface ClipEffect {
  id: string;
  effect: EffectId;
  /** intervalo na linha do tempo do corte (s) */
  start: number;
  end: number;
  /** 0..1 */
  intensity: number;
}

export function createClipEffect(effect: EffectId, start: number, end: number): ClipEffect {
  return {
    id: `fx-${Math.random().toString(36).slice(2, 9)}`,
    effect,
    start,
    end,
    intensity: 0.6,
  };
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

type Ctx = CanvasRenderingContext2D;

/** Snapshot reaproveitado para os efeitos que precisam copiar o quadro. */
let scratch: { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx } | null = null;
function getScratch(w: number, h: number) {
  if (!scratch || scratch.canvas.width !== w || scratch.canvas.height !== h) {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d") as Ctx | null;
    if (!ctx) return null;
    scratch = { canvas, ctx };
  }
  return scratch;
}

/** Efeitos ativos no tempo `t`, com progresso local 0..1. */
export function activeEffects(list: ClipEffect[] | undefined, t: number) {
  if (!list?.length) return [] as { fx: ClipEffect; p: number }[];
  return list
    .filter((e) => t >= e.start && t <= (e.end || Infinity))
    .map((e) => ({ fx: e, p: e.end > e.start ? clamp((t - e.start) / (e.end - e.start)) : 0 }));
}

/**
 * Transformação antes do desenho (zoom/tremor). Aplique dentro de um
 * ctx.save()/restore() que envolva o desenho do quadro.
 */
export function applyEffectTransform(
  ctx: Ctx,
  list: ClipEffect[] | undefined,
  t: number,
  W: number,
  H: number,
) {
  let scale = 1;
  let dx = 0;
  let dy = 0;
  for (const { fx, p } of activeEffects(list, t)) {
    const k = clamp(fx.intensity);
    switch (fx.effect) {
      case "zoom-burst":
        scale *= 1 + 0.35 * k * (1 - p) * (1 - p);
        break;
      case "slow-zoom":
        scale *= 1 + 0.18 * k * p;
        break;
      case "pulse":
        scale *= 1 + 0.05 * k * Math.abs(Math.sin(t * Math.PI * 2));
        break;
      case "shake": {
        const amp = 0.02 * k * W;
        dx += (rand(t * 60) - 0.5) * amp;
        dy += (rand(t * 60 + 9.7) - 0.5) * amp;
        break;
      }
      case "whip":
        dx += (1 - p) * (1 - p) * W * 0.5 * k;
        break;
      default:
        break;
    }
  }
  if (scale !== 1 || dx || dy) {
    ctx.translate(W / 2 + dx, H / 2 + dy);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);
  }
}

/** Passe sobre o quadro já desenhado (flash, glitch, scanlines, vinheta…). */
export function applyEffectOverlay(
  ctx: Ctx,
  list: ClipEffect[] | undefined,
  t: number,
  W: number,
  H: number,
) {
  const active = activeEffects(list, t);
  if (!active.length) return;
  // o passe é sempre em pixels reais do canvas: assim o snapshot do quadro bate
  // mesmo quando a exportação está ampliada (2K/4K).
  const outer = ctx.getTransform();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  W = ctx.canvas.width;
  H = ctx.canvas.height;

  for (const { fx, p } of active) {
    const k = clamp(fx.intensity);
    ctx.save();
    switch (fx.effect) {
      case "flash": {
        ctx.globalAlpha = k * (1 - p);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case "rgb-split":
      case "glitch":
      case "whip": {
        const s = getScratch(W, H);
        if (!s) break;
        s.ctx.clearRect(0, 0, W, H);
        s.ctx.drawImage(ctx.canvas, 0, 0);
        if (fx.effect === "rgb-split" || fx.effect === "glitch") {
          const off = W * 0.012 * k * (fx.effect === "glitch" ? 0.6 + rand(t * 30) : 1);
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = 0.5;
          ctx.drawImage(s.canvas, -off, 0);
          ctx.drawImage(s.canvas, off, 0);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        if (fx.effect === "glitch") {
          const bands = 6;
          for (let i = 0; i < bands; i++) {
            const seed = Math.floor(t * 12) * bands + i;
            if (rand(seed) > 0.55) continue;
            const by = rand(seed + 3) * H;
            const bh = H * 0.02 + rand(seed + 7) * H * 0.05;
            const shift = (rand(seed + 11) - 0.5) * W * 0.12 * k;
            ctx.drawImage(s.canvas, 0, by, W, bh, shift, by, W, bh);
          }
        }
        if (fx.effect === "whip") {
          ctx.globalAlpha = 0.4 * (1 - p);
          for (let i = 1; i <= 4; i++) {
            ctx.drawImage(s.canvas, -i * W * 0.05 * k, 0);
          }
          ctx.globalAlpha = 1;
        }
        break;
      }
      case "vhs": {
        ctx.globalAlpha = 0.16 * k;
        ctx.fillStyle = "#000";
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
        ctx.globalAlpha = 0.1 * k;
        ctx.fillStyle = "#00e0ff";
        ctx.fillRect(0, ((t * 120) % H) - 40, W, 40);
        break;
      }
      case "film-grain": {
        ctx.globalAlpha = 0.06 + 0.12 * k;
        const step = Math.max(2, Math.round(W / 220));
        for (let i = 0; i < 900; i++) {
          const seed = Math.floor(t * 24) * 900 + i;
          const gx = rand(seed) * W;
          const gy = rand(seed + 5) * H;
          ctx.fillStyle = rand(seed + 9) > 0.5 ? "#ffffff" : "#000000";
          ctx.fillRect(gx, gy, step, step);
        }
        break;
      }
      case "light-leak": {
        const cxp = (p * 1.4 - 0.2) * W;
        const g = ctx.createLinearGradient(cxp - W * 0.3, 0, cxp + W * 0.3, H);
        g.addColorStop(0, "rgba(255,140,60,0)");
        g.addColorStop(0.5, `rgba(255,170,80,${0.45 * k})`);
        g.addColorStop(1, "rgba(255,90,140,0)");
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case "vignette": {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${0.75 * k})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.setTransform(outer);
}
