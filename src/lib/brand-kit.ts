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
