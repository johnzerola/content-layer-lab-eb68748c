import type { AssetLicenseMetadata } from "../types";
import { ASPECT_SIZES, NEUTRAL_FILTER, TEMPLATE_DOC_VERSION, type AspectRatio, type TemplateDoc, type TemplateLayer } from "@/lib/video-template/types";
import { EFFECT_DEFINITIONS, TRANSITION_DEFINITIONS } from "./definitions";
import { CAPTION_PRESETS } from "@/lib/editor/caption-styles";
import { EFFECTS as LEGACY_EFFECTS } from "@/lib/editor/effects";
import { STICKERS } from "@/lib/editor/stickers";
import { NEUTRAL_VIDEO_ADJUSTMENTS } from "../creative";
import type { CaptionPresetDefinition, CreativeEffectDefinition, FilterPresetDefinition, LibraryItem, LibraryItemType, LibraryPreview, MotionDefinition, StickerDefinition, TemplateDefinition, TextPresetDefinition } from "./types";

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

const motionRows: Array<[string, string, "in" | "out" | "loop", string]> = [
  ["fade", "Fade suave", "in", "Entrada"], ["slide-left", "Deslizar da esquerda", "in", "Entrada"], ["slide-right", "Deslizar da direita", "in", "Entrada"], ["slide-up", "Subir", "in", "Entrada"], ["zoom", "Zoom", "in", "Entrada"], ["pop", "Pop", "in", "Entrada"], ["spin", "Giro", "in", "Entrada"], ["bounce", "Bounce", "in", "Entrada"],
  ["fade", "Fade suave", "out", "Saída"], ["slide-left", "Sair à esquerda", "out", "Saída"], ["slide-right", "Sair à direita", "out", "Saída"], ["slide-down", "Descer", "out", "Saída"], ["zoom", "Zoom", "out", "Saída"], ["spin", "Giro", "out", "Saída"],
  ["float", "Flutuar", "loop", "Loop"], ["pulse", "Pulso", "loop", "Loop"], ["gentle-zoom", "Zoom contínuo", "loop", "Loop"], ["bounce", "Quicar", "loop", "Loop"], ["shake", "Tremor", "loop", "Loop"],
];
const animations = motionRows.map(([nameId, name, slot, category]) => {
  const id = `${slot}-${nameId}`;
  const definition: MotionDefinition = { id, slot, duration: slot === "loop" ? 1.6 : .55, intensity: 1, easing: "easeOut" };
  return item(id, "animation", name, category, { kind: "animation", rendererId: id, sampleText: "MOVIMENTO" }, definition, [slot, "motion"]);
});

const textRows: Array<[string, string, string, Partial<TextPresetDefinition["style"]>]> = [
  ["clean", "Texto limpo", "Texto", { fontFamily: "Figtree", fontSize: 48, fontWeight: 650 }],
  ["bold-hook", "Hook pesado", "Títulos", { fontFamily: "Outfit", fontSize: 74, fontWeight: 900, uppercase: true, letterSpacing: -1.5 }],
  ["editorial", "Editorial", "Títulos", { fontFamily: "Instrument Serif", fontSize: 68, fontWeight: 500, lineHeight: .95 }],
  ["mono", "Código / dados", "Texto", { fontFamily: "JetBrains Mono", fontSize: 42, fontWeight: 700, letterSpacing: 1 }],
  ["highlight", "Destaque marcado", "Destaques", { fontSize: 58, fontWeight: 850, color: "#111319", backgroundColor: "#d8ff52", borderRadius: 8 }],
  ["outline", "Contorno viral", "Títulos", { fontSize: 70, fontWeight: 900, strokeColor: "#000000", strokeWidth: 8, uppercase: true }],
  ["neon", "Neon", "Destaques", { fontSize: 64, fontWeight: 850, color: "#78f7ff", shadow: true, strokeColor: "#17205c", strokeWidth: 4 }],
  ["lower-third", "Nome e função", "Lower thirds", { fontSize: 42, fontWeight: 750, align: "left", backgroundColor: "#10131de8", borderRadius: 12 }],
  ["quote", "Citação", "Editorial", { fontFamily: "Instrument Serif", fontSize: 58, fontWeight: 500, align: "left", color: "#f8efdf" }],
  ["breaking", "Plantão", "Notícias", { fontSize: 52, fontWeight: 900, backgroundColor: "#e51f3f", uppercase: true }],
  ["social", "@seuperfil", "Social", { fontSize: 44, fontWeight: 800, backgroundColor: "#151726dc", borderRadius: 999 }],
  ["cta", "Chamada para ação", "Social", { fontSize: 48, fontWeight: 900, color: "#111319", backgroundColor: "#8df58a", uppercase: true, borderRadius: 12 }],
];
const text = textRows.map(([id, name, category, style]) => {
  const definition: TextPresetDefinition = { id, style: { text: name === "Nome e função" ? "NOME · FUNÇÃO" : name === "@seuperfil" ? "@SEUPERFIL" : "SUA HISTÓRIA COMEÇA AQUI", fontFamily: "Outfit", fontSize: 54, fontWeight: 760, align: "center", color: "#f8f7ff", backgroundColor: "transparent", borderRadius: 10, ...style } };
  return item(id, "text", name, category, { kind: "text", rendererId: id, sampleText: definition.style.text ?? name }, definition, ["tipografia", category.toLowerCase()]);
});

