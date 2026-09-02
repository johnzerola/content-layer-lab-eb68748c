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
export function applyBrandKitToDoc<
  T extends { layers: Array<Record<string, unknown>> },
>(doc: T, kit: BrandKit): T {
  const layers = doc.layers.map((layer) => {
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
