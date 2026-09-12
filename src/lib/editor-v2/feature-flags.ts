function enabled(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

/**
 * Flag pública do shell V2. No servidor, use EDITOR_V2_ENABLED. Como o Vite só
 * expõe variáveis VITE_ ao navegador, o build do cliente usa a variante abaixo.
 */
export const EDITOR_V2_ENABLED = enabled(
  import.meta.env["VITE_EDITOR_V2_ENABLED"] ?? process.env["EDITOR_V2_ENABLED"],
);

