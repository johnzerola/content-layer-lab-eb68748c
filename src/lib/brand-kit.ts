/** Brand Kit do usuário: logo, cores e tipografia reaproveitados nos templates. */
export interface BrandKit {
  logoUrl: string | null;
  primary: string;
  secondary: string;
  text: string;
  background: string;
  headingFont: string;
  bodyFont: string;
}

export const BRAND_FONTS = [
  "Anton",
  "Archivo Black",
  "Bebas Neue",
  "Figtree",
  "Inter",
  "Luckiest Guy",
  "Montserrat",
  "Oswald",
  "Playfair Display",
  "Poppins",
];

export const DEFAULT_BRAND_KIT: BrandKit = {
  logoUrl: null,
  primary: "#7c5cff",
  secondary: "#22d3ee",
  text: "#ffffff",
  background: "#0b0b16",
  headingFont: "Anton",
  bodyFont: "Figtree",
};

const KEY = "vaiviral.brandkit.v1";

export function loadBrandKit(): BrandKit {
  if (typeof localStorage === "undefined") return DEFAULT_BRAND_KIT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BRAND_KIT;
    return { ...DEFAULT_BRAND_KIT, ...(JSON.parse(raw) as Partial<BrandKit>) };
  } catch {
    return DEFAULT_BRAND_KIT;
  }
}

export function saveBrandKit(kit: BrandKit): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(kit));
  } catch {
    /* storage cheio ou bloqueado — mantém apenas em memória */
  }
}

/** Aplica cores, fontes e logo da marca em todas as camadas compatíveis de um TemplateDoc. */
export function applyBrandKitToDoc<T extends { layers: readonly unknown[] }>(doc: T, kit: BrandKit): T {
  const layers = doc.layers.map((raw) => {
    const layer = raw as Record<string, unknown>;
    switch (layer["type"]) {
      case "text":
        return { ...layer, fontFamily: kit.headingFont, color: kit.text };
      case "caption":
        return {
          ...layer,
          style: {
            ...(layer["style"] as Record<string, unknown> | undefined),
            fontFamily: kit.bodyFont,
            color: kit.text,
            highlightColor: kit.primary,
          },
        };
      case "shape":
        return { ...layer, fill: kit.primary, stroke: kit.secondary };
      case "image":
        if (kit.logoUrl && (layer["bindingType"] === "USER_LOGO" || layer["bindingType"] === "BRAND_LOGO")) {
          return { ...layer, src: kit.logoUrl };
        }
        return layer;
      default:
        return layer;
    }
  });
  return { ...doc, layers } as T;
}

/* ------------------------------------------------------------------ *
 * Paleta e tipografia geradas a partir do logo
 * ------------------------------------------------------------------ */

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function hue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return 0;
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Tipografia sugerida conforme o tom dominante do logo. */
function fontsForHue(h: number, sat: number): { headingFont: string; bodyFont: string } {
  if (sat < 0.15) return { headingFont: "Playfair Display", bodyFont: "Inter" };
  if (h < 20 || h >= 330) return { headingFont: "Anton", bodyFont: "Figtree" };
  if (h < 60) return { headingFont: "Luckiest Guy", bodyFont: "Poppins" };
  if (h < 160) return { headingFont: "Archivo Black", bodyFont: "Montserrat" };
  if (h < 260) return { headingFont: "Bebas Neue", bodyFont: "Figtree" };
  return { headingFont: "Oswald", bodyFont: "Poppins" };
}

export interface BrandSuggestion {
  primary: string;
  secondary: string;
  text: string;
  background: string;
  headingFont: string;
  bodyFont: string;
  /** paleta completa extraída, da cor mais presente para a menos presente */
  palette: string[];
}

/**
 * Lê o logo em um canvas, agrupa as cores em blocos e devolve uma paleta
 * (primária, secundária, texto e fundo) + a família tipográfica sugerida.
 * Roda só no navegador, sem enviar a imagem para lugar nenhum.
 */
export async function extractBrandFromLogo(src: string): Promise<BrandSuggestion> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();

  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("não consegui ler o logo neste navegador");
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // agrupa em cubos de 32 níveis para juntar tons parecidos
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 128) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    cur.r += r;
    cur.g += g;
    cur.b += b;
    cur.n += 1;
    buckets.set(key, cur);
  }
  if (!buckets.size) throw new Error("o logo não tem pixels visíveis para analisar");

  const groups = [...buckets.values()]
    .map((c) => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n, n: c.n }))
    .sort((a, b) => b.n - a.n);

  const palette = groups.slice(0, 6).map((c) => hex(c.r, c.g, c.b));

  const colorful = [...groups].sort(
    (a, b) => saturation(b.r, b.g, b.b) * Math.log(b.n + 1) - saturation(a.r, a.g, a.b) * Math.log(a.n + 1),
  );
  const main = colorful[0] ?? groups[0]!;
  const alt = colorful.find((c) => Math.abs(hue(c.r, c.g, c.b) - hue(main.r, main.g, main.b)) > 40) ?? groups[1] ?? main;
  const darkest = [...groups].sort((a, b) => luminance(a.r, a.g, a.b) - luminance(b.r, b.g, b.b))[0]!;

  const primary = hex(main.r, main.g, main.b);
  const secondary = hex(alt.r, alt.g, alt.b);
  const background = luminance(darkest.r, darkest.g, darkest.b) < 0.35 ? hex(darkest.r, darkest.g, darkest.b) : "#0b0b16";
  const text = luminance(main.r, main.g, main.b) > 0.65 ? "#0b0b16" : "#ffffff";
  const fonts = fontsForHue(hue(main.r, main.g, main.b), saturation(main.r, main.g, main.b));

  return { primary, secondary, text, background, palette, ...fonts };
}
