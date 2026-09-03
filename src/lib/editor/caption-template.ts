/**
 * TEMPLATE DE LEGENDA PRÓPRIO (identidade "Real" do VaiViral).
 *
 * É um bloco de legenda autoral: texto e duração ajustáveis por linha, estilo
 * fechado (tipografia, cor, destaque e caixa) e posição na tela. Vive sozinho:
 * a tela /estilos edita, pré-visualiza e aplica sobre qualquer layout, sem
 * depender do painel de legendas do editor.
 *
 * Só apresentação — nenhuma regra de negócio, rota ou contrato muda.
 */
import { createTextLayer, nextZ } from "@/lib/video-template/factory";
import type { TemplateLayer, TextLayer } from "@/lib/video-template/types";
import type { BrandKit } from "@/lib/brand-kit";

export interface CaptionTemplateBlock {
  id: string;
  text: string;
  /** duração do bloco na tela, em segundos */
  dur: number;
}

export interface CaptionTemplateStyle {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  /** cor da caixa atrás do texto — null = sem caixa */
  background: string | null;
  strokeColor: string;
  strokeWidth: number;
  uppercase: boolean;
  align: "left" | "center" | "right";
  radius: number;
  padding: number;
  /** posição vertical em % do canvas */
  y: number;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  createdAt: number;
  /** atraso antes do primeiro bloco, em segundos */
  startAt: number;
  blocks: CaptionTemplateBlock[];
  style: CaptionTemplateStyle;
}

export function blockId(): string {
  return `cb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Modelo autoral: caixa sólida, tipografia pesada, ritmo de 1,6s por bloco. */
export function defaultCaptionTemplate(): CaptionTemplate {
  return {
    id: "real-base",
    name: "Legenda Real",
    createdAt: Date.now(),
    startAt: 0,
    blocks: [
      { id: blockId(), text: "Isso muda tudo", dur: 1.6 },
      { id: blockId(), text: "Presta atenção nos 5 segundos", dur: 2 },
      { id: blockId(), text: "Salva pra não perder", dur: 1.8 },
    ],
    style: {
      fontFamily: "Outfit, sans-serif",
      fontWeight: 900,
      fontSize: 82,
      color: "#ffffff",
      background: "#101014",
      strokeColor: "#000000",
      strokeWidth: 0,
      uppercase: true,
      align: "center",
      radius: 20,
      padding: 22,
      y: 68,
    },
  };
}

export function captionTemplateDuration(t: CaptionTemplate): number {
  return t.startAt + t.blocks.reduce((sum, b) => sum + Math.max(0.2, b.dur), 0);
}

/** Aplica as cores/fontes do Brand Kit sobre o template, sem perder o texto. */
export function withBrand(t: CaptionTemplate, kit?: BrandKit | null): CaptionTemplate {
  if (!kit) return t;
  return {
    ...t,
    style: {
      ...t.style,
      fontFamily: kit.headingFont || t.style.fontFamily,
      background: t.style.background ? kit.primary : null,
    },
  };
}

/**
 * Converte o template em camadas de texto com janela de tempo sequencial,
 * prontas para entrar na composição do editor profissional.
 */
export function buildCaptionTemplateLayers(
  t: CaptionTemplate,
  existing: TemplateLayer[] = [],
): TextLayer[] {
  const z = nextZ(existing);
  let cursor = Math.max(0, t.startAt);
  return t.blocks
    .filter((b) => b.text.trim())
    .map((b, i) => {
      const dur = Math.max(0.2, b.dur);
      const start = cursor;
      cursor += dur;
      const layer = createTextLayer(existing, b.text);
      return {
        ...layer,
        id: `${layer.id}_${i}`,
        name: `Legenda ${i + 1}`,
        x: 8,
        width: 84,
        y: t.style.y,
        height: 12,
        zIndex: z + 10 + i,
        startTime: start,
        endTime: start + dur,
        fontFamily: t.style.fontFamily,
        fontWeight: t.style.fontWeight,
        fontSize: t.style.fontSize,
        color: t.style.color,
        align: t.style.align,
        uppercase: t.style.uppercase,
        strokeColor: t.style.strokeColor,
        strokeWidth: t.style.strokeWidth,
        background: t.style.background,
        radius: t.style.radius,
        padding: t.style.padding,
        shadow: true,
        animationIn: { type: "pop", duration: 0.22, delay: 0, easing: "easeOut" as const },
        animationOut: { type: "fade", duration: 0.18, delay: 0, easing: "easeIn" as const },
      } satisfies TextLayer;
    });
}

/* ---------- persistência local + handoff para o editor ---------- */

const KEY = "vaiviral.captiontemplates.v1";
const PENDING = "vaiviral.captiontemplate.pending";

export function listCaptionTemplates(): CaptionTemplate[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CaptionTemplate[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

export function saveCaptionTemplate(t: CaptionTemplate): CaptionTemplate {
  const item: CaptionTemplate = {
    ...t,
    id: t.id === "real-base" ? `ct_${Date.now().toString(36)}` : t.id,
    createdAt: Date.now(),
  };
  const list = [item, ...listCaptionTemplates().filter((x) => x.id !== item.id)].slice(0, 40);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* armazenamento cheio */
  }
  return item;
}

export function deleteCaptionTemplate(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listCaptionTemplates().filter((t) => t.id !== id)));
  } catch {
    /* ignora */
  }
}

export function setPendingCaptionTemplate(t: CaptionTemplate) {
  try {
    localStorage.setItem(PENDING, JSON.stringify(t));
  } catch {
    /* ignora */
  }
}

export function takePendingCaptionTemplate(): CaptionTemplate | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(PENDING);
  if (!raw) return null;
  localStorage.removeItem(PENDING);
  try {
    return JSON.parse(raw) as CaptionTemplate;
  } catch {
    return null;
  }
}
