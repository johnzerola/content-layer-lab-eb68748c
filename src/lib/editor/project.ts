/**
 * EDITING PROJECT — documento não destrutivo do editor.
 * Reutiliza o TemplateDoc como composição visual e guarda tudo o que é
 * específico do vídeo (mídia, cortes, legenda, título) por fora dele.
 */
import { createTemplateDoc } from "@/lib/video-template/factory";
import type { AspectRatio, TemplateDoc } from "@/lib/video-template/types";
import type { TimeRange } from "./transcript";

export const EDITOR_PROJECT_MODE = "video-editor";
export const EDITOR_PROJECT_VERSION = 1;

export interface EditorMedia {
  /** mídia original usada no render final */
  originalUrl: string | null;
  /** versão leve (360p/540p) usada apenas no preview do editor */
  proxyUrl: string | null;
  posterUrl: string | null;
  duration: number;
  width?: number | null;
  height?: number | null;
}

export interface EditorProjectDoc {
  version: number;
  videoId: string;
  cutId: string | null;
  title: string;
  hook: string;
  cta: string;
  language: string;
  media: EditorMedia;
  /** cortes derivados da transcrição / silêncios — nunca alteram o arquivo */
  removedRanges: TimeRange[];
  transcriptId: string | null;
  captionPresetId: string;
  templateId: string | null;
  templateInstanceId: string | null;
  composition: TemplateDoc;
  timelineZoom: number;
}

export function createEditorProject(
  videoId: string,
  { title = "Novo corte", aspectRatio = "9:16" as AspectRatio, media }: {
    title?: string;
    aspectRatio?: AspectRatio;
    media?: Partial<EditorMedia>;
  } = {},
): EditorProjectDoc {
  return {
    version: EDITOR_PROJECT_VERSION,
    videoId,
    cutId: null,
    title,
    hook: "",
    cta: "",
    language: "pt-BR",
    media: {
      originalUrl: media?.originalUrl ?? null,
      proxyUrl: media?.proxyUrl ?? null,
      posterUrl: media?.posterUrl ?? null,
      duration: media?.duration ?? 0,
      width: media?.width ?? null,
      height: media?.height ?? null,
    },
    removedRanges: [],
    transcriptId: null,
    captionPresetId: "verde-impacto",
    templateId: null,
    templateInstanceId: null,
    composition: createTemplateDoc(title, aspectRatio),
    timelineZoom: 1,
  };
}

/** URL preferida para o preview (proxy quando existir). */
export function previewUrl(doc: EditorProjectDoc): string | null {
  return doc.media.proxyUrl ?? doc.media.originalUrl;
}

/** Substitui os valores dinâmicos ({{title}}, {{hook}}...) de um texto. */
export function resolveVariables(text: string, doc: EditorProjectDoc, extra: Record<string, string> = {}): string {
  const vars: Record<string, string> = {
    title: doc.title,
    hook: doc.hook,
    cta: doc.cta,
    subtitle: doc.title,
    ...extra,
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}
