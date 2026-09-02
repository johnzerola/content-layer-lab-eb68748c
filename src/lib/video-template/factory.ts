/** Criação de documentos e camadas de template + catálogos (filtros, animações, blocos). */
import {
  ASPECT_SIZES,
  NEUTRAL_FILTER,
  TEMPLATE_DOC_VERSION,
  type AspectRatio,
  type CaptionLayer,
  type FilterValues,
  type ImageLayer,
  type ShapeLayer,
  type TemplateDoc,
  type TemplateLayer,
  type TextLayer,
  type VideoLayer,
} from "./types";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `l_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function createTemplateDoc(name = "Novo template", aspectRatio: AspectRatio = "9:16"): TemplateDoc {
  const size = ASPECT_SIZES[aspectRatio];
  return {
    version: TEMPLATE_DOC_VERSION,
    name,
    aspectRatio,
    canvas: { width: size.width, height: size.height, background: { kind: "color", color: "#000000" } },
    filter: { ...NEUTRAL_FILTER },
    layers: [],
    sampleVideoUrl: null,
  };
}

function base(type: TemplateLayer["type"], name: string, zIndex: number) {
  return {
    id: uid(),
    name,
    type,
    bindingType: "STATIC" as const,
    x: 10,
    y: 35,
    width: 80,
    height: 20,
    rotation: 0,
    opacity: 1,
    zIndex,
    visible: true,
    locked: false,
    flipX: false,
    flipY: false,
    startTime: 0,
    endTime: null,
    animationIn: null,
    animationOut: null,
    animationLoop: null,
    filter: null,
  };
}

export function nextZ(layers: TemplateLayer[]): number {
  return layers.reduce((m, l) => Math.max(m, l.zIndex), -1) + 1;
}

export function createTextLayer(layers: TemplateLayer[], text = "Seu título aqui"): TextLayer {
  return {
    ...base("text", "Texto", nextZ(layers)),
    type: "text",
    text,
    fontFamily: "Outfit, sans-serif",
    fontWeight: 800,
    fontSize: 72,
    color: "#ffffff",
    align: "center",
    letterSpacing: 0,
    lineHeight: 1.15,
    uppercase: false,
    italic: false,
    underline: false,
    strokeColor: "#000000",
    strokeWidth: 0,
    shadow: true,
    background: null,
    padding: 16,
    radius: 16,
    height: 12,
  };
}

export function createImageLayer(layers: TemplateLayer[], src: string | null = null): ImageLayer {
  return {
    ...base("image", "Imagem", nextZ(layers)),
    type: "image",
    src,
    fit: "cover",
    radius: 0,
    width: 40,
    height: 25,
  };
}

export function createLogoLayer(layers: TemplateLayer[], src: string | null = null): ImageLayer {
  return {
    ...createImageLayer(layers, src),
    name: "Logo",
    bindingType: "USER_LOGO",
    x: 72,
    y: 4,
    width: 22,
    height: 8,
    fit: "contain",
  };
}

export function createVideoLayer(layers: TemplateLayer[], src: string | null = null): VideoLayer {
  return {
    ...base("video", "Vídeo", nextZ(layers)),
    type: "video",
    src,
    fit: "cover",
    radius: 0,
    muted: false,
    volume: 1,
    speed: 1,
    loop: true,
    backgroundBlur: 0,
    mask: "none",
    chromaKey: null,
    x: 0,
    y: 20,
    width: 100,
    height: 60,
  };
}

export function createCutVideoLayer(layers: TemplateLayer[]): VideoLayer {
  return { ...createVideoLayer(layers), name: "Vídeo do corte", bindingType: "CUT_VIDEO" };
}

export function createCutCoverLayer(layers: TemplateLayer[]): ImageLayer {
  return {
    ...createImageLayer(layers),
    name: "Capa do corte",
    bindingType: "CUT_COVER",
    x: 10,
    y: 6,
    width: 80,
    height: 20,
    fit: "cover",
    radius: 24,
  };
}

export function createShapeLayer(layers: TemplateLayer[], shape: ShapeLayer["shape"] = "rounded"): ShapeLayer {
  return {
    ...base("shape", "Forma", nextZ(layers)),
    type: "shape",
    shape,
    fill: "#7c5cff",
    stroke: "#00000000",
    strokeWidth: 0,
    radius: 24,
    width: 40,
    height: 10,
  };
}

export const CAPTION_STYLE_PRESETS: { id: string; label: string; style: Partial<CaptionLayer["style"]> }[] = [
  { id: "clean-white", label: "Branco Limpo", style: { color: "#ffffff", highlightColor: "#ffffff", strokeWidth: 6 } },
  { id: "yellow-pop", label: "Amarelo Pop", style: { color: "#ffffff", highlightColor: "#ffe600", strokeWidth: 10, uppercase: true } },
  { id: "green-fresh", label: "Verde Fresco", style: { color: "#ffffff", highlightColor: "#31f39a", strokeWidth: 8 } },
  { id: "punch", label: "Punch", style: { color: "#ffffff", highlightColor: "#ff3b6b", strokeWidth: 12, uppercase: true, fontWeight: 900 } },
  { id: "editorial", label: "Editorial", style: { color: "#f4f1ea", highlightColor: "#c8a24a", strokeWidth: 0, fontWeight: 600 } },
  { id: "condensed", label: "Condensado", style: { color: "#ffffff", highlightColor: "#00e0ff", maxWords: 3, uppercase: true } },
  { id: "karaoke", label: "Karaokê", style: { mode: "karaoke", highlight: "box", highlightColor: "#7c5cff" } },
  { id: "word", label: "Palavra a palavra", style: { mode: "word", maxWords: 1, fontWeight: 900 } },
  { id: "bold-box", label: "Caixa Sólida", style: { background: "#000000", highlight: "box", highlightColor: "#ffe600" } },
  { id: "minimal", label: "Minimal", style: { fontWeight: 500, strokeWidth: 0, shadow: false, color: "#ffffff" } },
  { id: "rainbow", label: "Colorido", style: { color: "#ffffff", highlightColor: "#ff8a00", highlight: "underline" } },
  { id: "impact", label: "Impacto", style: { fontWeight: 900, fontSize: 84, uppercase: true, strokeWidth: 14 } },
];

export function createCaptionLayer(layers: TemplateLayer[], presetId = "yellow-pop"): CaptionLayer {
  const preset = CAPTION_STYLE_PRESETS.find((p) => p.id === presetId);
  return {
    ...base("caption", "Área das legendas", nextZ(layers)),
    type: "caption",
    bindingType: "CAPTIONS",
    presetId,
    x: 10,
    y: 68,
    width: 80,
    height: 16,
    style: {
      fontFamily: "Outfit, sans-serif",
      fontWeight: 800,
      fontSize: 64,
      color: "#ffffff",
      highlight: "color",
      highlightColor: "#ffe600",
      background: null,
      strokeColor: "#000000",
      strokeWidth: 10,
      shadow: true,
      uppercase: false,
      maxWords: 4,
      maxLines: 2,
      align: "center",
      mode: "karaoke",
      ...(preset?.style ?? {}),
    },
  };
}

/* --------------------------------------------------------------- Catálogos */

export const FILTER_PRESETS: { id: string; label: string; category: string; values: FilterValues }[] = [
  { id: "none", label: "Nenhum", category: "Todos", values: { ...NEUTRAL_FILTER } },
  { id: "vintage", label: "Vintage", category: "Retrô", values: { ...NEUTRAL_FILTER, sepia: 0.32, contrast: 1.05, saturation: 0.9, temperature: 12 } },
  { id: "faded", label: "Filme Desbotado", category: "Retrô", values: { ...NEUTRAL_FILTER, contrast: 0.9, saturation: 0.8, brightness: 1.06 } },
  { id: "polaroid", label: "Polaroid", category: "Retrô", values: { ...NEUTRAL_FILTER, sepia: 0.18, brightness: 1.08, saturation: 0.95, temperature: 8 } },
  { id: "vhs", label: "VHS", category: "Retrô", values: { ...NEUTRAL_FILTER, saturation: 1.25, contrast: 1.12, hue: -6, blur: 0.4 } },
  { id: "retro-pop", label: "Retro Pop", category: "Vibrante", values: { ...NEUTRAL_FILTER, saturation: 1.45, contrast: 1.1, hue: 6 } },
  { id: "teal-orange", label: "Teal & Orange", category: "Cinema", values: { ...NEUTRAL_FILTER, saturation: 1.2, contrast: 1.15, temperature: 14 } },
  { id: "blockbuster", label: "Blockbuster", category: "Cinema", values: { ...NEUTRAL_FILTER, contrast: 1.25, saturation: 1.1, brightness: 0.97, temperature: -6 } },
  { id: "noir", label: "Noir", category: "P&B", values: { ...NEUTRAL_FILTER, grayscale: 1, contrast: 1.3 } },
  { id: "warm", label: "Quente", category: "Clima", values: { ...NEUTRAL_FILTER, temperature: 22, brightness: 1.03 } },
  { id: "cold", label: "Frio", category: "Clima", values: { ...NEUTRAL_FILTER, temperature: -22, brightness: 1.01 } },
  { id: "high-contrast", label: "Alto Contraste", category: "Cor", values: { ...NEUTRAL_FILTER, contrast: 1.4, saturation: 1.1 } },
  { id: "desaturated", label: "Dessaturado", category: "Cor", values: { ...NEUTRAL_FILTER, saturation: 0.55 } },
];

export const FILTER_CATEGORIES = ["Todos", "Retrô", "Cinema", "Clima", "P&B", "Cor", "Vibrante"];

export const ANIMATION_PRESETS: { id: string; label: string; category: string; type: string }[] = [
  { id: "fade", label: "Fade", category: "Texto", type: "fadeIn" },
  { id: "slide-up", label: "Slide Up", category: "Texto", type: "slideUp" },
  { id: "slide-down", label: "Slide Down", category: "Texto", type: "slideDown" },
  { id: "slide-left", label: "Slide Left", category: "Lower thirds", type: "slideLeft" },
  { id: "slide-right", label: "Slide Right", category: "Lower thirds", type: "slideRight" },
  { id: "scale", label: "Scale", category: "Social", type: "scaleIn" },
  { id: "bounce", label: "Bounce", category: "Social", type: "bounce" },
  { id: "pop", label: "Pop", category: "CTA", type: "pop" },
  { id: "typewriter", label: "Typewriter", category: "Texto", type: "typewriter" },
  { id: "zoom", label: "Zoom", category: "Transições", type: "zoom" },
  { id: "pulse", label: "Pulse", category: "CTA", type: "pulse" },
];

export const ANIMATION_CATEGORIES = ["Todas", "Social", "CTA", "Lower thirds", "Texto", "Transições"];

export const TEMPLATE_CATEGORIES = [
  "TikTok",
  "Reels",
  "Shorts",
  "Podcast",
  "Gaming",
  "Educação",
  "Vendas",
  "Marketing",
];

/** Blocos prontos: um clique adiciona várias camadas coerentes. */
export const BLOCKS: { id: string; label: string; build: (layers: TemplateLayer[]) => TemplateLayer[] }[] = [
  {
    id: "titulo",
    label: "Título",
    build: (l) => [{ ...createTextLayer(l, "TÍTULO DE IMPACTO"), y: 6, uppercase: true, name: "Título" }],
  },
  {
    id: "lower-third",
    label: "Lower third",
    build: (l) => {
      const bar = { ...createShapeLayer(l, "rounded"), x: 6, y: 74, width: 60, height: 8, name: "Barra" };
      const txt = { ...createTextLayer([...l, bar], "Nome do convidado"), x: 8, y: 75.5, width: 56, height: 5, fontSize: 46, align: "left" as const, name: "Nome" };
      return [bar, txt];
    },
  },
  {
    id: "cta",
    label: "CTA",
    build: (l) => {
      const box = { ...createShapeLayer(l, "rounded"), x: 22, y: 86, width: 56, height: 7, fill: "#7c5cff", name: "Botão CTA" };
      const txt = {
        ...createTextLayer([...l, box], "SIGA PARA MAIS"),
        x: 22,
        y: 87.4,
        width: 56,
        height: 4.5,
        fontSize: 44,
        uppercase: true,
        name: "Texto CTA",
        animationIn: { type: "pop", duration: 0.4, delay: 0.2, easing: "easeOut" as const },
      };
      return [box, txt];
    },
  },
  {
    id: "barra-superior",
    label: "Barra superior",
    build: (l) => [{ ...createShapeLayer(l, "rect"), x: 0, y: 0, width: 100, height: 6, fill: "#0d0d0f", name: "Barra superior" }],
  },
  {
    id: "barra-inferior",
    label: "Barra inferior",
    build: (l) => [{ ...createShapeLayer(l, "rect"), x: 0, y: 94, width: 100, height: 6, fill: "#0d0d0f", name: "Barra inferior" }],
  },
  {
    id: "badge",
    label: "Badge",
    build: (l) => {
      const box = { ...createShapeLayer(l, "rounded"), x: 6, y: 5, width: 26, height: 5, fill: "#ff2d55", name: "Badge" };
      const txt = { ...createTextLayer([...l, box], "AO VIVO"), x: 6, y: 6, width: 26, height: 3.4, fontSize: 34, uppercase: true, name: "Texto badge" };
      return [box, txt];
    },
  },
  {
    id: "username",
    label: "Username",
    build: (l) => [{ ...createTextLayer(l, "@seuperfil"), x: 6, y: 88, width: 50, height: 4, fontSize: 38, align: "left" as const, name: "Username" }],
  },
  {
    id: "follow",
    label: "Follow",
    build: (l) => {
      const box = { ...createShapeLayer(l, "rounded"), x: 66, y: 87, width: 28, height: 6, fill: "#ffffff", name: "Follow" };
      const txt = { ...createTextLayer([...l, box], "SEGUIR"), x: 66, y: 88.2, width: 28, height: 4, fontSize: 36, color: "#0d0d0f", uppercase: true, name: "Texto follow" };
      return [box, txt];
    },
  },
  {
    id: "progress",
    label: "Progress bar",
    build: (l) => [{ ...createShapeLayer(l, "rect"), x: 0, y: 97.5, width: 100, height: 1.2, fill: "#7c5cff", name: "Progresso" }],
  },
];

/** Converte os valores do filtro em uma string CSS `filter`. */
export function filterToCss(f?: Partial<FilterValues> | null): string {
  if (!f) return "none";
  const v = { ...NEUTRAL_FILTER, ...f };
  const parts = [
    `brightness(${v.brightness})`,
    `contrast(${v.contrast})`,
    `saturate(${v.saturation})`,
    `hue-rotate(${v.hue + v.temperature * 0.4}deg)`,
    `sepia(${v.sepia})`,
    `grayscale(${v.grayscale})`,
  ];
  if (v.blur > 0) parts.push(`blur(${v.blur}px)`);
  return parts.join(" ");
}
