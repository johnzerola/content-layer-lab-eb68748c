/**
 * QUALIDADE DE EXPORTAÇÃO do editor profissional.
 * Só define a escala do canvas de saída (1080p / 1440p / 4K) — nenhuma regra
 * de negócio: o desenho continua em coordenadas 1080x1920.
 */
export type ExportQuality = "1080" | "1440" | "2160";

export const EXPORT_QUALITIES: { id: ExportQuality; label: string; hint: string; scale: number }[] = [
  { id: "1080", label: "Full HD", hint: "1080 × 1920 · rápido", scale: 1 },
  { id: "1440", label: "2K", hint: "1440 × 2560 · equilibrado", scale: 4 / 3 },
  { id: "2160", label: "4K", hint: "2160 × 3840 · máxima nitidez", scale: 2 },
];

const KEY = "vaiviral.export.quality";

export function loadExportQuality(): ExportQuality {
  if (typeof localStorage === "undefined") return "1080";
  const v = localStorage.getItem(KEY);
  return v === "1440" || v === "2160" ? v : "1080";
}

export function saveExportQuality(q: ExportQuality) {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* ignora */
  }
}

export function exportScale(q: ExportQuality = loadExportQuality()): number {
  return EXPORT_QUALITIES.find((e) => e.id === q)?.scale ?? 1;
}
