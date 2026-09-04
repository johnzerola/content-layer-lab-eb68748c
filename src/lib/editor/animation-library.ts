/**
 * BIBLIOTECA DE ANIMAÇÕES prontas do editor.
 * Cada item monta camadas reais (texto/forma) já animadas e personalizadas
 * com a identidade do usuário (@handle, nome, cargo).
 */
import { createShapeLayer, createTextLayer, nextZ } from "@/lib/video-template/factory";
import type { AnimationSpec, TemplateLayer, TextLayer } from "@/lib/video-template/types";

export interface AnimIdentity {
  /** @ do canal/perfil, sem arroba */
  handle: string;
  name: string;
  role: string;
}

export const DEFAULT_ANIM_IDENTITY: AnimIdentity = {
  handle: "seucanal",
  name: "Seu Nome",
  role: "Cargo / Empresa",
};

const IDENTITY_KEY = "vaiviral.anim.identity";

export function loadAnimIdentity(): AnimIdentity {
  if (typeof localStorage === "undefined") return DEFAULT_ANIM_IDENTITY;
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? { ...DEFAULT_ANIM_IDENTITY, ...(JSON.parse(raw) as Partial<AnimIdentity>) } : DEFAULT_ANIM_IDENTITY;
  } catch {
    return DEFAULT_ANIM_IDENTITY;
  }
}

export function saveAnimIdentity(id: AnimIdentity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
  } catch {
    /* ignore */
  }
}

export type AnimCategory =
  | "Real VFX"
  | "Formas"
  | "Interativos"
  | "Social"
  | "Lower Thirds"
  | "CTA"
  | "Efeitos"
  | "3D";

export const ANIM_CATEGORIES: AnimCategory[] = [
  "Real VFX",
  "Formas",
  "Interativos",
  "Social",
  "Lower Thirds",
  "CTA",
  "Efeitos",
  "3D",
];

export interface AnimPreviewSpec {
  /** classe de animação usada na prévia do card */
  anim: string;
  bg: string;
  fg: string;
  accent?: string;
  /** desenho do card: pílula social, lower third, botão, texto ou forma */
  shape: "pill" | "lower" | "cta" | "text" | "block";
  icon?: string;
}

export interface AnimPreset {
  id: string;
  label: string;
  desc: string;
  category: AnimCategory;
  preview: AnimPreviewSpec;
  build: (layers: TemplateLayer[], identity: AnimIdentity) => TemplateLayer[];
}

function anim(type: string, duration = 0.6, delay = 0): AnimationSpec {
  return { type, duration, delay, easing: "easeOut", speed: 1, direction: "normal" };
}

function text(
  layers: TemplateLayer[],
  value: string,
  patch: Partial<TextLayer>,
): TextLayer {
  return { ...createTextLayer(layers, value), ...patch } as TextLayer;
}

/** pílula social: forma arredondada + @handle */
function socialPill(
  id: string,
  label: string,
  network: string,
  bg: string,
  fg: string,
): AnimPreset {
  return {
    id,
    label: `Handle ${label}`,
    desc: `Pílula com logo ${label} + @perfil`,
    category: "Social",
    preview: { anim: "tp-left", bg, fg, shape: "pill", icon: network },
    build: (layers, identity) => {
      const pill = {
        ...createShapeLayer(layers, "rounded"),
        name: `${label} · pílula`,
        fill: bg,
        stroke: "transparent",
        x: 8,
        y: 78,
        width: 40,
        height: 6,
        radius: 40,
        startTime: 0,
        endTime: null,
        animationIn: anim("slideLeft", 0.5),
        animationOut: anim("fadeIn", 0.4),
      };
      const handle = text([...layers, pill], `@${identity.handle}`, {
        name: `${label} · @`,
        x: 11,
        y: 79.2,
        width: 34,
        height: 4,
        fontSize: 40,
        fontWeight: 700,
        color: fg,
        align: "left",
        shadow: false,
        animationIn: anim("fadeIn", 0.5, 0.1),
      });
      return [pill, handle];
    },
  };
}

