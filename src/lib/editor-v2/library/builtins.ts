import type { AssetLicenseMetadata } from "../types";
import { EFFECT_DEFINITIONS, TRANSITION_DEFINITIONS } from "./definitions";
import type { LibraryItem, LibraryItemType, LibraryPreview } from "./types";

const license: AssetLicenseMetadata = {
  provider: "VaiViral",
  sourceUrl: "internal://editor-v2/programmatic-presets",
  licenseType: "VaiViral Original",
  licenseUrl: "internal://editor-v2/licensing",
  author: "VaiViral",
  attributionRequired: false,
  commercialUseAllowed: true,
  redistributionAllowed: false,
};

function item(id: string, type: LibraryItemType, name: string, category: string, preview: LibraryPreview, definition: unknown, tags: string[] = []): LibraryItem {
  return {
    id: `builtin.${type}.${id}`, type, name, category, preview, definition,
    description: `${name} — preset programático original do Editor V2.`,
    tags: [category.toLowerCase(), ...tags], source: "built-in", sourceId: id,
    license, version: 1, compatibility: { minEditorVersion: 2 },
    downloadState: "not-required", cacheState: "fresh",
  };
}

const transitions = TRANSITION_DEFINITIONS.map((definition) => item(definition.id, "transition", definition.name, "Transições", { kind: "transition", rendererId: definition.rendererId, colors: ["#7257ff", "#21d4a4"] }, definition, ["movimento"]));

const animations = [
  ["in-fade", "Fade", "Entrada"], ["in-slide", "Slide", "Entrada"], ["in-zoom", "Zoom", "Entrada"], ["in-pop", "Pop", "Entrada"],
  ["out-fade", "Fade", "Saída"], ["out-slide", "Slide", "Saída"], ["out-zoom", "Zoom", "Saída"],
  ["loop-float", "Float", "Loop"], ["loop-pulse", "Pulse", "Loop"], ["loop-gentle-zoom", "Gentle Zoom", "Loop"],
].map(([id, name, category]) => item(id!, "animation", name!, category!, { kind: "animation", rendererId: id!, sampleText: "MOVIMENTO" }, { id, mode: category?.toLowerCase(), duration: 0.5 }, ["texto", "motion"]));

const text = ["Clean", "Subtitle", "Title", "Minimal", "Bold", "Social", "Highlight", "Lower Third"].map((name) =>
  item(name.toLowerCase().replaceAll(" ", "-"), "text", name, "Texto", { kind: "text", rendererId: name.toLowerCase(), sampleText: name === "Lower Third" ? "Nome · função" : "Sua história começa aqui" }, { styleId: name.toLowerCase().replaceAll(" ", "-") }, ["tipografia"]),
);

const captions = ["Basic", "Box", "Outline", "Shadow", "Word Highlight", "Karaoke", "Center Social", "Bottom Social"].map((name) =>
  item(name.toLowerCase().replaceAll(" ", "-"), "caption", name, "Legendas", { kind: "caption", rendererId: name.toLowerCase().replaceAll(" ", "-"), sampleText: "LEGENDA EM TEMPO REAL" }, { styleId: name.toLowerCase().replaceAll(" ", "-"), mode: name === "Karaoke" ? "karaoke" : "line" }, ["legenda"]),
);

const effects = EFFECT_DEFINITIONS.map((definition) => item(definition.id, "video-effect", definition.name, "Efeitos", { kind: "effect", rendererId: definition.rendererId, colors: ["#f5b35c", "#4935b8"] }, definition, ["não destrutivo"]));

const shapes = ["Rectangle", "Circle", "Line", "Gradient"].map((name) => item(name.toLowerCase(), "shape", name, "Formas", { kind: "shape", rendererId: name.toLowerCase(), colors: ["#8d73ff", "#43d6b2"] }, { shape: name.toLowerCase() }, ["elemento"]));

const templates = [
  item("social-focus", "template", "Social Focus", "Social", { kind: "template", rendererId: "social-focus", sampleText: "CONTE UMA HISTÓRIA", colors: ["#7357ff", "#0c1018", "#f5f7ff"] }, { id: "social-focus", name: "Social Focus", duration: 12, aspectRatios: ["9:16"], placeholders: [{ id: "headline", kind: "text" }, { id: "media", kind: "media" }] }, ["reels", "vertical"]),
  item("clean-podcast", "template", "Clean Podcast", "Podcast", { kind: "template", rendererId: "clean-podcast", sampleText: "IDEIA EM DESTAQUE", colors: ["#27cfa5", "#10131c", "#ffffff"] }, { id: "clean-podcast", name: "Clean Podcast", duration: 18, aspectRatios: ["9:16", "16:9"], placeholders: [{ id: "speaker", kind: "media" }, { id: "captions", kind: "captions" }] }, ["fala", "legenda"]),
];

export const BUILT_IN_LIBRARY_ITEMS: LibraryItem[] = [...templates, ...transitions, ...effects, ...text, ...captions, ...animations, ...shapes];