const captions = CAPTION_PRESETS.map((preset) => {
  const id = preset.id, name = preset.name, mode = preset.style.mode, motion = preset.animation, color = preset.style.color, backgroundColor = preset.style.background ?? "transparent", activeWordColor = preset.style.highlightColor;
  const definition: CaptionPresetDefinition = {
    id, name, mode, motion, rendererId: id,
    transform: { x: 50, y: 84, width: 86, height: 14, scale: 1, rotation: 0, opacity: 1 },
    style: { text: "LEGENDA EM TEMPO REAL", fontFamily: preset.style.fontFamily, fontSize: preset.style.fontSize, fontWeight: preset.style.fontWeight, align: preset.style.align, color, backgroundColor, borderRadius: 10, strokeColor: preset.style.strokeColor, strokeWidth: preset.style.strokeWidth, shadow: preset.style.shadow, uppercase: preset.style.uppercase, highlight: preset.style.highlight, highlightColor: preset.style.highlightColor, maxWords: preset.style.maxWords, maxLines: preset.style.maxLines },
    activeWordColor, inactiveWordOpacity: mode === "karaoke" ? 0.48 : 0.78,
  };
  return item(id, "caption", name, preset.categories[0] ?? "Legendas", { kind: "caption", rendererId: id, sampleText: "LEGENDA EM TEMPO REAL", colors: [activeWordColor, backgroundColor, color] }, definition, ["legenda", mode, ...preset.categories]);
});

// IDs mantidos para projetos e fixtures criados nas fases iniciais do V2.
const captionAliases = [
  { id: "word-highlight", name: "Word Highlight", mode: "word" as const, motion: "pop", color: "#ffffff", backgroundColor: "transparent", activeWordColor: "#b7ff4a" },
  { id: "karaoke", name: "Karaoke", mode: "karaoke" as const, motion: "none", color: "#d9dbe7", backgroundColor: "#12131ccc", activeWordColor: "#8d73ff" },
].map((preset) => {
  const definition: CaptionPresetDefinition = { ...preset, rendererId: preset.id, transform: { x: 50, y: 84, width: 86, height: 14, scale: 1, rotation: 0, opacity: 1 }, style: { text: "LEGENDA EM TEMPO REAL", fontFamily: "Outfit", fontSize: 52, fontWeight: 850, align: "center", color: preset.color, backgroundColor: preset.backgroundColor, borderRadius: 10, strokeColor: "#000000", strokeWidth: 6, shadow: true, uppercase: true, highlight: "color", highlightColor: preset.activeWordColor, maxWords: 4, maxLines: 2 }, inactiveWordOpacity: .48 };
  return item(preset.id, "caption", preset.name, "Legendas", { kind: "caption", rendererId: preset.id, sampleText: "LEGENDA EM TEMPO REAL", colors: [preset.activeWordColor, preset.backgroundColor, preset.color] }, definition, ["legenda", preset.mode, "compatibilidade"]);
});

