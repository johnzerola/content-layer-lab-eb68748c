/** Biblioteca original de estilos de legenda do VaiViral. */
import type { CaptionLayerStyle } from "@/lib/video-template/types";

export type CaptionCategory =
  | "todos"
  | "populares"
  | "basico"
  | "impacto"
  | "minimalista"
  | "podcast"
  | "viral"
  | "karaoke"
  | "gaming"
  | "news"
  | "business";

export const CAPTION_CATEGORIES: { id: CaptionCategory; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "populares", label: "Mais usados" },
  { id: "basico", label: "Básico" },
  { id: "impacto", label: "Impacto" },
  { id: "minimalista", label: "Minimalista" },
  { id: "podcast", label: "Podcast" },
  { id: "viral", label: "Viral" },
  { id: "karaoke", label: "Karaokê" },
  { id: "gaming", label: "Gaming" },
  { id: "news", label: "Notícias" },
  { id: "business", label: "Business" },
];

export interface CaptionPreset {
  id: string;
  name: string;
  description: string;
  categories: CaptionCategory[];
  style: CaptionLayerStyle;
  animation: "none" | "pop" | "scale" | "bounce" | "fade" | "slide" | "glow" | "shake";
}

const base: CaptionLayerStyle = {
  fontFamily: "Figtree, sans-serif",
  fontWeight: 800,
  fontSize: 74,
  color: "#ffffff",
  highlight: "color",
  highlightColor: "#7c5cff",
  background: null,
  strokeColor: "#000000",
  strokeWidth: 8,
  shadow: true,
  uppercase: true,
  maxWords: 3,
  maxLines: 2,
  align: "center",
  mode: "karaoke",
};

function preset(
  id: string,
  name: string,
  description: string,
  categories: CaptionCategory[],
  style: Partial<CaptionLayerStyle>,
  animation: CaptionPreset["animation"] = "pop",
): CaptionPreset {
  return { id, name, description, categories, style: { ...base, ...style }, animation };
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  preset("verde-impacto", "Verde Impacto", "Palavra ativa em verde com contorno grosso", ["populares", "impacto", "viral"], {
    highlightColor: "#28f08a",
  }),
  preset("punch-yellow", "Punch Yellow", "Amarelo agressivo, ótimo para hooks", ["populares", "impacto"], {
    highlightColor: "#ffd93d",
    strokeWidth: 10,
    fontSize: 80,
  }, "bounce"),
  preset("rainbow-flow", "Rainbow Flow", "Cores rotativas por palavra", ["viral"], {
    highlightColor: "#ff5da2",
  }, "scale"),
  preset("clean-bold", "Clean Bold", "Branco sólido, leitura fácil", ["populares", "basico"], {
    highlight: "scale",
    strokeWidth: 6,
    uppercase: false,
  }, "scale"),
  preset("minimal-white", "Minimal White", "Discreto, sem contorno", ["minimalista", "basico"], {
    strokeWidth: 0,
    shadow: true,
    fontWeight: 600,
    uppercase: false,
    highlight: "underline",
    highlightColor: "#ffffff",
  }, "fade"),
  preset("subtitle-box", "Subtitle Box", "Caixa escura translúcida", ["basico", "business"], {
    background: "rgba(8,10,20,.72)",
    strokeWidth: 0,
    uppercase: false,
    fontWeight: 600,
    highlight: "box",
    maxWords: 8,
  }, "fade"),
  preset("podcast-bold", "Podcast Bold", "Duas linhas, foco na fala", ["podcast"], {
    maxWords: 5,
    fontSize: 64,
    highlightColor: "#7c5cff",
  }),
  preset("karaoke-pop", "Karaokê Pop", "Palavra a palavra com pulo", ["karaoke", "viral"], {
    mode: "karaoke",
    maxWords: 1,
    fontSize: 92,
    highlightColor: "#00e5ff",
  }, "bounce"),
  preset("color-word", "Color Word", "Só a palavra ativa colorida", ["karaoke", "impacto"], {
    maxWords: 4,
    highlightColor: "#ff4d6d",
  }, "pop"),
  preset("black-stroke", "Black Stroke", "Contorno preto extremo", ["impacto", "gaming"], {
    strokeWidth: 14,
    fontSize: 84,
    highlightColor: "#ffffff",
  }, "shake"),
  preset("neon", "Neon", "Brilho neon nas palavras", ["gaming", "viral"], {
    highlightColor: "#b16bff",
    strokeColor: "#12002e",
    strokeWidth: 6,
  }, "glow"),
  preset("news-caption", "News Caption", "Faixa de notícia", ["news", "business"], {
    background: "rgba(180,20,32,.92)",
    strokeWidth: 0,
    fontWeight: 700,
    maxWords: 7,
    highlight: "box",
  }, "slide"),
  preset("editorial", "Editorial", "Serifado, tom editorial", ["minimalista", "business"], {
    fontFamily: "'Instrument Serif', serif",
    fontWeight: 500,
    uppercase: false,
    strokeWidth: 0,
    fontSize: 70,
    highlight: "color",
    highlightColor: "#ffd93d",
  }, "fade"),
  preset("dynamic-scale", "Dynamic Scale", "A palavra ativa cresce", ["populares", "viral"], {
    highlight: "scale",
    maxWords: 3,
  }, "scale"),
];

export const CAPTION_MODES: { id: CaptionLayerStyle["mode"]; label: string; maxWords: number }[] = [
  { id: "line", label: "Frase inteira", maxWords: 8 },
  { id: "word", label: "Palavra por palavra", maxWords: 1 },
  { id: "karaoke", label: "Karaokê", maxWords: 3 },
  { id: "karaoke", label: "2 palavras", maxWords: 2 },
  { id: "karaoke", label: "3 palavras", maxWords: 3 },
];

export function findCaptionPreset(id: string | null | undefined): CaptionPreset {
  return CAPTION_PRESETS.find((p) => p.id === id) ?? CAPTION_PRESETS[0]!;
}

export function filterCaptionPresets(category: CaptionCategory, query: string): CaptionPreset[] {
  const q = query.trim().toLowerCase();
  return CAPTION_PRESETS.filter(
    (p) =>
      (category === "todos" || p.categories.includes(category)) &&
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
  );
}
