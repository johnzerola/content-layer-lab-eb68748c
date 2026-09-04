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
    category: "Fofoca",
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
    category: "Minimal",
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
    category: "Notícia",
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
    category: "Podcast",
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
    category: "Viral",
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
    category: "Viral",
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
  /* ------------------------- Fofoca / páginas ------------------------- */
  {
    id: "feed-fofoca",
    category: "Fofoca",
    name: "Feed da Fofoca",
    tag: "Instagram",
    description: "Post clonado do feed: perfil no topo, curtidas, manchete e hashtags embaixo.",
    accent: "#f472b6",
    build: () =>
      base("Feed da Fofoca", (t) => {
        t.background = "#12070f";
        t.extras = [
          shape("fundo", gradSvg("#ff7a45", "#c026d3"), { x: 0, y: 0, w: 1080, h: 1920 }, { z: 1 }),
          shape("card", rectSvg("#ffffff", 4), { x: 60, y: 250, w: 960, h: 1420 }, { z: 2 }),
        ];
        t.avatar = { ...t.avatar, x: 100, y: 300, w: 90, h: 90, round: true, z: 20 };
        t.name_ = { ...t.name_, x: 210, y: 320, text: "fofoca.real", size: 40, color: "#111111", badge: true, z: 30 };
        t.handle.visible = false;
        t.video = { ...t.video, x: 100, y: 420, w: 880, h: 880, radius: 0, z: 15 };
        t.headline = {
          ...t.headline,
          x: 100,
          y: 1400,
          w: 880,
          h: 200,
          text: "Ela contou tudo e ninguém esperava",
          size: 56,
          align: "left",
          color: "#111111",
        };
        t.cta = { ...t.cta, x: 100, y: 1600, w: 880, text: "#famosos #babado #viral", align: "left", size: 34, color: "#7c3aed" };
        t.extras.push(
          label("curtidas", { text: "♥ 128 mil curtidas  ○ 4.932", x: 100, y: 1330, w: 880, size: 34, align: "left", color: "#333333", weight: "600" }),
        );
        t.captions = { ...defaultCaptions(), visible: true, y: 1120, size: 58 };
      }),
  },
  {
    id: "fofoca-exclusiva",
    category: "Fofoca",
    name: "Fofoca Exclusiva",
    tag: "Exclusivo",
    description: "Faixa vermelha de EXCLUSIVO no topo, vídeo grande e crédito da página.",
    accent: "#ef4444",
    build: () =>
      base("Fofoca Exclusiva", (t) => {
        t.background = "#08060a";
        t.extras = [
          shape("faixa", rectSvg("#ef4444", 0), { x: 0, y: 90, w: 1080, h: 96 }, { z: 6 }),
          label("selo", { text: "EXCLUSIVO", y: 110, size: 58, color: "#ffffff" }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle = { ...t.handle, x: 90, y: 1830, text: "@suapagina", size: 32, color: "#ef4444" };
        t.headline = { ...t.headline, y: 230, h: 220, text: "O QUE ACONTECEU NOS BASTIDORES", size: 70 };
        t.video = { ...t.video, x: 60, y: 520, w: 960, h: 1140, radius: 24 };
        t.cta.visible = false;
        t.captions = { ...defaultCaptions(), visible: true, y: 1400, activeColor: "#ef4444", highlightColor: "#ef4444" };
      }),
  },
  {
    id: "dm-vazado",
    category: "Fofoca",
    name: "DM Vazado",
    tag: "Print",
    description: "Balões de conversa sobre o vídeo, como um print de mensagem direta.",
    accent: "#38bdf8",
    build: () =>
      base("DM Vazado", (t) => {
        t.background = "#05070b";
        t.video = { ...t.video, x: 0, y: 0, w: 1080, h: 1920, radius: 0 };
        t.extras = [
          shape("escurecer", rectSvg("#000000", 0), { x: 0, y: 0, w: 1080, h: 1920 }, { z: 4, opacity: 0.45 }),
          shape("balao1", rectSvg("#1f2937", 18), { x: 90, y: 420, w: 700, h: 150 }, { z: 6 }),
          shape("balao2", rectSvg("#38bdf8", 18), { x: 290, y: 610, w: 700, h: 150 }, { z: 6 }),
          label("msg1", { text: "vc viu o que ela postou?", x: 120, y: 470, w: 640, size: 42, align: "left" }),
          label("msg2", { text: "prints salvos 👀", x: 320, y: 660, w: 640, size: 42, align: "left", color: "#04121c" }),
        ];
        t.avatar.visible = false;
        t.name_ = { ...t.name_, x: 90, y: 300, text: "Mensagens", size: 44, color: "#38bdf8" };
        t.handle.visible = false;
        t.headline.visible = false;
        t.cta = { ...t.cta, y: 1810, text: "arrasta pra ver o resto", color: "#38bdf8" };
        t.captions = { ...defaultCaptions(), visible: true, y: 1400, size: 66, activeColor: "#38bdf8", highlightColor: "#38bdf8" };
      }),
  },
  {
    id: "close-friends",
    category: "Fofoca",
    name: "Close Friends",
    tag: "Stories",
    description: "Moldura verde de close friends, selo e legenda curta centralizada.",
    accent: "#22c55e",
    build: () =>
      base("Close Friends", (t) => {
        t.background = "#04150b";
        t.extras = [
          shape("moldura", rectSvg("#22c55e", 8), { x: 40, y: 300, w: 1000, h: 1240 }, { z: 4 }),
          shape("selo", rectSvg("#22c55e", 40), { x: 90, y: 170, w: 430, h: 80 }, { z: 6 }),
          label("selo-txt", { text: "CLOSE FRIENDS", x: 90, y: 188, w: 430, size: 40, color: "#04150b" }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle.visible = false;
        t.headline.visible = false;
        t.video = { ...t.video, x: 56, y: 316, w: 968, h: 1208, radius: 4, z: 15 };
        t.cta = { ...t.cta, y: 1620, text: "só quem é close vê isso", color: "#22c55e", size: 42 };
        t.captions = { ...defaultCaptions(), visible: true, y: 1300, size: 70, activeColor: "#22c55e", highlightColor: "#22c55e" };
      }),
  },
  {
    id: "fio-fofoca",
    category: "Fofoca",
    name: "Fio da Fofoca",
    tag: "Thread",
    description: "Numeração de fio no topo, headline amarela e vídeo em card.",
    accent: "#fbbf24",
    build: () =>
      base("Fio da Fofoca", (t) => {
        t.background = "#0b0a06";
        t.extras = [
          shape("pill", rectSvg("#fbbf24", 40), { x: 90, y: 130, w: 300, h: 80 }, { z: 6 }),
          label("fio", { text: "FIO 1/7", x: 90, y: 148, w: 300, size: 42, color: "#1a1400" }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle = { ...t.handle, x: 90, y: 1840, text: "@suapagina", color: "#fbbf24", size: 32 };
        t.headline = { ...t.headline, y: 250, h: 240, text: "Começou com um comentário apagado", size: 62, align: "left", color: "#fbbf24" };
        t.video = { ...t.video, x: 90, y: 560, w: 900, h: 1120, radius: 28 };
        t.cta.visible = false;
        t.captions = { ...defaultCaptions(), visible: true, y: 1420, activeColor: "#fbbf24", highlightColor: "#fbbf24" };
      }),
  },

  /* ---------------------------- Notícia ------------------------------- */
  {
    id: "fato-fake",
    category: "Notícia",
    name: "Fato ou Fake",
    tag: "Checagem",
    description: "Fundo dividido em vermelho e verde, veredito em pílula amarela.",
    accent: "#f59e0b",
    build: () =>
      base("Fato ou Fake", (t) => {
        t.background = "#0a0a0a";
        t.extras = [
          shape("split", splitSvg("#dc2626", "#16a34a"), { x: 0, y: 0, w: 1080, h: 1920 }, { z: 1 }),
          label("fato", { text: "FATO", x: 60, y: 150, w: 420, size: 78 }),
          label("fake", { text: "FAKE", x: 600, y: 150, w: 420, size: 78 }),
          shape("veredito", rectSvg("#facc15", 30), { x: 220, y: 1420, w: 640, h: 110 }, { z: 6 }),
          label("veredito-txt", { text: "VEJA O VEREDITO", x: 220, y: 1450, w: 640, size: 46, color: "#1a1400" }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle.visible = false;
        t.headline = { ...t.headline, y: 1580, h: 200, text: "A informação que viralizou é verdadeira?", size: 56 };
        t.video = { ...t.video, x: 90, y: 340, w: 900, h: 1020, radius: 16, z: 15 };
        t.cta.visible = false;
        t.captions = { ...defaultCaptions(), visible: true, y: 1180, size: 60 };
      }),
  },
  {
    id: "plantao",
    category: "Notícia",
    name: "Plantão Urgente",
    tag: "Breaking",
    description: "Faixa de plantão piscando no topo, vídeo cheio e legenda em caixa.",
    accent: "#ef4444",
    build: () =>
      base("Plantão Urgente", (t) => {
        t.background = "#000000";
        t.video = { ...t.video, x: 0, y: 0, w: 1080, h: 1920, radius: 0 };
        t.extras = [
          shape("faixa", rectSvg("#dc2626", 0), { x: 0, y: 120, w: 1080, h: 120 }, { z: 6 }),
          label("plantao", { text: "PLANTÃO", y: 145, size: 66 }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle = { ...t.handle, x: 90, y: 1840, text: "@seucanal", size: 32, color: "#ffffff" };
        t.headline = { ...t.headline, y: 280, h: 200, text: "ACABA DE ACONTECER", size: 64 };
        t.cta.visible = false;
        t.captions = { ...defaultCaptions(), visible: true, y: 1320, size: 72, bg: "box", boxColor: "#000000", maxWords: 3 };
      }),
  },
  {
    id: "linha-tempo",
    category: "Notícia",
    name: "Linha do Tempo",
    tag: "Contexto",
    description: "Trilha lateral com marcadores de etapas e vídeo à direita.",
    accent: "#60a5fa",
    build: () =>
      base("Linha do Tempo", (t) => {
        t.background = "#060a12";
        t.extras = [
          shape("trilha", rectSvg("#60a5fa", 8), { x: 90, y: 420, w: 10, h: 1100 }, { z: 6, opacity: 0.6 }),
          shape("p1", rectSvg("#60a5fa", 50), { x: 70, y: 470, w: 50, h: 50 }, { z: 7 }),
          shape("p2", rectSvg("#60a5fa", 50), { x: 70, y: 920, w: 50, h: 50 }, { z: 7 }),
          shape("p3", rectSvg("#60a5fa", 50), { x: 70, y: 1370, w: 50, h: 50 }, { z: 7 }),
        ];
        t.avatar.visible = false;
        t.name_ = { ...t.name_, x: 90, y: 170, text: "ENTENDA O CASO", size: 46, color: "#60a5fa" };
        t.handle.visible = false;
        t.headline = { ...t.headline, x: 90, y: 250, w: 900, h: 140, text: "Passo a passo do que rolou", size: 58, align: "left" };
        t.video = { ...t.video, x: 180, y: 430, w: 830, h: 1080, radius: 20 };
        t.cta = { ...t.cta, y: 1600, text: "parte 2 amanhã", color: "#60a5fa" };
        t.captions = { ...defaultCaptions(), visible: true, y: 1660, activeColor: "#60a5fa", highlightColor: "#60a5fa" };
      }),
  },

  /* ------------------------- Viral / UGC ------------------------------ */
  {
    id: "quem-e",
    category: "Viral",
    name: "Quem É? (quiz)",
    tag: "Quiz",
    description: "Pergunta grande no topo, vídeo no meio e resposta em pílula embaixo.",
    accent: "#a855f7",
    build: () =>
      base("Quem É?", (t) => {
        t.background = "#0b0616";
        t.extras = [
          shape("bg", gradSvg("#7c3aed", "#0b0616"), { x: 0, y: 0, w: 1080, h: 1920 }, { z: 1, opacity: 0.75 }),
          shape("resposta", rectSvg("#facc15", 30), { x: 190, y: 1560, w: 700, h: 110 }, { z: 6 }),
          label("resposta-txt", { text: "A RESPOSTA NO FINAL", x: 190, y: 1590, w: 700, size: 44, color: "#1a1400" }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle.visible = false;
        t.headline = { ...t.headline, y: 200, h: 220, text: "QUEM É ESSA PESSOA?", size: 76 };
        t.video = { ...t.video, x: 120, y: 480, w: 840, h: 1000, radius: 30, z: 15 };
        t.cta.visible = false;
        t.captions = { ...defaultCaptions(), visible: true, y: 1720, size: 60 };
      }),
  },
  {
    id: "ranking-top5",
    category: "Viral",
    name: "Ranking Top 5",
    tag: "Lista",
    description: "Número gigante no canto, vídeo em card e título do item.",
    accent: "#f97316",
    build: () =>
      base("Ranking Top 5", (t) => {
        t.background = "#0a0703";
        t.extras = [
          shape("faixa", rectSvg("#f97316", 0), { x: 0, y: 250, w: 1080, h: 12 }, { z: 6 }),
          label("numero", { text: "1", x: 60, y: 90, w: 200, size: 140, align: "left", color: "#f97316" }),
        ];
        t.avatar.visible = false;
        t.name_ = { ...t.name_, x: 280, y: 150, text: "O MELHOR DA SEMANA", size: 44, color: "#ffffff" };
        t.handle.visible = false;
        t.headline = { ...t.headline, y: 300, h: 160, text: "Você não vai acreditar no primeiro", size: 54 };
        t.video = { ...t.video, x: 90, y: 500, w: 900, h: 1120, radius: 24 };
        t.cta = { ...t.cta, y: 1700, text: "comenta o seu top 1", color: "#f97316" };
        t.captions = { ...defaultCaptions(), visible: true, y: 1400, activeColor: "#f97316", highlightColor: "#f97316" };
      }),
  },
  {
    id: "review-ugc",
    category: "UGC",
    name: "Review UGC",
    tag: "Produto",
    description: "Fundo claro, nota em estrelas e caixa de review abaixo do vídeo.",
    accent: "#0ea5e9",
    build: () =>
      base("Review UGC", (t) => {
        t.background = "#f5f5f4";
        t.extras = [
          shape("card", rectSvg("#ffffff", 24), { x: 60, y: 1400, w: 960, h: 340 }, { z: 6 }),
          label("estrelas", { text: "★★★★★  4,9", x: 100, y: 1450, w: 880, size: 52, align: "left", color: "#f59e0b" }),
          label("review", { text: "\"Usei por 30 dias e o resultado foi esse.\"", x: 100, y: 1550, w: 880, size: 40, align: "left", color: "#1c1917", weight: "600" }),
        ];
        t.avatar.visible = false;
        t.name_ = { ...t.name_, x: 90, y: 120, text: "REVIEW HONESTO", size: 42, color: "#0ea5e9" };
        t.handle.visible = false;
        t.headline = { ...t.headline, y: 200, h: 140, text: "Vale a pena mesmo?", size: 58, color: "#1c1917", align: "left", x: 90 };
        t.video = { ...t.video, x: 90, y: 380, w: 900, h: 960, radius: 28 };
        t.cta = { ...t.cta, y: 1800, text: "link na bio", color: "#0ea5e9" };
        t.captions = { ...defaultCaptions(), visible: true, y: 1180, size: 58, bg: "box", boxColor: "#0f172a" };
      }),
  },
  {
    id: "comentario-destaque",
    category: "UGC",
    name: "Comentário Destaque",
    tag: "Resposta",
    description: "Card de comentário fixado sobre o vídeo, no estilo resposta.",
    accent: "#e11d48",
    build: () =>
      base("Comentário Destaque", (t) => {
        t.background = "#0a0509";
        t.video = { ...t.video, x: 0, y: 0, w: 1080, h: 1920, radius: 0 };
        t.extras = [
          shape("card", rectSvg("#111827", 24), { x: 80, y: 330, w: 920, h: 260 }, { z: 6, opacity: 0.94 }),
          label("autor", { text: "@usuario  ·  respondendo", x: 120, y: 370, w: 840, size: 34, align: "left", color: "#e11d48", weight: "600" }),
          label("comentario", { text: "Faz um vídeo explicando isso melhor!", x: 120, y: 430, w: 840, size: 46, align: "left" }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle = { ...t.handle, x: 90, y: 1840, text: "@seuperfil", size: 32, color: "#e11d48" };
        t.headline.visible = false;
        t.cta.visible = false;
        t.captions = { ...defaultCaptions(), visible: true, y: 1380, size: 70, activeColor: "#e11d48", highlightColor: "#e11d48", maxWords: 3 };
      }),
  },
  {
    id: "dopamina-split",
    category: "Viral",
    name: "Dopamina Split",
    tag: "Retenção",
    description: "Vídeo principal em cima e espaço de gameplay embaixo, com barra de progresso.",
    accent: "#22d3ee",
    build: () =>
      base("Dopamina Split", (t) => {
        t.background = "#04070a";
        t.extras = [
          shape("inferior", rectSvg("#0f172a", 0), { x: 0, y: 1000, w: 1080, h: 920 }, { z: 3 }),
          label("aviso", { text: "A PARTE BOA É AGORA", y: 940, size: 46, color: "#22d3ee" }),
          shape("barra", rectSvg("#22d3ee", 8), { x: 90, y: 1860, w: 900, h: 14 }, { z: 8, opacity: 0.8 }),
        ];
        t.avatar.visible = false;
        t.name_.visible = false;
        t.handle.visible = false;
        t.headline = { ...t.headline, y: 110, h: 140, text: "NÃO DESVIA O OLHAR", size: 60, color: "#22d3ee" };
        t.video = { ...t.video, x: 0, y: 260, w: 1080, h: 660, radius: 0, z: 15 };
        t.cta.visible = false;
        t.captions = { ...defaultCaptions(), visible: true, y: 1620, size: 68, maxWords: 3 };
      }),
  },
  {
    id: "x-em-alta",
    category: "Viral",
    name: "X em Alta",
    tag: "Post X",
    description: "Card de post estilo X no topo, com vídeo logo abaixo.",
    accent: "#e7e9ea",
    build: () =>
      base("X em Alta", (t) => {
        t.background = "#000000";
        t.extras = [
          shape("card", rectSvg("#16181c", 24), { x: 70, y: 200, w: 940, h: 360 }, { z: 5 }),
          label("post", { text: "\"isso aqui mudou a internet hoje\"", x: 220, y: 330, w: 760, size: 46, align: "left" }),
          label("metricas", { text: "12,4 mil  ·  38 mil curtidas", x: 220, y: 460, w: 760, size: 32, align: "left", color: "#71767b", weight: "600" }),
        ];
        t.avatar = { ...t.avatar, x: 110, y: 250, w: 90, h: 90, round: true, z: 20 };
        t.name_ = { ...t.name_, x: 220, y: 255, text: "Seu Perfil", size: 40, badge: true, z: 30 };
        t.handle = { ...t.handle, x: 220, y: 300, text: "@seuperfil", size: 30, color: "#71767b", z: 30 };
        t.headline.visible = false;
        t.video = { ...t.video, x: 70, y: 620, w: 940, h: 1060, radius: 24 };
        t.cta = { ...t.cta, y: 1760, text: "segue pra mais", color: "#e7e9ea" };
        t.captions = { ...defaultCaptions(), visible: true, y: 1420, size: 62 };
      }),
  },
];