const effects = LEGACY_EFFECTS.map((effect) => {
  const definition: CreativeEffectDefinition = { id: effect.id, duration: effect.suggested || 4, intensity: .6 };
  return item(effect.id, "video-effect", effect.label, "Efeitos", { kind: "effect", rendererId: effect.id, colors: ["#f5b35c", "#4935b8"] }, definition, [effect.hint, "não destrutivo"]);
});

const filterRows: Array<[string, string, string, Partial<FilterPresetDefinition["adjustments"]>]> = [
  ["clean", "Limpo", "Essenciais", {}], ["vivid", "Vibrante", "Social", { saturation: .38, contrast: .12, brightness: .04 }], ["warm", "Dourado", "Retrato", { temperature: .55, saturation: .12, highlights: -.08 }], ["cool", "Azul urbano", "Cinemático", { temperature: -.5, tint: -.08, contrast: .18 }], ["cinema", "Cinema", "Cinemático", { contrast: .26, saturation: -.12, highlights: -.2, shadows: .1, vignette: .25 }], ["moody", "Moody", "Cinemático", { exposure: -.08, contrast: .34, saturation: -.2, shadows: -.18 }], ["soft", "Pele suave", "Retrato", { contrast: -.12, highlights: -.18, shadows: .18, fade: .12 }], ["crisp", "Detalhe nítido", "Essenciais", { contrast: .12, sharpen: .42, saturation: .08 }], ["retro", "Filme retrô", "Analógico", { fade: .3, grain: .24, temperature: .18, saturation: -.18 }], ["bw", "Preto e branco", "Clássicos", { saturation: -1, contrast: .22, grain: .08 }], ["night", "Noite neon", "Social", { exposure: -.12, contrast: .3, saturation: .45, tint: .35 }], ["food", "Comida", "Social", { saturation: .28, temperature: .3, contrast: .1, sharpen: .18 }],
];
const filters = filterRows.map(([id, name, category, patch]) => { const definition: FilterPresetDefinition = { id, adjustments: { ...NEUTRAL_VIDEO_ADJUSTMENTS, ...patch } }; return item(id, "filter", name, category, { kind: "filter", rendererId: id, colors: ["#f2b45e", "#5640b8"] }, definition, ["cor", "look"]); });

const stickers = STICKERS.map((sticker) => { const definition: StickerDefinition = { id: sticker.id, text: sticker.text, color: sticker.id.includes("heart") ? "#ff3d68" : "#7657ff", accent: "#ffffff", ratio: sticker.ratio, speed: 1 }; return item(sticker.id, "sticker", sticker.label, sticker.group, { kind: "sticker", rendererId: sticker.id, sampleText: sticker.text, colors: [definition.color, definition.accent] }, definition, ["adesivo", sticker.hint]); });

const shapes = ["Rectangle", "Circle", "Line", "Gradient"].map((name) => item(name.toLowerCase(), "shape", name, "Formas", { kind: "shape", rendererId: name.toLowerCase(), colors: ["#8d73ff", "#43d6b2"] }, { shape: name.toLowerCase() }, ["elemento"]));

