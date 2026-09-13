/**
 * DIFF DE JSON — versões de templates
 *
 * Versões consecutivas de um template costumam ser quase iguais (o usuário
 * mexe numa camada e salva de novo). Guardar o JSON inteiro a cada versão
 * inflou o histórico para gigabytes. Aqui guardamos só a diferença em
 * relação a uma versão-base completa.
 *
 * Formato do patch:
 * - `{ $s: valor }`  → substitui o valor inteiro (primitivos, arrays, tipos diferentes)
 * - `{ $d: string[], ...chaves }` → objeto: `$d` lista chaves removidas;
 *   cada outra chave guarda o patch recursivo daquele campo.
 * - `null` → sem diferença.
 */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonPatch = { [k: string]: Json | JsonPatch | string[] | undefined } & {
  $s?: Json;
  $d?: string[];
};

function isPlainObject(v: unknown): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Devolve null quando base e next são iguais. */
export function diffJson(base: Json, next: Json): JsonPatch | null {
  if (isPlainObject(base) && isPlainObject(next)) {
    const patch: JsonPatch = {};
    let changed = false;
    const deleted: string[] = [];
    for (const key of Object.keys(base)) {
      if (!(key in next)) {
        deleted.push(key);
        changed = true;
      }
    }
    for (const key of Object.keys(next)) {
      if (!(key in base)) {
        patch[key] = { $s: next[key] } as JsonPatch[string];
        changed = true;
        continue;
      }
      const sub = diffJson(base[key] as Json, next[key] as Json);
      if (sub !== null) {
        patch[key] = sub;
        changed = true;
      }
    }
    if (!changed) return null;
    if (deleted.length) patch.$d = deleted;
    return patch;
  }
  if (JSON.stringify(base) === JSON.stringify(next)) return null;
  return { $s: next };
}

/** Aplica um patch sobre o valor base e devolve o JSON completo. */
export function applyJsonPatch(base: Json, patch: JsonPatch): Json {
  if ("$s" in patch && patch.$s !== undefined) return patch.$s;
  if ("$s" in patch) return (patch.$s ?? null) as Json;
  if (!isPlainObject(base)) return base;
  const out: Record<string, Json> = { ...base };
  for (const key of patch.$d ?? []) delete out[key];
  for (const key of Object.keys(patch)) {
    if (key === "$d" || key === "$s") continue;
    const sub = patch[key];
    if (sub === undefined || typeof sub !== "object" || Array.isArray(sub)) continue;
    out[key] = applyJsonPatch((out[key] ?? null) as Json, sub as JsonPatch);
  }
  return out;
}

/** Tamanho aproximado (bytes) do JSON serializado. */
export function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
