/**
 * ESTILOS REUTILIZÁVEIS: o usuário salva um conjunto (cores + tipografia +
 * animação da legenda + transição) e carrega em qualquer projeto do editor.
 * Guardado no navegador — só apresentação, nenhuma regra de negócio.
 */
import type { CaptionAnimation } from "@/lib/editor/caption-styles";
import type { TransitionKind } from "@/lib/preedit";
import type { CaptionLayerStyle } from "@/lib/video-template/types";

export interface SavedStylePreset {
  id: string;
  name: string;
  createdAt: number;
  /** preset de legenda base */
  presetId: string;
  style: CaptionLayerStyle;
  animation: CaptionAnimation;
  transition: TransitionKind;
}

const KEY = "vaiviral.stylepresets.v1";
const PENDING = "vaiviral.stylepresets.pending";
const PENDING_LAYOUT = "vaiviral.layout.pending";

export function listStylePresets(): SavedStylePreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedStylePreset[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

function persist(list: SavedStylePreset[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 60)));
  } catch {
    /* armazenamento cheio — mantém só em memória */
  }
}

export function saveStylePreset(preset: Omit<SavedStylePreset, "id" | "createdAt">): SavedStylePreset {
  const item: SavedStylePreset = {
    ...preset,
    id: `sp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  persist([item, ...listStylePresets()]);
  return item;
}

export function deleteStylePreset(id: string) {
  persist(listStylePresets().filter((p) => p.id !== id));
}

export function renameStylePreset(id: string, name: string) {
  persist(listStylePresets().map((p) => (p.id === id ? { ...p, name } : p)));
}

/** Estilo escolhido na tela /estilos e aplicado quando o editor abrir. */
export function setPendingStyle(preset: SavedStylePreset) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PENDING, JSON.stringify(preset));
  } catch {
    /* ignora */
  }
}

export function takePendingStyle(): SavedStylePreset | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING);
    if (!raw) return null;
    localStorage.removeItem(PENDING);
    return JSON.parse(raw) as SavedStylePreset;
  } catch {
    return null;
  }
}

/** Layout pronto (hook, fato x fake, lower third, CTA) escolhido em /estilos. */
export function setPendingLayout(templateId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PENDING_LAYOUT, templateId);
  } catch {
    /* ignora */
  }
}

export function takePendingLayout(): string | null {
  if (typeof localStorage === "undefined") return null;
  const id = localStorage.getItem(PENDING_LAYOUT);
  if (id) localStorage.removeItem(PENDING_LAYOUT);
  return id;
}

const PENDING_TEMPLATE = "vaiviral.template.pending";
const PENDING_TRANSITION = "vaiviral.transition.pending";

/** Template de vídeo salvo (tabela video_templates) escolhido em /estilos. */
export function setPendingTemplate(templateId: string) {
  try {
    localStorage.setItem(PENDING_TEMPLATE, templateId);
  } catch {
    /* ignora */
  }
}

export function takePendingTemplate(): string | null {
  if (typeof localStorage === "undefined") return null;
  const id = localStorage.getItem(PENDING_TEMPLATE);
  if (id) localStorage.removeItem(PENDING_TEMPLATE);
  return id;
}

export interface PendingTransition {
  kind: string;
  dur: number;
  /** aplica também nas emendas entre cortes */
  applyAll: boolean;
}

export function setPendingTransition(t: PendingTransition) {
  try {
    localStorage.setItem(PENDING_TRANSITION, JSON.stringify(t));
  } catch {
    /* ignora */
  }
}

export function takePendingTransition(): PendingTransition | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(PENDING_TRANSITION);
  if (!raw) return null;
  localStorage.removeItem(PENDING_TRANSITION);
  try {
    return JSON.parse(raw) as PendingTransition;
  } catch {
    return null;
  }
}
