/**
 * Desenho do vídeo com a pré-edição aplicada (recorte, keyframes, giro,
 * espelho, fundo e correção de cor).
 *
 * É o MESMO módulo usado pela prévia do editor (`MediaStage`) e pela
 * exportação (`render-template.ts`), então o que aparece na tela é o que sai
 * no MP4.
 */
import { cropRect, type PreEdit } from "@/lib/preedit";

export interface MediaFrame {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** giros de 90° já normalizados (0..3) */
  quarter: number;
  /** dimensões efetivas depois do giro */
  ew: number;
  eh: number;
  flipH: boolean;
  flipV: boolean;
  bg: { mode: "blur" | "color"; blur: number; color: string } | null;
}

export interface MediaRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fit: "cover" | "contain" | "fill";
  radius?: number;
  circle?: boolean;
}

/** Recorte + giro + espelho + fundo válidos no instante `t` da fonte. */
export function mediaFrameFromPre(
  pre: PreEdit | null | undefined,
  width: number,
  height: number,
  t?: number,
): MediaFrame {
  const rect = cropRect(pre, width, height, t);
  const layout = pre?.layout ?? "auto";
  const wantsBg = layout === "blur" || layout === "centered" || layout === "fit" || layout === "horizontal";
  return {
    sx: rect.sx,
    sy: rect.sy,
    sw: rect.sw,
    sh: rect.sh,
    quarter: rect.quarter,
    ew: rect.ew,
    eh: rect.eh,
    flipH: Boolean(pre?.flipH),
    flipV: Boolean(pre?.flipV),
    bg: wantsBg
      ? {
          mode: pre?.bgMode ?? "blur",
          blur: pre?.bgBlur ?? 1,
          color: pre?.bgColor ?? "#000000",
        }
      : null,
  };
}

/** Ajuste de escala da fonte (já girada) dentro do retângulo de destino. */
function fitScale(frame: MediaFrame, rect: MediaRect) {
  const fx = rect.w / Math.max(1, frame.ew);
  const fy = rect.h / Math.max(1, frame.eh);
  if (rect.fit === "fill") return { fx, fy };
  const f = rect.fit === "contain" ? Math.min(fx, fy) : Math.max(fx, fy);
  return { fx: f, fy: f };
}

function paint(
  ctx: CanvasRenderingContext2D,
  el: CanvasImageSource,
  frame: MediaFrame,
  rect: MediaRect,
  scale: { fx: number; fy: number },
) {
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(scale.fx, scale.fy);
  if (frame.quarter) ctx.rotate((frame.quarter * Math.PI) / 2);
  if (frame.flipH) ctx.scale(-1, 1);
  if (frame.flipV) ctx.scale(1, -1);
  ctx.drawImage(el, frame.sx, frame.sy, frame.sw, frame.sh, -frame.sw / 2, -frame.sh / 2, frame.sw, frame.sh);
  ctx.restore();
}

/**
 * Desenha o vídeo no retângulo pedido com recorte, giro, espelho e fundo.
 * `grade` é o filtro de cor da pré-edição (só afeta a imagem, não o texto).
 */
export function drawMediaFrame(
  ctx: CanvasRenderingContext2D,
  el: CanvasImageSource,
  frame: MediaFrame,
  rect: MediaRect,
  grade = "none",
) {
  ctx.save();
  ctx.beginPath();
  const radius = rect.circle ? Math.min(rect.w, rect.h) / 2 : (rect.radius ?? 0);
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();

  const scale = fitScale(frame, rect);
  const letterboxed = scale.fx * frame.ew < rect.w - 1 || scale.fy * frame.eh < rect.h - 1;

  if (frame.bg && letterboxed) {
    if (frame.bg.mode === "color") {
      ctx.save();
      ctx.filter = "none";
      ctx.fillStyle = frame.bg.color;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    } else {
      const cover = Math.max(rect.w / Math.max(1, frame.ew), rect.h / Math.max(1, frame.eh)) * 1.08;
      ctx.save();
      ctx.filter = `blur(${Math.max(4, 28 * (frame.bg.blur || 1))}px) brightness(0.65)`;
      paint(ctx, el, frame, rect, { fx: cover, fy: cover });
      ctx.restore();
    }
  }

  ctx.filter = grade && grade !== "none" ? grade : "none";
  paint(ctx, el, frame, rect, scale);
  ctx.filter = "none";
  ctx.restore();
}
