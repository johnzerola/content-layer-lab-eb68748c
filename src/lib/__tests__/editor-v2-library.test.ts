import { describe, expect, it, vi } from "vitest";
import { AssetCache, BUILT_IN_LIBRARY_ITEMS, EFFECT_DEFINITIONS, LibraryRegistry, MockLibraryProvider, TRANSITION_DEFINITIONS, canPublishBuiltIn, createEffectInstance, transitionFrame, validateAssetLicense, validateTemplateDefinition, type CaptionPresetDefinition, type LibraryItem, type TemplateDefinition } from "@/lib/editor-v2/library";
import { captionWordMotionFrame } from "@/lib/editor-v2/caption-motion";

describe("Library registry", () => {
  it("registra built-ins licenciados, busca e pagina", () => {
    const registry = new LibraryRegistry(BUILT_IN_LIBRARY_ITEMS);
    expect(registry.list().length).toBeGreaterThanOrEqual(50);
    expect(registry.search({ text: "fade", types: ["transition"] }).items.length).toBeGreaterThan(1);
    const captions = registry.search({ types: ["caption"], pageSize: 3 });
    expect(captions).toMatchObject({ page: 1, hasMore: true });
    expect(captions.total).toBeGreaterThan(60);
    expect(registry.search({ types: ["sticker"] }).total).toBe(14);
    expect(registry.search({ types: ["filter"] }).total).toBeGreaterThanOrEqual(12);
    expect(registry.search({ types: ["animation"] }).total).toBeGreaterThanOrEqual(18);
    expect(registry.search({ types: ["video-effect"] }).total).toBe(12);
    expect(registry.list().every(canPublishBuiltIn)).toBe(true);
  });

  it("recusa item externo/built-in com licença desconhecida", () => {
    const invalid = structuredClone(BUILT_IN_LIBRARY_ITEMS[0]!) as LibraryItem;
    invalid.id = "invalid";
    invalid.license.licenseType = "unknown";
    expect(validateAssetLicense(invalid.license)).toContain("licença conhecida é obrigatória");
    expect(() => new LibraryRegistry([invalid])).toThrow(/licença/);
  });

  it("oferece uma coleção dinâmica e segura para Shorts", () => {
    const shorts = BUILT_IN_LIBRARY_ITEMS.filter((item) => item.type === "caption" && item.tags.includes("shorts"));
    expect(shorts.length).toBeGreaterThanOrEqual(13);
    expect(new Set(shorts.map((item) => item.id)).size).toBe(shorts.length);
    expect(shorts.every((item) => {
      const preset = item.definition as CaptionPresetDefinition;
      return preset.mode !== "line" && preset.motion !== "none" && preset.transform.y >= 68 && preset.transform.y <= 80;
    })).toBe(true);
  });
});

describe("Definitions", () => {
  it("mantém transition e effect registries válidos e únicos", () => {
    expect(new Set(TRANSITION_DEFINITIONS.map((item) => item.id)).size).toBe(TRANSITION_DEFINITIONS.length);
    expect(TRANSITION_DEFINITIONS.every((item) => item.durationMin <= item.durationDefault && item.durationDefault <= item.durationMax)).toBe(true);
    expect(new Set(EFFECT_DEFINITIONS.map((item) => item.id)).size).toBe(EFFECT_DEFINITIONS.length);
    expect(createEffectInstance(EFFECT_DEFINITIONS[0]!, "fx-1")).toMatchObject({ id: "fx-1", enabled: true });
    expect(transitionFrame("slide-left", 0).incoming.x).toBe(-1);
    expect(transitionFrame("slide-left", 1).incoming.x).toBe(0);
  });

  it("resolve movimento de legenda de forma determinística para preview e export", () => {
    expect(captionWordMotionFrame("pop", 0, 0, 1, 0, true).scale).toBeLessThan(1);
    expect(captionWordMotionFrame("pop", 0.3, 0, 1, 0, true).scale).toBeCloseTo(1);
    expect(captionWordMotionFrame("fade", 0, 0, 1, 0, true).opacity).toBe(0);
    expect(captionWordMotionFrame("pop", 0, 0, 1, 0, false).scale).toBe(1);
    expect(captionWordMotionFrame("wave", 0.4, 0, 1, 2, false).translateY).not.toBe(0);
  });

  it("valida contrato de template estruturado", () => {
    const valid = BUILT_IN_LIBRARY_ITEMS.find((item) => item.type === "template")!.definition as TemplateDefinition;
    expect(validateTemplateDefinition(valid)).toEqual([]);
    expect(validateTemplateDefinition({ ...valid, duration: 0, placeholders: [...valid.placeholders, valid.placeholders[0]!] })).toEqual(expect.arrayContaining(["duration deve ser positiva", "placeholder duplicado"]));
  });
});

describe("Provider e cache", () => {
  it("permite mockar provider sem rede", async () => {
    const provider = new MockLibraryProvider(BUILT_IN_LIBRARY_ITEMS.slice(0, 2));
    const result = await provider.search({ text: BUILT_IN_LIBRARY_ITEMS[0]!.name.slice(0, 3) });
    expect(result.total).toBeGreaterThan(0);
    expect(await provider.getItem(BUILT_IN_LIBRARY_ITEMS[0]!.id)).not.toBeNull();
  });

  it("indexa cache por providerItemId, hash e versão", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const cache = new AssetCache();
    cache.put({ providerItemId: "pexels-1", hash: "abc", version: 1, value: { url: "local" }, expiresAt: 200 });
    expect(cache.get("pexels-1", "abc", 1)?.value).toEqual({ url: "local" });
    expect(cache.get("pexels-1", "abc", 2)).toBeNull();
    vi.restoreAllMocks();
  });
});
