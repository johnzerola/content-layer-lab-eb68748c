import type { LibraryItem, LibraryProvider, LibrarySearchQuery, LibrarySearchResult } from "./types";

export class MockLibraryProvider implements LibraryProvider {
  readonly id = "mock";
  readonly name = "Provider de teste";
  constructor(private readonly items: LibraryItem[]) {}
  async search(query: LibrarySearchQuery): Promise<LibrarySearchResult> {
    const text = query.text?.toLowerCase() ?? "";
    const items = this.items.filter((item) => item.name.toLowerCase().includes(text));
    return { items, total: items.length, page: 1, hasMore: false };
  }
  async getItem(id: string): Promise<LibraryItem | null> { return this.items.find((item) => item.id === id) ?? null; }
  async download(id: string): Promise<{ assetUrl: string; item: LibraryItem }> {
    const item = await this.getItem(id);
    if (!item) throw new Error("Item não encontrado");
    return { assetUrl: `mock://assets/${id}`, item };
  }
}

/** Adapter HTTP para uma futura edge function. Nenhuma chave entra no navegador. */
export class EdgeLibraryProvider implements LibraryProvider {
  constructor(readonly id: string, readonly name: string, private readonly endpoint: string) {
    if (!endpoint.startsWith("/api/")) throw new Error("Provider deve usar endpoint interno /api/.");
  }
  async search(query: LibrarySearchQuery, signal?: AbortSignal): Promise<LibrarySearchResult> {
    return this.request("search", { query }, signal) as Promise<LibrarySearchResult>;
  }
  async getItem(id: string, signal?: AbortSignal): Promise<LibraryItem | null> {
    return this.request("item", { id }, signal) as Promise<LibraryItem | null>;
  }
  async download(id: string, signal?: AbortSignal): Promise<{ assetUrl: string; item: LibraryItem }> {
    return this.request("download", { id }, signal) as Promise<{ assetUrl: string; item: LibraryItem }>;
  }
  private async request(action: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(`${this.endpoint}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`${this.name}: ${response.status}`);
    return response.json();
  }
}