const SOCIALS: [string, string, string, string, string][] = [
  ["youtube", "YouTube", "youtube", "#ff0033", "#ffffff"],
  ["instagram", "Instagram", "instagram", "#d62976", "#ffffff"],
  ["tiktok", "TikTok", "tiktok", "#111111", "#25f4ee"],
  ["facebook", "Facebook", "facebook", "#1877f2", "#ffffff"],
  ["x", "X", "x", "#0a0a0a", "#ffffff"],
  ["twitch", "Twitch", "twitch", "#9146ff", "#ffffff"],
  ["kick", "Kick", "kick", "#0f2417", "#53fc18"],
  ["whatsapp", "WhatsApp", "whatsapp", "#25d366", "#062e17"],
  ["telegram", "Telegram", "telegram", "#229ed9", "#ffffff"],
  ["threads", "Threads", "threads", "#101010", "#ffffff"],
];

function lowerThird(
  id: string,
  label: string,
  desc: string,
  bg: string,
  fg: string,
  accent: string,
  animType: string,
  previewAnim: string,
): AnimPreset {
  return {
    id,
    label,
    desc,
    category: "Lower Thirds",
    preview: { anim: previewAnim, bg, fg, accent, shape: "lower" },
    build: (layers, identity) => {
      const bar = {
        ...createShapeLayer(layers, "rounded"),
        name: `${label} · fundo`,
        fill: bg,
        stroke: accent,
        strokeWidth: 2,
        x: 6,
        y: 70,
        width: 60,
        height: 9,
        radius: 12,
        animationIn: anim(animType, 0.6),
        animationOut: anim("fadeIn", 0.4),
      };
      const name = text([...layers, bar], identity.name, {
        name: `${label} · nome`,
        x: 9,
        y: 71,
        width: 52,
        height: 4.5,
        fontSize: 52,
        fontWeight: 800,
        color: fg,
        align: "left",
        shadow: false,
        animationIn: anim(animType, 0.6, 0.1),
      });
      const role = text([...layers, bar, name], identity.role, {
        name: `${label} · cargo`,
        x: 9,
        y: 75.2,
        width: 52,
        height: 3,
        fontSize: 32,
        fontWeight: 500,
        color: accent,
        align: "left",
        shadow: false,
        animationIn: anim(animType, 0.6, 0.2),
      });
      return [bar, name, role];
    },
  };
}

function ctaPreset(
  id: string,
  label: string,
  desc: string,
  copy: string,
  bg: string,
  fg: string,
  animType: string,
  previewAnim: string,
): AnimPreset {
  return {
    id,
    label,
    desc,
    category: "CTA",
    preview: { anim: previewAnim, bg, fg, shape: "cta" },
    build: (layers, identity) => {
      const btn = {
        ...createShapeLayer(layers, "rounded"),
        name: `${label} · botão`,
        fill: bg,
        stroke: "transparent",
        x: 22,
        y: 84,
        width: 56,
        height: 8,
        radius: 40,
        animationIn: anim(animType, 0.5),
        animationLoop: anim("pulse", 1.2),
      };
      const txt = text([...layers, btn], copy.replace("{handle}", `@${identity.handle}`), {
        name: `${label} · texto`,
        x: 22,
        y: 85.6,
        width: 56,
        height: 4.5,
        fontSize: 46,
        fontWeight: 800,
        color: fg,
        align: "center",
        uppercase: true,
        shadow: false,
        animationIn: anim(animType, 0.5, 0.08),
      });
      return [btn, txt];
    },
  };
}

function textFx(
  id: string,
  label: string,
  desc: string,
  category: AnimCategory,
  copy: string,
  color: string,
  animType: string,
  previewAnim: string,
  extra: Partial<TextLayer> = {},
): AnimPreset {
  return {
    id,
    label,
    desc,
    category,
    preview: { anim: previewAnim, bg: "#111018", fg: color, shape: "text" },
    build: (layers, identity) => [
      text(layers, copy.replace("{handle}", `@${identity.handle}`).replace("{name}", identity.name), {
        name: label,
        x: 10,
        y: 34,
        width: 80,
        height: 12,
        fontSize: 88,
        fontWeight: 900,
        color,
        align: "center",
        uppercase: true,
        strokeColor: "#000000",
        strokeWidth: 6,
        animationIn: anim(animType, 0.7),
        animationLoop: anim(animType === "pulse" ? "pulse" : "float", 1.6),
        ...extra,
      }),
    ],
  };
}

