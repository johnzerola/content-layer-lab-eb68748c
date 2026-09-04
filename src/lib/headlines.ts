/** Headlines por vídeo: banco de variações + pequenas mudanças automáticas. */

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Lê o banco (uma variação por linha). */
export function parseBank(raw: string) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Rodízio: distribui as variações sem repetir enquanto houver opções. */
export function bankPick(bank: string[], index: number) {
  if (!bank.length) return undefined;
  return bank[index % bank.length];
}

export interface HeadlineTweak {
  /** texto final da headline */
  text: string;
  /** deslocamento vertical em px do canvas 1080x1920 */
  dy: number;
  /** multiplicador do tamanho da fonte */
  scale: number;
  /** descrição curta para a interface */
  label: string;
}

const CASES = ["normal", "upper", "first"] as const;

function applyCase(text: string, kind: (typeof CASES)[number]) {
  if (kind === "upper") return text.toUpperCase();
  if (kind === "first")
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  return text;
}

/**
 * Variação determinística por vídeo, para nenhum sair idêntico.
 * O mesmo vídeo sempre gera a mesma variação (previsível na prévia).
 */
export function headlineTweak(
  base: string,
  seed: string,
  enabled: boolean,
): HeadlineTweak {
  if (!enabled || !base.trim()) return { text: base, dy: 0, scale: 1, label: "sem variação" };
  const h = hash(seed);
  const caseKind = CASES[h % CASES.length]!;
  const dy = ((((h >> 3) % 41) - 20) / 1) * 1; // -20..+20 px
  const scale = 1 + ((((h >> 9) % 13) - 6) / 100); // 0.94..1.06
  const text = applyCase(base.trim(), caseKind);
  return {
    text,
    dy,
    scale,
    label: `${caseKind === "upper" ? "maiúsculas" : caseKind === "first" ? "capitalizada" : "normal"} · ${dy > 0 ? "+" : ""}${Math.round(dy)}px · ${Math.round(scale * 100)}%`,
  };
}
