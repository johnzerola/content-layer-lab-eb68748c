export interface CaptionWordMotionFrame {
  scale: number;
  translateX: number;
  translateY: number;
  opacity: number;
  glow: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - value) ** 3;
const easeOutBack = (value: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
};

/**
 * Shared caption motion contract for browser preview and exported frames.
 * Translation values are expressed in em so the motion follows font size.
 */
export function captionWordMotionFrame(
  motion: string,
  time: number,
  start: number,
  end: number,
  index: number,
  active: boolean,
): CaptionWordMotionFrame {
  const duration = Math.max(0.08, end - start);
  const entryDuration = Math.min(0.2, duration * 0.55);
  const entry = easeOut(clamp01((time - start) / Math.max(0.06, entryDuration)));
  const phase = clamp01((time - start) / duration);
  const still = { scale: 1, translateX: 0, translateY: 0, opacity: 1, glow: 0 };

  if (motion === "wave") {
    return { ...still, translateY: Math.sin(time * 8 + index * 0.9) * 0.09 };
  }
  if (!active || motion === "none") return still;
  if (motion === "pop") return { ...still, scale: 0.68 + easeOutBack(clamp01((time - start) / entryDuration)) * 0.32 };
  if (motion === "scale") return { ...still, scale: 0.84 + entry * 0.16 + Math.sin(phase * Math.PI) * 0.04 };
  if (motion === "bounce") return { ...still, scale: 0.86 + entry * 0.14, translateY: -Math.sin(entry * Math.PI) * 0.18 };
  if (motion === "fade") return { ...still, opacity: entry };
  if (motion === "slide") return { ...still, translateY: (1 - entry) * 0.34, opacity: clamp01(entry * 1.35) };
  if (motion === "glow") return { ...still, scale: 0.96 + entry * 0.04, glow: 0.55 + Math.sin(phase * Math.PI) * 0.45 };
  if (motion === "shake") return { ...still, translateX: Math.sin(time * 68) * 0.075 * (1 - phase * 0.55) };
  if (motion === "typewriter") return { ...still, opacity: clamp01(entry * 1.5), translateY: (1 - entry) * 0.08 };
  return still;
}
