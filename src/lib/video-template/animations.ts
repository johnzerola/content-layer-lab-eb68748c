/** Catálogo de animações de camada + tradução para CSS (prévia no canvas). */
import type { AnimationSpec, Easing } from "./types";

export interface AnimationOption {
  id: string;
  label: string;
  category: string;
  /** nome do keyframe declarado em src/styles.css (tpl-*) */
  keyframe: string;
}

export const LAYER_ANIMATIONS: AnimationOption[] = [
  { id: "fadeIn", label: "Fade", category: "Básico", keyframe: "tpl-fadeIn" },
  { id: "slideUp", label: "Subir", category: "Básico", keyframe: "tpl-slideUp" },
  { id: "slideDown", label: "Descer", category: "Básico", keyframe: "tpl-slideDown" },
  { id: "slideLeft", label: "Entrar ←", category: "Básico", keyframe: "tpl-slideLeft" },
  { id: "slideRight", label: "Entrar →", category: "Básico", keyframe: "tpl-slideRight" },
  { id: "scaleIn", label: "Escala", category: "Impacto", keyframe: "tpl-scaleIn" },
  { id: "zoom", label: "Zoom", category: "Impacto", keyframe: "tpl-zoom" },
  { id: "pop", label: "Pop", category: "Impacto", keyframe: "tpl-pop" },
  { id: "bounce", label: "Bounce", category: "Impacto", keyframe: "tpl-bounce" },
  { id: "spin", label: "Giro", category: "Impacto", keyframe: "tpl-spin" },
  { id: "flip", label: "Flip 3D", category: "Impacto", keyframe: "tpl-flip" },
  { id: "blurIn", label: "Desfoque", category: "Cinema", keyframe: "tpl-blurIn" },
  { id: "typewriter", label: "Máquina", category: "Texto", keyframe: "tpl-typewriter" },
  { id: "pulse", label: "Pulsar", category: "Loop", keyframe: "tpl-pulse" },
  { id: "float", label: "Flutuar", category: "Loop", keyframe: "tpl-float" },
  { id: "shake", label: "Tremer", category: "Loop", keyframe: "tpl-shake" },
];

export const ANIMATION_GROUPS = ["Básico", "Impacto", "Cinema", "Texto", "Loop"];

const EASING_CSS: Record<Easing, string> = {
  linear: "linear",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
};

export function findAnimation(type: string | undefined | null): AnimationOption | null {
  return LAYER_ANIMATIONS.find((a) => a.id === type) ?? null;
}

export function defaultAnimation(type: string, loop = false): AnimationSpec {
  return { type, duration: 0.6, delay: 0, easing: "easeOut", speed: 1, direction: "normal", ...(loop ? {} : {}) };
}

/** `animation` CSS de uma camada — usado só na prévia do editor. */
export function animationCss(spec: AnimationSpec | null | undefined, loop = false): string | undefined {
  const option = findAnimation(spec?.type);
  if (!spec || !option) return undefined;
  const speed = spec.speed && spec.speed > 0 ? spec.speed : 1;
  const dur = Math.max(0.05, spec.duration / speed);
  const direction = spec.direction ?? "normal";
  const count = loop ? "infinite" : "1";
  return `${option.keyframe} ${dur}s ${EASING_CSS[spec.easing]} ${spec.delay}s ${count} ${direction} both`;
}
