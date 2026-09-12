import { canPublishBuiltIn, validateAssetLicense } from "./license";
import type { LibraryItem, LibraryItemType, LibrarySearchQuery, LibrarySearchResult } from "./types";

export class LibraryRegistry {
  private items = new Map<string, LibraryItem>();

  constructor(initial: LibraryItem[] = []) {
    initial.forEach((item) => this.register(item));
  }

  register(item: LibraryItem): void {
    const licenseErrors = validateAssetLicense(item.license);
    if (licenseErrors.length) throw new Error(`Asset ${item.id}: ${licenseErrors.join(", ")}`);
    if (item.source === "built-in" && !canPublishBuiltIn(item)) {
      throw new Error(`Asset ${item.id}: item built-in sem licença comercial válida`);
    }
    if (this.items.has(item.id)) throw new Error(`Asset duplicado: ${item.id}`);
    this.items.set(item.id, copyItem(item));
  }

  get(id: string): LibraryItem | null {
    const item = this.items.get(id);
    return item ? copyItem(item) : null;
  }

  list(): LibraryItem[] {
    return [...this.items.values()].map(copyItem);
  }

  categories(type?: LibraryItemType): string[] {
    return [...new Set(this.list().filter((item) => !type || item.type === type).map((item) => item.category))].sort();
  }

  search(query: LibrarySearchQuery = {}): LibrarySearchResult {
    const normalized = query.text?.trim().toLocaleLowerCase("pt-BR") ?? "";
    const filtered = this.list().filter((item) => {
      if (query.types?.length && !query.types.includes(item.type)) return false;
      if (query.category && item.category !== query.category) return false;
      if (query.provider && item.license.provider !== query.provider) return false;
      if (query.duration?.min !== undefined && (item.duration ?? 0) < query.duration.min) return false;
      if (query.duration?.max !== undefined && (item.duration ?? Infinity) > query.duration.max) return false;
      if (query.tags?.length && !query.tags.every((tag) => item.tags.includes(tag))) return false;
      if (query.orientation) {
        const expected = query.orientation === "vertical" ? "9:16" : query.orientation === "horizontal" ? "16:9" : "1:1";
        if (!item.aspectRatios?.includes(expected)) return false;
      }
      if (!normalized) return true;
      return [item.name, item.description, item.category, ...item.tags]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(normalized);
    });
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 24));
    const page = Math.max(1, query.page ?? 1);
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, hasMore: start + pageSize < filtered.length };
  }
}

function copyItem(item: LibraryItem): LibraryItem {
  return {
    ...item,
    tags: [...item.tags],
    preview: { ...item.preview, ...(item.preview.colors ? { colors: [...item.preview.colors] } : {}) },
    ...(item.aspectRatios ? { aspectRatios: [...item.aspectRatios] } : {}),
    ...(item.parameters ? { parameters: { ...item.parameters } } : {}),
    ...(item.defaultParameters ? { defaultParameters: { ...item.defaultParameters } } : {}),
    license: { ...item.license },
    compatibility: {
      ...item.compatibility,
      ...(item.compatibility.aspectRatios ? { aspectRatios: [...item.compatibility.aspectRatios] } : {}),
      ...(item.compatibility.trackKinds ? { trackKinds: [...item.compatibility.trackKinds] } : {}),
      ...(item.compatibility.clipKinds ? { clipKinds: [...item.compatibility.clipKinds] } : {}),
    },
    // Definitions may contain renderer factories. They are immutable registry
    // contracts and are intentionally retained by reference.
    definition: item.definition,
  };
}
