/**
 * TEMPLATES DE ESTILO COMPLETO — derivados dos LAYOUTS REAIS do editor
 * (`READY_TEMPLATES`). Cada item usa a paleta, a tipografia e a transição
 * exatas do layout correspondente, então aplicar aqui e aplicar o layout
 * produzem o mesmo visual. Só apresentação, nenhuma regra de negócio nova.
 */
import type { CaptionAnimation } from "@/lib/editor/caption-styles";
import type { TransitionKind } from "@/lib/preedit";
import { READY_TEMPLATES } from "@/lib/editor/template-presets";
import { DEFAULT_BRAND_KIT } from "@/lib/brand-kit";

export interface StyleTemplate {
  id: string;
  label: string;
  hint: string;
  /** preset de legenda usado como base */
  presetId: string;
  /** [texto, destaque, contorno/fundo] */
  colors: [string, string, string];
  fontFamily: string;
  fontWeight: number;
  uppercase: boolean;
  animation: CaptionAnimation;
  transition: TransitionKind;
  /** gradiente do card (CSS pronto — cores reais do layout) */
  gradient: string;
}

const VALID_TRANSITIONS: TransitionKind[] = [
  "none",
  "fade",
  "zoom",
  "zoom-out",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "whip",
  "whip-vertical",
  "punch",
  "drift",
  "swing",
  "flash",
];

function toTransition(kind: string | undefined): TransitionKind {
  const found = VALID_TRANSITIONS.find((k) => k === kind);
  if (found) return found;
  if (kind?.startsWith("whip")) return "whip";
  return "fade";
}

/** legenda e animação que combinam com cada layout real */
const CAPTION_OF: Record<string, { presetId: string; animation: CaptionAnimation; uppercase: boolean; weight: number }> = {
  "hook-topo": { presetId: "punch-yellow", animation: "bounce", uppercase: true, weight: 900 },
  "fato-fake": { presetId: "verde-impacto", animation: "pop", uppercase: true, weight: 900 },
  "handle-cta": { presetId: "clean-bold", animation: "pop", uppercase: true, weight: 800 },
  "lower-third": { presetId: "minimal-white", animation: "fade", uppercase: false, weight: 700 },
  "barra-progresso": { presetId: "clean-bold", animation: "fade", uppercase: false, weight: 700 },
  "titulo-caixa": { presetId: "subtitle-box", animation: "slide", uppercase: true, weight: 900 },
  "marca-canto": { presetId: "minimal-white", animation: "fade", uppercase: false, weight: 600 },
  "legenda-hook-3": { presetId: "clean-bold", animation: "slide", uppercase: true, weight: 800 },
  "quote-editorial": { presetId: "minimal-white", animation: "fade", uppercase: false, weight: 700 },
  contagem: { presetId: "punch-yellow", animation: "bounce", uppercase: true, weight: 900 },
  "cta-inscreva": { presetId: "punch-yellow", animation: "pop", uppercase: true, weight: 900 },
  "faixa-lateral": { presetId: "verde-impacto", animation: "slide", uppercase: true, weight: 900 },
};

export const STYLE_TEMPLATES: StyleTemplate[] = READY_TEMPLATES.map((t) => {
  const palette = { ...DEFAULT_BRAND_KIT, ...(t.palette ?? {}) };
  const caption = CAPTION_OF[t.id] ?? {
    presetId: "clean-bold",
    animation: "pop" as CaptionAnimation,
    uppercase: true,
    weight: 800,
  };
  return {
    id: t.id,
    label: t.label,
    hint: t.hint,
    presetId: caption.presetId,
    colors: [palette.text, palette.primary, palette.background] as [string, string, string],
    fontFamily: palette.headingFont,
    fontWeight: caption.weight,
    uppercase: caption.uppercase,
    animation: caption.animation,
    transition: toTransition(t.transition?.kind),
    gradient: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.background} 78%)`,
  } satisfies StyleTemplate;
});