const layerBase = (id: string, name: string, type: TemplateLayer["type"], x: number, y: number, width: number, height: number, startTime = 0, endTime: number | null = null) => ({ id, name, type, bindingType: "STATIC" as const, x, y, width, height, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, startTime, endTime });
const textLayer = (id: string, text: string, x: number, y: number, width: number, height: number, color: string, size: number, background: string | null = null): TemplateLayer => ({ ...layerBase(id, id, "text", x, y, width, height), type: "text", text, fontFamily: "Outfit", fontWeight: 800, fontSize: size, color, align: "left", letterSpacing: 0, lineHeight: .95, uppercase: true, italic: false, underline: false, strokeColor: "transparent", strokeWidth: 0, shadow: false, background, padding: 12, radius: 12 });
const shapeLayer = (id: string, x: number, y: number, width: number, height: number, fill: string, shape: "rect" | "rounded" | "circle" | "line" = "rounded"): TemplateLayer => ({ ...layerBase(id, id, "shape", x, y, width, height), type: "shape", shape, fill, stroke: "transparent", strokeWidth: 0, radius: 18 });
const makeTemplate = (id: string, name: string, duration: number, aspectRatio: AspectRatio, background: string, layers: TemplateLayer[], placeholders: TemplateDefinition["placeholders"], tags: string[]) => {
  const size = ASPECT_SIZES[aspectRatio];
  const document: TemplateDoc = { version: TEMPLATE_DOC_VERSION, name, aspectRatio, canvas: { ...size, background: { kind: "color", color: background } }, filter: { ...NEUTRAL_FILTER }, layers, settings: { source: "editor-v2-builtin", rendererId: id } };
  const definition: TemplateDefinition = { id, name, duration, aspectRatios: [aspectRatio], placeholders, previewTime: Math.min(1, duration / 2), document };
  return item(id, "template", name, "Modelos", { kind: "template", rendererId: id, sampleText: layers.find((layer) => layer.type === "text") && "text" in layers.find((layer) => layer.type === "text")! ? String((layers.find((layer) => layer.type === "text") as { text: string }).text) : name, colors: [layers.find((layer) => layer.type === "shape") && "fill" in layers.find((layer) => layer.type === "shape")! ? String((layers.find((layer) => layer.type === "shape") as { fill: string }).fill) : "#7357ff", background, "#ffffff"] }, definition, tags);
};

const templates = [
  makeTemplate("social-focus", "Social Focus", 12, "9:16", "#090b12", [shapeLayer("media", 50, 38, 86, 58, "#242b3d"), shapeLayer("accent", 12, 72, 15, 1.2, "#8d73ff", "line"), textLayer("headline", "CONTE UMA HISTÓRIA", 50, 81, 78, 16, "#ffffff", 64)], [{ id: "headline", kind: "text" }, { id: "media", kind: "media" }], ["reels", "vertical"]),
  makeTemplate("clean-podcast", "Clean Podcast", 18, "9:16", "#10131c", [shapeLayer("portrait", 50, 39, 80, 58, "#253047"), textLayer("label", "PODCAST / NOVO EPISÓDIO", 50, 72, 78, 8, "#27cfa5", 28), textLayer("headline", "UMA IDEIA QUE VALE O CORTE", 50, 82, 78, 15, "#ffffff", 54)], [{ id: "speaker", kind: "media" }, { id: "captions", kind: "captions" }], ["fala", "legenda"]),
  makeTemplate("news-pulse", "News Pulse", 10, "9:16", "#11131a", [shapeLayer("red-band", 50, 13, 100, 16, "#ef294f", "rect"), textLayer("breaking", "AGORA / EM DESTAQUE", 50, 13, 88, 8, "#ffffff", 34), shapeLayer("media", 50, 48, 88, 48, "#292d39"), textLayer("headline", "O FATO EM UMA FRASE", 50, 80, 86, 14, "#ffffff", 54)], [{ id: "headline", kind: "text" }, { id: "media", kind: "media" }], ["notícia", "vertical"]),
  makeTemplate("product-glow", "Product Glow", 9, "9:16", "#090c13", [shapeLayer("glow", 50, 42, 64, 38, "#714cff", "circle"), shapeLayer("product", 50, 44, 52, 42, "#22283a"), textLayer("eyebrow", "DESCOBRIR", 50, 70, 78, 6, "#70e6c1", 24), textLayer("headline", "SEU PRODUTO EM FOCO", 50, 80, 80, 15, "#ffffff", 58)], [{ id: "product", kind: "media" }, { id: "headline", kind: "text" }], ["produto", "ugc"]),
];

export const BUILT_IN_LIBRARY_ITEMS: LibraryItem[] = [...templates, ...transitions, ...effects, ...filters, ...text, ...captions, ...captionAliases, ...animations, ...stickers, ...shapes];
