import { NEUTRAL_FILTER, type TemplateDoc, type TemplateLayer, type VideoTemplateRecord } from "@/lib/video-template/types";
import type { AssetLicenseMetadata } from "../types";
import type { LibraryItem, TemplateDefinition } from "./types";

const userLicense: AssetLicenseMetadata = {
  provider: "Usuário",
  sourceUrl: "internal://user-video-templates",
  licenseType: "Conteúdo criado pelo usuário",
  licenseUrl: "internal://user-content",
  author: "Usuário",
  attributionRequired: false,
  commercialUseAllowed: true,
  redistributionAllowed: false,
};

function layerForEditorV2(layer: TemplateLayer): TemplateLayer {
  if ((layer as TemplateLayer & { coordinateOrigin?: string }).coordinateOrigin === "center") return structuredClone(layer);
  return { ...structuredClone(layer), x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
}

export function userTemplateLibraryItem(record: VideoTemplateRecord): LibraryItem<TemplateDefinition> {
  const layers = record.template_data.layers.map(layerForEditorV2);
  const document: TemplateDoc = {
    ...structuredClone(record.template_data),
    filter: { ...NEUTRAL_FILTER, ...record.template_data.filter },
    layers,
    settings: { ...record.template_data.settings, source: "user-template", sourceTemplateId: record.id, coordinateOrigin: "center" },
  };
  const duration = Math.max(1, ...layers.map((layer) => layer.endTime ?? 8));
  const firstText = layers.find((layer) => layer.type === "text");
  const firstShape = layers.find((layer) => layer.type === "shape");
  const background = document.canvas.background.kind === "color" ? document.canvas.background.color : "#0b0d15";
  const accent = firstShape?.type === "shape" ? firstShape.fill : "#7657ff";
  const definition: TemplateDefinition = {
    id: record.id,
    name: record.name,
    duration,
    aspectRatios: [record.aspect_ratio],
    placeholders: layers.filter((layer) => layer.type === "text").map((layer) => ({ id: layer.id, kind: "text" as const })),
    previewTime: Math.min(1, duration / 2),
    document,
  };
  return {
    id: `user.template.${record.id}`,
    type: "template",
    name: record.name,
    description: record.description ?? "Modelo criado por você no editor.",
    category: record.category ?? "Meus modelos",
    tags: ["meu modelo", "reutilizável", ...record.tags],
    source: "user",
    sourceId: record.id,
    preview: { kind: "template", rendererId: record.id, sampleText: firstText?.type === "text" ? firstText.text : record.name, colors: [accent, background, "#ffffff"] },
    ...(record.thumbnail_url ? { thumbnail: record.thumbnail_url } : {}),
    duration,
    aspectRatios: [record.aspect_ratio],
    license: userLicense,
    version: record.template_version,
    compatibility: { minEditorVersion: 2 },
    downloadState: "not-required",
    cacheState: "fresh",
    definition,
  };
}
