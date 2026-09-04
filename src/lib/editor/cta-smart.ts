/**
 * STICKER CTA INTELIGENTE.
 *
 * A partir da plataforma (Instagram, TikTok, Shorts), do objetivo e do
 * canal/link do usuário, monta o sticker animado certo: texto no idioma e no
 * jargão de cada rede, animação/velocidade compatível e posição segura
 * (fora da UI nativa de cada plataforma).
 */
import type { StickerId } from "@/lib/editor/stickers";

export type CtaPlatform = "instagram" | "tiktok" | "shorts";
export type CtaGoal = "seguir" | "curtir" | "comentar" | "compartilhar" | "inscrever" | "link";

export interface CtaPlatformDef {
  id: CtaPlatform;
  label: string;
  /** cores sugeridas (fundo/detalhe) */
  color: string;
  accent: string;
  /** margem inferior segura (% da altura) — evita a UI nativa do app */
  safeBottom: number;
  goals: CtaGoal[];
}

export const CTA_PLATFORMS: CtaPlatformDef[] = [
  {
    id: "instagram",
    label: "Instagram",
    color: "#d62976",
    accent: "#ffffff",
    safeBottom: 22,
    goals: ["seguir", "curtir", "comentar", "compartilhar", "link"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    color: "#00f2ea",
    accent: "#0b0b0f",
    safeBottom: 26,
    goals: ["seguir", "curtir", "comentar", "compartilhar", "link"],
  },
  {
    id: "shorts",
    label: "YouTube Shorts",
    color: "#ff0033",
    accent: "#ffffff",
    safeBottom: 18,
    goals: ["inscrever", "curtir", "comentar", "compartilhar", "link"],
  },
];

export const CTA_GOAL_LABELS: Record<CtaGoal, string> = {
  seguir: "Ganhar seguidores",
  curtir: "Receber curtidas",
  comentar: "Gerar comentários",
  compartilhar: "Ser compartilhado",
  inscrever: "Inscritos no canal",
  link: "Cliques no link",
};

export interface SmartCta {
  stickerId: StickerId;
  text: string;
  color: string;
  accent: string;
  speed: number;
  /** posição/tamanho em % do canvas */
  x: number;
  y: number;
  width: number;
  height: number;
  /** janela sugerida (s) a partir do tempo atual */
  duration: number;
  hint: string;
}

type Recipe = { sticker: StickerId; text: (handle: string) => string; speed: number; ratio: number; hint: string };

const RECIPES: Record<CtaPlatform, Partial<Record<CtaGoal, Recipe>>> = {
  instagram: {
    seguir: {
      sticker: "follow",
      text: (h) => `SEGUE ${h || "@seuperfil"}`,
      speed: 1.1,
      ratio: 3.4,
      hint: "Botão de seguir no ritmo do Reels",
    },
    curtir: { sticker: "heart-burst", text: () => "", speed: 1.2, ratio: 1, hint: "Explosão de corações" },
    comentar: { sticker: "comment", text: () => "COMENTA AÍ 👇", speed: 1, ratio: 3, hint: "Balão pulsando" },
    compartilhar: {
      sticker: "share",
      text: () => "MANDA PRO SEU AMIGO",
      speed: 1,
      ratio: 3.6,
      hint: "Envio por direct",
    },
    link: { sticker: "arrow-up", text: () => "", speed: 1.2, ratio: 1, hint: "Aponta para o link na bio" },
  },
  tiktok: {
    seguir: {
      sticker: "follow",
      text: (h) => `SEGUE ${h || "@seuperfil"}`,
      speed: 1.3,
      ratio: 3.4,
      hint: "Ritmo rápido de FYP",
    },
    curtir: { sticker: "like", text: () => "CURTE AÍ", speed: 1.3, ratio: 2.6, hint: "Coração batendo rápido" },
    comentar: { sticker: "comment", text: () => "COMENTA O QUE ACHOU", speed: 1.2, ratio: 3, hint: "Puxa comentário" },
    compartilhar: { sticker: "share", text: () => "COMPARTILHA", speed: 1.2, ratio: 3.6, hint: "Seta de envio" },
    link: { sticker: "tap", text: () => "", speed: 1.3, ratio: 1, hint: "Toque no perfil" },
  },
  shorts: {
    inscrever: {
      sticker: "subscribe",
      text: (h) => (h ? `INSCREVA-SE ${h}` : "INSCREVA-SE"),
      speed: 1,
      ratio: 3.2,
      hint: "Botão vermelho do YouTube",
    },
    curtir: { sticker: "like", text: () => "DEIXA O LIKE", speed: 1, ratio: 2.6, hint: "Like clássico" },
    comentar: { sticker: "comment", text: () => "COMENTA AQUI", speed: 1, ratio: 3, hint: "Balão pulsando" },
    compartilhar: { sticker: "share", text: () => "COMPARTILHE", speed: 1, ratio: 3.6, hint: "Seta de envio" },
    link: { sticker: "arrow-down", text: () => "", speed: 1.1, ratio: 1, hint: "Aponta para a descrição" },
  },
};

/** Normaliza o que o usuário digitou: @perfil, canal ou URL. */
export function normalizeHandle(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const seg = url.pathname.split("/").filter(Boolean).pop();
      return seg ? `@${seg.replace(/^@/, "")}` : url.hostname.replace(/^www\./, "");
    } catch {
      return raw;
    }
  }
  return raw.startsWith("@") ? raw : `@${raw}`;
}

/** Monta o sticker CTA pronto para a plataforma escolhida. */
export function buildSmartCta(
  platform: CtaPlatform,
  goal: CtaGoal,
  handleInput: string,
  brand?: { color?: string; accent?: string; useBrand?: boolean },
): SmartCta {
  const def = CTA_PLATFORMS.find((p) => p.id === platform) ?? CTA_PLATFORMS[0]!;
  const recipe =
    RECIPES[platform][goal] ??
    RECIPES[platform][def.goals[0]!] ??
    ({ sticker: "follow", text: (h: string) => h || "@seuperfil", speed: 1, ratio: 3.4, hint: "" } as Recipe);

  const handle = normalizeHandle(handleInput);
  const height = recipe.ratio >= 2 ? 9 : 16;
  const width = Math.min(86, height * recipe.ratio * (1080 / 1920) * 1.6);

  return {
    stickerId: recipe.sticker,
    text: recipe.text(handle),
    color: brand?.useBrand && brand.color ? brand.color : def.color,
    accent: brand?.useBrand && brand.accent ? brand.accent : def.accent,
    speed: recipe.speed,
    x: (100 - width) / 2,
    y: Math.max(6, 100 - def.safeBottom - height),
    width,
    height,
    duration: goal === "link" ? 4 : 5,
    hint: `${def.label} · ${CTA_GOAL_LABELS[goal]} — ${recipe.hint}`,
  };
}
