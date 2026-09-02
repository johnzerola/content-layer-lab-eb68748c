import type { PreEdit } from "./preedit";

/** Campos de cor/estilo que um "look" controla. */
export type LookPatch = Pick<
  PreEdit,
  "brightness" | "contrast" | "saturation" | "hue" | "sepia" | "grayscale" | "blur"
> & {
  temp: number;
  vignette: number;
  grain: number;
  fade: number;
};

export interface Look {
  id: string;
  label: string;
  hint: string;
  /** cores só para a miniatura do card */
  swatch: [string, string];
  v: LookPatch;
}

const base: LookPatch = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  blur: 0,
  temp: 0,
  vignette: 0,
  grain: 0,
  fade: 0,
};

const look = (id: string, label: string, hint: string, swatch: [string, string], v: Partial<LookPatch>): Look => ({
  id,
  label,
  hint,
  swatch,
  v: { ...base, ...v },
});

/** Estilos de edição prontos: mudam só o "look" do vídeo, como se fosse outro vídeo. */
export const LOOKS: Look[] = [
  look("original", "Original", "Sem tratamento de cor", ["#3f3f46", "#71717a"], {}),
  look("cinema", "Cinemático", "Contraste alto, preto lavado e vinheta de cinema", ["#0e2a33", "#e0894a"], {
    brightness: 0.97,
    contrast: 1.25,
    saturation: 0.92,
    temp: 0.25,
    vignette: 0.35,
    fade: 0.18,
    grain: 0.12,
  }),
  look("teal-orange", "Teal & Orange", "Pele quente com sombras azuladas (look de trailer)", ["#12464f", "#ff9243"], {
    contrast: 1.2,
    saturation: 1.18,
    hue: -6,
    temp: 0.45,
    vignette: 0.28,
  }),
  look("dark", "Dark Moody", "Escuro, denso e sério — ideal para storytelling", ["#07070b", "#3b3b52"], {
    brightness: 0.86,
    contrast: 1.32,
    saturation: 0.82,
    temp: -0.25,
    vignette: 0.5,
    grain: 0.15,
  }),
  look("vivid", "Saturado Viral", "Cores estouradas que seguram o olho no feed", ["#ff2f6d", "#ffd23f"], {
    brightness: 1.07,
    contrast: 1.22,
    saturation: 1.55,
    vignette: 0.12,
  }),
  look("clean", "Clean Bright", "Claro e limpo, estilo lifestyle", ["#f5f1e8", "#9fd8c8"], {
    brightness: 1.12,
    contrast: 1.04,
    saturation: 1.08,
    temp: 0.1,
    fade: 0.12,
  }),
  look("vhs", "VHS Retro", "Granulado forte, cor lavada e vinheta de fita", ["#5a3f7a", "#d78ac4"], {
    brightness: 1.03,
    contrast: 0.95,
    saturation: 1.25,
    hue: -10,
    grain: 0.55,
    fade: 0.3,
    vignette: 0.35,
    blur: 0.4,
  }),
  look("film35", "Filme 35mm", "Grão fino, sépia leve e sombras suaves", ["#2b2118", "#c9a06b"], {
    brightness: 0.99,
    contrast: 1.12,
    saturation: 0.95,
    sepia: 0.18,
    temp: 0.2,
    grain: 0.35,
    fade: 0.22,
    vignette: 0.25,
  }),
  look("noir", "Noir P&B", "Preto e branco com contraste duro", ["#000000", "#e5e5e5"], {
    contrast: 1.4,
    grayscale: 1,
    vignette: 0.45,
    grain: 0.25,
  }),
  look("neon", "Neon Noite", "Frio, saturado e urbano", ["#0a1030", "#28e0ff"], {
    brightness: 0.94,
    contrast: 1.28,
    saturation: 1.4,
    hue: 8,
    temp: -0.45,
    vignette: 0.4,
  }),
  look("sunset", "Pôr do Sol", "Dourado quente e aconchegante", ["#7a2f14", "#ffc46b"], {
    brightness: 1.04,
    contrast: 1.1,
    saturation: 1.2,
    sepia: 0.12,
    temp: 0.6,
    vignette: 0.2,
  }),
  look("dream", "Sonho Suave", "Névoa leve, pele macia e cor pastel", ["#f0c8e0", "#bfd8f5"], {
    brightness: 1.08,
    contrast: 0.94,
    saturation: 1.05,
    blur: 0.6,
    fade: 0.35,
    temp: 0.15,
  }),
];

export const LOOK_BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

/** Patch pronto para aplicar no PreEdit (inclui o id do look). */
export function applyLook(id: string): Partial<PreEdit> {
  const l = LOOK_BY_ID.get(id) ?? LOOKS[0]!;
  return { ...l.v, look: l.id };
}

/** CSS filter equivalente ao look — usado nas miniaturas da galeria. */
export function lookPreviewFilter(l: Look) {
  const v = l.v;
  const parts = [
    `brightness(${v.brightness})`,
    `contrast(${v.contrast})`,
    `saturate(${v.saturation})`,
  ];
  if (v.hue) parts.push(`hue-rotate(${v.hue}deg)`);
  if (v.sepia) parts.push(`sepia(${v.sepia})`);
  if (v.grayscale) parts.push(`grayscale(${v.grayscale})`);
  return parts.join(" ");
}
