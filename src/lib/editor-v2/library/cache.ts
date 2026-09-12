export interface AssetCacheEntry<T = unknown> {
  key: string;
  providerItemId: string;
  hash: string;
  version: number;
  value: T;
  storedAt: number;
  expiresAt?: number;
}

export class AssetCache {
  private entries = new Map<string, AssetCacheEntry>();
  key(providerItemId: string, hash: string, version: number): string { return `${providerItemId}:${hash}:v${version}`; }
  put<T>(entry: Omit<AssetCacheEntry<T>, "key" | "storedAt">): AssetCacheEntry<T> {
    const value: AssetCacheEntry<T> = { ...entry, key: this.key(entry.providerItemId, entry.hash, entry.version), storedAt: Date.now() };
    this.entries.set(value.key, value as AssetCacheEntry);
    return value;
  }
  get<T>(providerItemId: string, hash: string, version: number): AssetCacheEntry<T> | null {
    const entry = this.entries.get(this.key(providerItemId, hash, version));
    if (!entry || (entry.expiresAt !== undefined && entry.expiresAt <= Date.now())) return null;
    return structuredClone(entry) as AssetCacheEntry<T>;
  }
  remove(providerItemId: string, hash: string, version: number): boolean { return this.entries.delete(this.key(providerItemId, hash, version)); }
  clear(): void { this.entries.clear(); }
}

