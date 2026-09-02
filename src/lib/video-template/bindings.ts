/** Resolução dos bindings dinâmicos ao aplicar um template a um vídeo/corte. */
import type { BindableVideoSource, TemplateDoc, TemplateLayer } from "./types";

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveLayer(layer: TemplateLayer, source: BindableVideoSource): TemplateLayer {
  const l = { ...layer } as TemplateLayer;
  switch (l.bindingType) {
    case "CUT_VIDEO":
    case "MAIN_VIDEO":
      if (l.type === "video") l.src = source.videoUrl ?? l.src ?? null;
      break;
    case "CUT_COVER":
    case "THUMBNAIL":
      if (l.type === "image") l.src = source.coverUrl ?? source.thumbnailUrl ?? l.src ?? null;
      break;
    case "TITLE":
      if (l.type === "text" && source.title) l.text = source.title;
      break;
    case "USER_LOGO":
      if (l.type === "image" && source.userLogoUrl) l.src = source.userLogoUrl;
      break;
    case "BRAND_LOGO":
      if (l.type === "image" && source.brandLogoUrl) l.src = source.brandLogoUrl;
      break;
    case "USER_MEDIA":
      if ((l.type === "image" || l.type === "video") && source.media?.[l.id]) l.src = source.media[l.id]!;
      break;
    default:
      break;
  }
  // duração dinâmica: camadas ligadas ao corte herdam a duração do corte
  if (l.endTime == null && source.duration && (l.bindingType === "CUT_VIDEO" || l.bindingType === "MAIN_VIDEO")) {
    l.endTime = source.duration;
  }
  return l;
}

/**
 * Aplica o template a um vídeo real, sem alterar o template original.
 * Devolve um novo documento (instance_data) pronto para edição.
 */
export function applyTemplateToVideo(template: TemplateDoc, source: BindableVideoSource): TemplateDoc {
  const doc = deepClone(template);
  doc.layers = doc.layers.map((l) => resolveLayer(l, source));
  doc.sampleVideoUrl = source.videoUrl ?? null;
  doc.settings = {
    ...(doc.settings ?? {}),
    boundSourceId: source.id,
    boundTitle: source.title ?? null,
    boundCaptions: source.captions ?? null,
    boundAt: new Date().toISOString(),
  };
  return doc;
}

/** Lista as camadas que dependem de conteúdo externo. */
export function dynamicLayers(doc: TemplateDoc): TemplateLayer[] {
  return doc.layers.filter((l) => l.bindingType !== "STATIC" && l.bindingType !== "CUSTOM");
}

export { deepClone };
