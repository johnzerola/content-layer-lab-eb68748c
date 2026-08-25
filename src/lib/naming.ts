/** Nomes de arquivo escolhidos pelo usuário: tokens, limpeza e numeração. */

export function stripExt(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, "");
}

/** Remove acentos, espaços e caracteres inválidos de nome de arquivo. */
export function sanitizeName(name: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
  return clean || "video";
}

export interface NameTokens {
  index: number;
  sourceName: string;
  templateName: string;
  platform?: string;
  variant?: string;
}

const pad = (n: number) => String(n).padStart(3, "0");

/** Expande `{nome} {indice} {data} {template} {plataforma} {variacao}`. */
export function expandPattern(pattern: string, t: NameTokens) {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const map: Record<string, string> = {
    nome: stripExt(t.sourceName),
    indice: pad(t.index + 1),
    data: date,
    template: t.templateName,
    plataforma: t.platform ?? "",
    variacao: t.variant ?? "",
  };
  const out = pattern.replace(/\{(\w+)\}/g, (_, k: string) => map[k.toLowerCase()] ?? "");
  return sanitizeName(out);
}

/** Garante nomes únicos dentro de um lote (sufixo -2, -3, ...). */
export function dedupeNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (!count) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)}-${count + 1}${n.slice(dot)}` : `${n}-${count + 1}`;
  });
}
