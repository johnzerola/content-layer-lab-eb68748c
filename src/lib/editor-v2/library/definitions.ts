import type { EffectDefinition, TemplateDefinition, TransitionDefinition } from "./types";

const transitionRows: [string, string, string][] = [
  ["cut", "Cut", "cut"], ["cross-dissolve", "Cross Dissolve", "cross-dissolve"], ["fade", "Fade", "fade"],
  ["fade-black", "Fade Black", "fade-black"], ["fade-white", "Fade White", "fade-white"],
  ["slide-left", "Slide Left", "slide-left"], ["slide-right", "Slide Right", "slide-right"],
  ["slide-up", "Slide Up", "slide-up"], ["slide-down", "Slide Down", "slide-down"],
  ["push", "Push", "push"], ["wipe", "Wipe", "wipe"], ["blur", "Blur", "blur"],
  ["zoom-in", "Zoom In", "zoom-in"], ["zoom-out", "Zoom Out", "zoom-out"],
];

export const TRANSITION_DEFINITIONS: TransitionDefinition[] = transitionRows.map(([id, name, rendererId]) => ({ id, name, rendererId, durationDefault: id === "cut" ? 0 : 0.45, durationMin: id === "cut" ? 0 : 0.1, durationMax: id === "cut" ? 0 : 2, parameters: {} }));

const effects = [
  ["brightness", "Brilho", -1, 1, 0], ["contrast", "Contraste", 0, 2, 1], ["saturation", "Saturação", 0, 2, 1],
  ["temperature", "Temperatura", -1, 1, 0], ["tint", "Matiz", -1, 1, 0], ["opacity", "Opacidade", 0, 1, 1],
  ["blur", "Desfoque", 0, 20, 0], ["sharpen", "Nitidez leve", 0, 1, 0], ["vignette", "Vinheta", 0, 1, 0],
] as const;

export const EFFECT_DEFINITIONS: EffectDefinition[] = effects.map(([id, name, min, max, initial]) => ({
  id, name, rendererId: id, parameters: { amount: { min, max, default: initial } },
  createInstance(instanceId) {
    return { id: instanceId, definitionId: id, enabled: true, parameters: { amount: initial } };
  },
}));

export interface PreviewFrameStyle {
  incoming: { opacity: number; x: number; y: number; scale: number; blur: number; clip: number };
  outgoing: { opacity: number; x: number; y: number; scale: number; blur: number; clip: number };
  overlay?: string;
}

export function transitionFrame(rendererId: string, progress: number): PreviewFrameStyle {
  const p = Math.max(0, Math.min(1, progress));
  const base: PreviewFrameStyle = { incoming: { opacity: 1, x: 0, y: 0, scale: 1, blur: 0, clip: 1 }, outgoing: { opacity: 1 - p, x: 0, y: 0, scale: 1, blur: 0, clip: 1 } };
  if (rendererId === "cut") return { ...base, incoming: { ...base.incoming, opacity: p < 0.5 ? 0 : 1 }, outgoing: { ...base.outgoing, opacity: p < 0.5 ? 1 : 0 } };
  if (["cross-dissolve", "fade"].includes(rendererId)) return { ...base, incoming: { ...base.incoming, opacity: p } };
  if (rendererId === "fade-black" || rendererId === "fade-white") return { ...base, incoming: { ...base.incoming, opacity: Math.max(0, p * 2 - 1) }, outgoing: { ...base.outgoing, opacity: Math.max(0, 1 - p * 2) }, overlay: rendererId === "fade-black" ? "#050507" : "#ffffff" };
  if (rendererId.startsWith("slide-") || rendererId === "push") {
    const x = rendererId === "slide-right" ? 1 - p : rendererId === "slide-left" || rendererId === "push" ? p - 1 : 0;
    const y = rendererId === "slide-down" ? 1 - p : rendererId === "slide-up" ? p - 1 : 0;
    return { ...base, incoming: { ...base.incoming, x, y }, outgoing: { ...base.outgoing, opacity: 1, x: rendererId === "push" ? p : 0 } };
  }
  if (rendererId === "wipe") return { ...base, incoming: { ...base.incoming, clip: p } };
  if (rendererId === "blur") return { ...base, incoming: { ...base.incoming, opacity: p, blur: (1 - p) * 14 }, outgoing: { ...base.outgoing, blur: p * 14 } };
  if (rendererId === "zoom-in" || rendererId === "zoom-out") return { ...base, incoming: { ...base.incoming, opacity: p, scale: rendererId === "zoom-in" ? 0.75 + p * 0.25 : 1.25 - p * 0.25 } };
  return base;
}

export function validateTemplateDefinition(template: TemplateDefinition): string[] {
  const errors: string[] = [];
  if (!template.id.trim()) errors.push("id é obrigatório");
  if (!template.name.trim()) errors.push("name é obrigatório");
  if (!Number.isFinite(template.duration) || template.duration <= 0) errors.push("duration deve ser positiva");
  if (!template.aspectRatios.length) errors.push("aspectRatios é obrigatório");
  if (new Set(template.placeholders.map((item) => item.id)).size !== template.placeholders.length) errors.push("placeholder duplicado");
  return errors;
}
