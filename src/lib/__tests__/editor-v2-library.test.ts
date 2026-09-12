import { describe, expect, it, vi } from "vitest";
import { AssetCache, BUILT_IN_LIBRARY_ITEMS, EFFECT_DEFINITIONS, LibraryRegistry, MockLibraryProvider, TRANSITION_DEFINITIONS, canPublishBuiltIn, transitionFrame, validateAssetLicense, validateTemplateDefinition, type LibraryItem, type TemplateDefinition } from "@/lib/editor-v2/library";

describe("Library registry", () => {
  it("registra built-ins licenciados, busca e pagina", () => {
    const registry = new LibraryRegistry(BUILT_IN_LIBRARY_ITEMS);
    expect(registry.list().length).toBeGreaterThanOrEqual(50);
    expect(registry.search({ text: "fade", types: ["transition"] }).items.length).toBeGreaterThan(1);
    expect(registry.search({ types: ["caption"], pageSize: 3 })).toMatchObject({ total: 8, page: 1, hasMore: true });
    expect(registry.list().every(canPublishBuiltIn)).toBe(true);
  });

  it("recusa item externo/built-in com licença desconhecida", () => {
    const invalid = structuredClone(BUILT_IN_LIBRARY_ITEMS[0]!) as LibraryItem;
    invalid.id = "invalid";
    invalid.license.licenseType = "unknown";
    expect(validateAssetLicense(invalid.license)).toContain("licença conhecida é obrigatória");
    expect(() => new LibraryRegistry([invalid])).toThrow(/licença/);
  });
});

describe("Definitions", () => {
  it("mantém transition e effect registries válidos e únicos", () => {
    expect(new Set(TRANSITION_DEFINITIONS.map((item) => item.id)).size).toBe(TRANSITION_DEFINITIONS.length);
    expect(TRANSITION_DEFINITIONS.every((item) => item.durationMin <= item.durationDefault && item.durationDefault <= item.durationMax)).toBe(true);
    expect(new Set(EFFECT_DEFINITIONS.map((item) => item.id)).size).toBe(EFFECT_DEFINITIONS.length);
    expect(EFFECT_DEFINITIONS[0]!.createInstance("fx-1")).toMatchObject({ id: "fx-1", enabled: true });
    expect(transitionFrame("slide-left", 0).incoming.x).toBe(-1);
    expect(transitionFrame("slide-left", 1).incoming.x).toBe(0);
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