function shapeFx(
  id: string,
  label: string,
  desc: string,
  category: AnimCategory,
  fill: string,
  shape: "rect" | "rounded" | "circle" | "line",
  box: { x: number; y: number; width: number; height: number },
  animType: string,
  previewAnim: string,
): AnimPreset {
  return {
    id,
    label,
    desc,
    category,
    preview: { anim: previewAnim, bg: fill, fg: "#ffffff", shape: "block" },
    build: (layers) => [
      {
        ...createShapeLayer(layers, shape),
        name: label,
        fill,
        stroke: "transparent",
        ...box,
        zIndex: nextZ(layers),
        animationIn: anim(animType, 0.6),
        animationLoop: anim("float", 2),
      },
    ],
  };
}

export const ANIM_PRESETS: AnimPreset[] = [
  // ---------- Social (personalizável com o @ do usuário) ----------
  ...SOCIALS.map(([id, label, net, bg, fg]) => socialPill(`social-${id}`, label!, net!, bg!, fg!)),
  {
    id: "social-follow-ring",
    label: "Me Siga",
    desc: "Anel animado com badge SEGUIR",
    category: "Social",
    preview: { anim: "tp-punch", bg: "#7c5cff", fg: "#ffffff", shape: "pill", icon: "bell" },
    build: (layers, identity) => {
      const ring = {
        ...createShapeLayer(layers, "circle"),
        name: "Me siga · anel",
        fill: "transparent",
        stroke: "#7c5cff",
        strokeWidth: 8,
        x: 8,
        y: 8,
        width: 16,
        height: 9,
        animationIn: anim("scaleIn", 0.5),
        animationLoop: anim("pulse", 1.4),
      };
      const badge = text([...layers, ring], `SEGUIR @${identity.handle}`, {
        name: "Me siga · texto",
        x: 26,
        y: 10,
        width: 50,
        height: 4,
        fontSize: 40,
        fontWeight: 800,
        color: "#ffffff",
        align: "left",
        background: "#7c5cff",
        padding: 12,
        radius: 30,
        shadow: false,
        animationIn: anim("slideLeft", 0.5, 0.1),
      });
      return [ring, badge];
    },
  },
  {
    id: "social-bell",
    label: "Sininho",
    desc: "Sino com notificação e balanço",
    category: "Social",
    preview: { anim: "tp-swing", bg: "#ff0033", fg: "#ffffff", shape: "pill", icon: "bell" },
    build: (layers) => [
      text(layers, "🔔 ATIVE O SININHO", {
        name: "Sininho",
        x: 24,
        y: 8,
        width: 52,
        height: 5,
        fontSize: 42,
        fontWeight: 800,
        color: "#ffffff",
        background: "#ff0033",
        padding: 14,
        radius: 30,
        shadow: false,
        animationIn: anim("bounce", 0.6),
        animationLoop: anim("swing", 1.6),
      }),
    ],
  },

  // ---------- Lower thirds ----------
  lowerThird("lt-minimal", "Lower Third — Minimal", "Linha fina + nome e cargo", "#0b0b12", "#ffffff", "#9aa4b2", "slideLeft", "tp-left"),
  lowerThird("lt-bold", "Lower Third — Bold Bar", "Barra cheia com acento colorido", "#7c5cff", "#ffffff", "#ffe066", "slideUp", "tp-up"),
  lowerThird("lt-glass", "Lower Third — Glass", "Card transparente com blur", "#ffffff22", "#ffffff", "#7cf7ff", "fadeIn", "tp-fade"),
  lowerThird("lt-news", "Lower Third — Notícia", "Faixa de plantão jornalístico", "#c1121f", "#ffffff", "#ffd166", "slideRight", "tp-right"),
  lowerThird("lt-neon", "Lower Third — Neon", "Contorno neon pulsante", "#0d0d18", "#7cf7ff", "#ff4dd8", "scaleIn", "tp-zoom"),
  lowerThird("lt-podcast", "Lower Third — Podcast", "Bloco alto com nome do convidado", "#1b1b26", "#ffffff", "#ffb703", "slideUp", "tp-up"),

  // ---------- CTA ----------
  ctaPreset("cta-follow", "CTA Seguir", "Botão pulsante com seu @", "SEGUIR {handle}", "#7c5cff", "#ffffff", "pop", "tp-punch"),
  ctaPreset("cta-comment", "CTA Comentar", "Chamada para comentário", "COMENTA AÍ 👇", "#ff2e63", "#ffffff", "slideUp", "tp-up"),
  ctaPreset("cta-share", "CTA Compartilhar", "Chamada de compartilhamento", "MANDA PRA ALGUÉM", "#00c2a8", "#04231f", "scaleIn", "tp-zoom"),
  ctaPreset("cta-link", "CTA Link na bio", "Direciona para a bio", "LINK NA BIO", "#ffd166", "#1a1200", "bounce", "tp-punch"),
  ctaPreset("cta-save", "CTA Salvar", "Pedido de salvamento do vídeo", "SALVA PRA NÃO PERDER", "#101018", "#7cf7ff", "fadeIn", "tp-fade"),
  ctaPreset("cta-part2", "CTA Parte 2", "Gancho para a próxima parte", "PARTE 2 NO PERFIL", "#ff6b35", "#1a0a00", "slideLeft", "tp-left"),

  // ---------- Real VFX ----------
  textFx("vfx-impact", "Impacto", "Texto entra com punch e tremor", "Real VFX", "ISSO MUDA TUDO", "#ffffff", "punch", "tp-punch"),
  textFx("vfx-glitch", "Glitch", "Falha digital colorida", "Real VFX", "OLHA ISSO", "#7cf7ff", "glitch", "tp-flash"),
  textFx("vfx-neon", "Neon Flicker", "Brilho neon oscilante", "Real VFX", "AO VIVO", "#ff4dd8", "flicker", "tp-flash"),
  textFx("vfx-typewriter", "Máquina de escrever", "Letra por letra", "Real VFX", "ESCUTA ATÉ O FIM", "#ffd166", "typewriter", "tp-fade"),
  textFx("vfx-fire", "Fogo", "Texto quente com vibração", "Real VFX", "PEGANDO FOGO", "#ff6b35", "shake", "tp-punch"),
  textFx("vfx-zoomblur", "Zoom Blur", "Zoom rápido com desfoque", "Real VFX", "PRESTA ATENÇÃO", "#ffffff", "zoom", "tp-zoom"),

  // ---------- Efeitos ----------
  textFx("fx-countdown", "Contagem", "3 · 2 · 1 antes do gancho", "Efeitos", "3", "#ffffff", "scaleIn", "tp-zoom", { fontSize: 220 }),
  textFx("fx-quote", "Citação", "Frase em destaque com aspas", "Efeitos", "“{name}”", "#ffffff", "fadeIn", "tp-fade", { uppercase: false, fontSize: 64 }),
  textFx("fx-sticker", "Sticker", "Selo girando no canto", "Efeitos", "NOVO", "#1a1200", "swing", "tp-swing", { background: "#ffd166", fontSize: 48, x: 62, y: 12, width: 30, height: 6 }),
  textFx("fx-alert", "Alerta", "Aviso piscando", "Efeitos", "ATENÇÃO", "#ffffff", "flicker", "tp-flash", { background: "#c1121f", fontSize: 54 }),
  shapeFx("fx-progress", "Barra de progresso", "Barra que avança no rodapé", "Efeitos", "#7c5cff", "rect", { x: 0, y: 96, width: 100, height: 1.5 }, "slideRight", "tp-right"),
  shapeFx("fx-flash", "Flash", "Estouro branco entre cortes", "Efeitos", "#ffffff", "rect", { x: 0, y: 0, width: 100, height: 100 }, "fadeIn", "tp-flash"),

  // ---------- Formas ----------
  shapeFx("shape-bar-top", "Barra superior", "Faixa sólida no topo", "Formas", "#0b0b12", "rect", { x: 0, y: 0, width: 100, height: 10 }, "slideDown", "tp-down"),
  shapeFx("shape-bar-bottom", "Barra inferior", "Faixa sólida no rodapé", "Formas", "#0b0b12", "rect", { x: 0, y: 90, width: 100, height: 10 }, "slideUp", "tp-up"),
  shapeFx("shape-card", "Card", "Cartão arredondado para texto", "Formas", "#151522", "rounded", { x: 8, y: 60, width: 84, height: 20 }, "scaleIn", "tp-zoom"),
  shapeFx("shape-circle", "Círculo", "Destaque circular", "Formas", "#7c5cff", "circle", { x: 36, y: 40, width: 28, height: 16 }, "scaleIn", "tp-zoom"),
  shapeFx("shape-line", "Linha", "Divisor animado", "Formas", "#7cf7ff", "line", { x: 20, y: 58, width: 60, height: 0.6 }, "slideLeft", "tp-left"),
  shapeFx("shape-frame", "Moldura", "Contorno na área do vídeo", "Formas", "#ffffff22", "rounded", { x: 4, y: 14, width: 92, height: 62 }, "fadeIn", "tp-fade"),

  // ---------- Interativos ----------
  {
    id: "int-poll",
    label: "Enquete",
    desc: "Duas opções para o público votar",
    category: "Interativos",
    preview: { anim: "tp-up", bg: "#151522", fg: "#ffffff", accent: "#7c5cff", shape: "lower" },
    build: (layers) => {
      const a = text(layers, "SIM", {
        name: "Enquete · A",
        x: 10,
        y: 62,
        width: 36,
        height: 6,
        fontSize: 48,
        fontWeight: 800,
        color: "#ffffff",
        background: "#00c2a8",
        radius: 24,
        shadow: false,
        animationIn: anim("slideLeft", 0.5),
      });
      const b = text([...layers, a], "NÃO", {
        name: "Enquete · B",
        x: 54,
        y: 62,
        width: 36,
        height: 6,
        fontSize: 48,
        fontWeight: 800,
        color: "#ffffff",
        background: "#ff2e63",
        radius: 24,
        shadow: false,
        animationIn: anim("slideRight", 0.5, 0.1),
      });
      return [a, b];
    },
  },
  {
    id: "int-quiz",
    label: "Quiz",
    desc: "Pergunta com resposta revelada",
    category: "Interativos",
    preview: { anim: "tp-fade", bg: "#1b1b26", fg: "#ffd166", shape: "lower" },
    build: (layers) => [
      text(layers, "VOCÊ SABIA?", {
        name: "Quiz · pergunta",
        x: 10,
        y: 20,
        width: 80,
        height: 6,
        fontSize: 64,
        fontWeight: 900,
        color: "#ffd166",
        animationIn: anim("fadeIn", 0.6),
      }),
    ],
  },
  {
    id: "int-swipe",
    label: "Arraste",
    desc: "Seta de arrastar para cima",
    category: "Interativos",
    preview: { anim: "tp-up", bg: "#7c5cff", fg: "#ffffff", shape: "cta" },
    build: (layers) => [
      text(layers, "☝️ ARRASTA PRA CIMA", {
        name: "Arraste",
        x: 20,
        y: 88,
        width: 60,
        height: 5,
        fontSize: 42,
        fontWeight: 800,
        color: "#ffffff",
        shadow: true,
        animationIn: anim("slideUp", 0.5),
        animationLoop: anim("float", 1.2),
      }),
    ],
  },
  {
    id: "int-timer",
    label: "Cronômetro",
    desc: "Contador de urgência",
    category: "Interativos",
    preview: { anim: "tp-punch", bg: "#c1121f", fg: "#ffffff", shape: "cta" },
    build: (layers) => [
      text(layers, "⏱ 00:10", {
        name: "Cronômetro",
        x: 62,
        y: 6,
        width: 32,
        height: 5,
        fontSize: 46,
        fontWeight: 800,
        color: "#ffffff",
        background: "#c1121f",
        radius: 20,
        shadow: false,
        animationIn: anim("pop", 0.4),
        animationLoop: anim("pulse", 1),
      }),
    ],
  },

  // ---------- 3D ----------
  textFx("3d-flip", "Flip 3D", "Texto girando no eixo Y", "3D", "VIROU", "#ffffff", "flip3d", "tp-swing"),
  textFx("3d-depth", "Profundidade", "Camadas com sombra 3D", "3D", "PROFUNDO", "#7cf7ff", "depth3d", "tp-zoom"),
  textFx("3d-cube", "Cubo", "Rotação estilo cubo", "3D", "GIRA", "#ffd166", "cube3d", "tp-whip"),
  textFx("3d-perspective", "Perspectiva", "Entrada em perspectiva", "3D", "CHEGOU", "#ff4dd8", "perspective3d", "tp-drift"),
];

export const ANIM_TOTAL = ANIM_PRESETS.length;

export function searchAnimPresets(category: AnimCategory | "Todos", query: string): AnimPreset[] {
  const q = query.trim().toLowerCase();
  return ANIM_PRESETS.filter(
    (p) =>
      (category === "Todos" || p.category === category) &&
      (!q || `${p.label} ${p.desc} ${p.category}`.toLowerCase().includes(q)),
  );
}
