import type { CaptionStyle } from "./template";

export type CaptionTemplateCategory = "viral" | "podcast" | "clean" | "bold" | "story";

export interface CaptionTemplate {
  id: string;
  label: string;
  category: CaptionTemplateCategory;
  /** frase curta que descreve onde o template funciona melhor */
  hint: string;
  style: Partial<CaptionStyle>;
}

export const CATEGORY_LABEL: Record<CaptionTemplateCategory, string> = {
  viral: "Viral / TikTok",
  podcast: "Podcast / Corte",
  clean: "Clean / Marca",
  bold: "Impacto",
  story: "Stories / Reels",
};

/** posição vertical padrão em canvas 1080x1920 */
const LOW = 1320;
const MID = 980;
const HIGH = 760;

/**
 * Biblioteca de templates de legenda prontos, no espírito dos editores
 * ALCaptions / GetCaptions: é só escolher o card e a legenda já sai encaixada
 * (posição, quebra de linha, animação e destaque definidos).
 */
export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: "al-hormozi",
    label: "Hormozi",
    category: "viral",
    hint: "palavra destacada em caixa amarela, padrão de corte viral",
    style: {
      font: "Arial Black, sans-serif", weight: "800", color: "#ffffff", activeColor: "#111111",
      stroke: 14, strokeColor: "#000000", bg: "none", uppercase: true, mode: "karaoke",
      anim: "pop", highlight: "box", highlightColor: "#ffe600",
      maxWords: 3, maxLines: 2, size: 82, lineHeight: 1.25, align: "center", y: MID, w: 940,
    },
  },
  {
    id: "al-karaoke-mint",
    label: "Karaokê Mint",
    category: "viral",
    hint: "cor troca palavra a palavra, alta legibilidade",
    style: {
      font: "Inter, sans-serif", weight: "800", color: "#ffffff", activeColor: "#22c55e",
      stroke: 10, strokeColor: "#04140b", bg: "shadow", uppercase: true, mode: "karaoke",
      anim: "bounce", highlight: "color",
      maxWords: 4, maxLines: 2, size: 72, lineHeight: 1.2, align: "center", y: LOW, w: 960,
    },
  },
  {
    id: "al-punch",
    label: "Punch Word",
    category: "bold",
    hint: "uma palavra gigante por vez, ritmo agressivo",
    style: {
      font: "Impact, sans-serif", weight: "800", color: "#ffffff", activeColor: "#ff2d55",
      stroke: 18, strokeColor: "#000000", bg: "none", uppercase: true, mode: "word",
      anim: "pop", highlight: "scale",
      maxWords: 1, maxLines: 1, size: 128, align: "center", y: MID, w: 1000,
    },
  },
  {
    id: "al-podcast",
    label: "Podcast Corte",
    category: "podcast",
    hint: "duas linhas legíveis com sombra, ideal para fala longa",
    style: {
      font: "Inter, sans-serif", weight: "700", color: "#ffffff", activeColor: "#ffd166",
      stroke: 6, strokeColor: "#000000", bg: "shadow", uppercase: false, mode: "karaoke",
      anim: "fade", highlight: "color",
      maxWords: 6, maxLines: 2, size: 58, lineHeight: 1.3, align: "center", y: LOW, w: 980,
    },
  },
  {
    id: "al-subtitle-bar",
    label: "Barra Legenda",
    category: "clean",
    hint: "caixa escura translúcida, estilo streaming",
    style: {
      font: "Inter, sans-serif", weight: "600", color: "#ffffff", activeColor: "#ffffff",
      stroke: 0, bg: "box", boxColor: "#000000", boxOpacity: 0.62, boxPad: 0.34, boxRadius: 0.24,
      uppercase: false, mode: "line", anim: "slide", highlight: "color",
      maxWords: 8, maxLines: 2, size: 50, lineHeight: 1.25, align: "center", y: LOW, w: 1000,
    },
  },
  {
    id: "al-underline",
    label: "Sublinhado Neon",
    category: "viral",
    hint: "sublinhado acompanha a palavra falada",
    style: {
      font: "Inter, sans-serif", weight: "800", color: "#ffffff", activeColor: "#ffffff",
      stroke: 8, strokeColor: "#0a0a0a", bg: "shadow", uppercase: true, mode: "karaoke",
      anim: "slide", highlight: "underline", highlightColor: "#22d3ee",
      maxWords: 4, maxLines: 2, size: 68, lineHeight: 1.22, align: "center", y: LOW, w: 940,
    },
  },
  {
    id: "al-story-top",
    label: "Story Topo",
    category: "story",
    hint: "posição alta para não bater na UI do Reels/Stories",
    style: {
      font: "Inter, sans-serif", weight: "700", color: "#ffffff", activeColor: "#ff4fd8",
      stroke: 10, strokeColor: "#1a0033", bg: "shadow", uppercase: true, mode: "karaoke",
      anim: "pop", highlight: "scale",
      maxWords: 3, maxLines: 2, size: 66, lineHeight: 1.2, align: "center", y: HIGH, w: 900,
    },
  },
  {
    id: "al-editorial",
    label: "Editorial",
    category: "clean",
    hint: "texto sóbrio alinhado à esquerda, cara de marca",
    style: {
      font: "Inter, sans-serif", weight: "600", color: "#f5f5f5", activeColor: "#c6f24e",
      stroke: 0, bg: "shadow", uppercase: false, mode: "line", anim: "fade", highlight: "color",
      maxWords: 7, maxLines: 3, size: 46, lineHeight: 1.35, align: "left", x: 90, y: LOW, w: 860,
    },
  },
  {
    id: "al-terminal",
    label: "Terminal",
    category: "bold",
    hint: "monoespaçada com digitação, cara de tech",
    style: {
      font: "Courier New, monospace", weight: "700", color: "#c6f24e", activeColor: "#ffffff",
      stroke: 0, bg: "box", boxColor: "#000000", boxOpacity: 0.8, boxPad: 0.3, boxRadius: 0.1,
      uppercase: true, mode: "line", anim: "typewriter", highlight: "color",
      maxWords: 6, maxLines: 2, size: 46, lineHeight: 1.3, align: "center", y: LOW, w: 940,
    },
  },
  {
    id: "al-shorts-yellow",
    label: "Shorts Amarelo",
    category: "viral",
    hint: "clássico do YouTube Shorts, contraste máximo",
    style: {
      font: "Arial Black, sans-serif", weight: "800", color: "#ffe600", activeColor: "#ffffff",
      stroke: 16, strokeColor: "#000000", bg: "none", uppercase: true, mode: "karaoke",
      anim: "bounce", highlight: "scale",
      maxWords: 3, maxLines: 2, size: 86, lineHeight: 1.2, align: "center", y: MID, w: 960,
    },
  },
  {
    id: "al-clean-mid",
    label: "Minimal Centro",
    category: "clean",
    hint: "sem contorno, tipografia limpa no centro",
    style: {
      font: "Inter, sans-serif", weight: "600", color: "#ffffff", activeColor: "#22c55e",
      stroke: 2, strokeColor: "#000000", bg: "shadow", uppercase: false, mode: "karaoke",
      anim: "fade", highlight: "color",
      maxWords: 5, maxLines: 2, size: 54, lineHeight: 1.3, align: "center", y: MID, w: 900,
    },
  },
  {
    id: "al-duo",
    label: "Duo Contraste",
    category: "podcast",
    hint: "linha branca com palavra ativa em caixa mint",
    style: {
      font: "Inter, sans-serif", weight: "800", color: "#ffffff", activeColor: "#04140b",
      stroke: 8, strokeColor: "#000000", bg: "shadow", uppercase: false, mode: "karaoke",
      anim: "pop", highlight: "box", highlightColor: "#22c55e",
      maxWords: 5, maxLines: 2, size: 62, lineHeight: 1.28, align: "center", y: LOW, w: 980,
    },
  },
];

/** Aplica um template garantindo que a legenda fique visível. */
export function applyCaptionTemplate(id: string): Partial<CaptionStyle> | null {
  const t = CAPTION_TEMPLATES.find((x) => x.id === id);
  return t ? { ...t.style, visible: true } : null;
}

export function templatesByCategory(cat: CaptionTemplateCategory | "all") {
  return cat === "all" ? CAPTION_TEMPLATES : CAPTION_TEMPLATES.filter((t) => t.category === cat);
}
