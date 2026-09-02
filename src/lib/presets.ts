import {
  createTemplate,
  defaultCaptions,
  type ExtraLayer,
  type Template,
  type TextLayer,
} from "./template";

export type PresetCategory = "Fofoca" | "Notícia" | "Podcast" | "Viral" | "UGC" | "Minimal";

export interface StarterPreset {
  id: string;
  name: string;
  tag: string;
  description: string;
  accent: string;
  category?: PresetCategory;
  build: () => Template;
}

const base = (name: string, patch: (t: Template) => void): Template => {
  const t = createTemplate(name);
  patch(t);
  t.updatedAt = Date.now();
  return t;
};

/* ------------------------------------------------------------------ */
/* Formas simples (SVG embutido) usadas como camadas de imagem          */
/* ------------------------------------------------------------------ */

const svgUrl = (inner: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${inner}</svg>`,
  )}`;

const rectSvg = (fill: string, radius = 0) =>
  svgUrl(`<rect x="0" y="0" width="100" height="100" rx="${radius}" ry="${radius}" fill="${fill}"/>`);

const splitSvg = (left: string, right: string) =>
  svgUrl(
    `<rect x="0" y="0" width="50" height="100" fill="${left}"/><rect x="50" y="0" width="50" height="100" fill="${right}"/>`,
  );

const gradSvg = (from: string, to: string) =>
  svgUrl(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>`,
  );

/** Camada de forma (retângulo/pílula/gradiente) desenhada como imagem. */
const shape = (
  label: string,
  src: string,
  box: { x: number; y: number; w: number; h: number },
  o: { z?: number; opacity?: number } = {},
): ExtraLayer => ({
  id: crypto.randomUUID(),
  label,
  x: box.x,
  y: box.y,
  w: box.w,
  h: box.h,
  visible: true,
  rotation: 0,
  z: o.z ?? 5,
  src,
  opacity: o.opacity ?? 1,
  round: false,
});

/** Camada livre de texto. */
const label = (labelName: string, o: Partial<TextLayer> & { text: string }): ExtraLayer => ({
  id: crypto.randomUUID(),
  label: labelName,
  x: 90,
  y: 200,
  w: 900,
  h: 90,
  visible: true,
  rotation: 0,
  z: 110,
  color: "#ffffff",
  size: 46,
  weight: "800",
  align: "center",
  font: "Inter, sans-serif",
  ...o,
});

export const STARTER_PRESETS: StarterPreset[] = [
  {
    id: "post-social",
    name: "Post Social (feed clonado)",
    tag: "Instagram",
    description: "Avatar + nome + selo + headline em cima, vídeo grande e CTA no rodapé.",
    accent: "#22d39a",
    build: () =>
      base("Post Social", (t) => {
        t.background = "#0b0f0d";
        t.headline.text = "ISSO MUDOU TUDO PRA MIM";
        t.headline.size = 62;
        t.cta.text = "Segue pra parte 2 →";
        t.captions = { ...defaultCaptions(), visible: true, activeColor: "#22d39a", highlightColor: "#22d39a" };
      }),
  },
  {
    id: "full-bleed",
    name: "Tela Cheia Minimal",
    tag: "TikTok",
    description: "Vídeo ocupando 100% da tela, só marca d'água discreta e legenda karaokê.",
    accent: "#ffffff",
    build: () =>
      base("Tela Cheia Minimal", (t) => {
        t.background = "#000000";
        t.video = { ...t.video, x: 0, y: 0, w: 1080, h: 1920, radius: 0 };
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle.visible = false;
        t.headline.visible = false;
        t.cta.visible = false;
        t.watermark = { ...t.watermark, visible: true, x: 820, y: 1740, w: 180, h: 120, opacity: 0.3 };
        t.captions = { ...defaultCaptions(), visible: true, y: 1380, size: 70 };
      }),
  },
  {
    id: "manchete",
    name: "Manchete de Notícia",
    tag: "Dark News",
    description: "Faixa superior de headline em caixa alta, vídeo central e crédito embaixo.",
    accent: "#ff4d4d",
    build: () =>
      base("Manchete de Notícia", (t) => {
        t.background = "#0a0a0a";
        t.avatar.visible = false;
        t.name_ = { ...t.name_, x: 90, y: 120, text: "URGENTE", size: 44, color: "#ff4d4d", badge: false };
        t.handle.visible = false;
        t.headline = {
          ...t.headline,
          y: 190,
          h: 300,
          text: "O QUE NINGUÉM TE CONTOU SOBRE ISSO",
          size: 76,
          align: "left",
        };
        t.video = { ...t.video, x: 60, y: 560, w: 960, h: 1080, radius: 12 };
        t.cta = { ...t.cta, y: 1720, text: "fonte: @seucanal", align: "left", size: 34 };
        t.captions = { ...defaultCaptions(), visible: true, activeColor: "#ff4d4d", highlightColor: "#ff4d4d" };
      }),
  },
  {
    id: "podcast",
    name: "Corte de Podcast",
    tag: "Shorts",
    description: "Vídeo em destaque com legendas grandes tipo CapCut e nome do convidado.",
    accent: "#c6f24e",
    build: () =>
      base("Corte de Podcast", (t) => {
        t.background = "#0d0d10";
        t.video = { ...t.video, x: 0, y: 300, w: 1080, h: 1320, radius: 0 };
        t.avatar = { ...t.avatar, x: 80, y: 90, w: 130, h: 130 };
        t.name_ = { ...t.name_, x: 240, y: 100, text: "Nome do convidado", size: 50 };
        t.handle = { ...t.handle, x: 240, y: 168, text: "@seupodcast" };
        t.headline.visible = false;
        t.cta = { ...t.cta, y: 1780, text: "Episódio completo no canal" };
        t.captions = {
          ...defaultCaptions(),
          visible: true,
          y: 1180,
          size: 78,
          bg: "box",
          boxColor: "#000000",
          maxWords: 3,
        };
      }),
  },
  {
    id: "storytelling",
    name: "Storytelling Dark",
    tag: "Dark Page",
    description: "Fundo escuro, headline serifada no topo e vídeo com cantos arredondados.",
    accent: "#8b5cf6",
    build: () =>
      base("Storytelling Dark", (t) => {
        t.background = "#08070c";
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle = { ...t.handle, x: 90, y: 130, text: "@paginadark", color: "#8b5cf6", size: 34 };
        t.headline = {
          ...t.headline,
          y: 200,
          h: 260,
          text: "Uma história que você precisa ouvir",
          size: 64,
          align: "left",
          font: "Georgia, serif",
        };
        t.video = { ...t.video, x: 90, y: 540, w: 900, h: 1100, radius: 40 };
        t.cta = { ...t.cta, y: 1740, text: "salve para ver depois", color: "#8b5cf6" };
        t.captions = { ...defaultCaptions(), visible: true, activeColor: "#8b5cf6", highlightColor: "#8b5cf6" };
      }),
  },
  {
    id: "motivacional",
    name: "Motivacional Impacto",
    tag: "Viral",
    description: "Legenda amarela gigante, headline curta e marca d'água no canto.",
    accent: "#facc15",
    build: () =>
      base("Motivacional Impacto", (t) => {
        t.background = "#000000";
        t.video = { ...t.video, x: 0, y: 0, w: 1080, h: 1920, radius: 0 };
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle = { ...t.handle, x: 90, y: 1840, text: "@seuperfil", size: 32, color: "#facc15" };
        t.headline = { ...t.headline, y: 140, text: "LEIA ISTO ANTES DE DESISTIR", size: 58, color: "#facc15" };
        t.cta.visible = false;
        t.captions = {
          ...defaultCaptions(),
          visible: true,
          y: 1300,
          size: 84,
          color: "#ffffff",
          activeColor: "#facc15",
          highlightColor: "#facc15",
          stroke: 14,
          maxWords: 3,
        };
      }),
  },
];
