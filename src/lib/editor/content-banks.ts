/** Bancos selecionados para ampliar tipografia, stickers e motion assets.
 * O editor mantém apenas metadados e links até uma licença ser confirmada por asset.
 */
export type ContentBankKind = "font" | "sticker" | "motion" | "caption" | "icon";

export interface ContentBank {
  id: string;
  name: string;
  kind: ContentBankKind[];
  license: string;
  url: string;
  attribution: "required" | "recommended" | "none" | "per-asset";
  commercial: "yes" | "check" | "no";
  use: string;
}

export const CONTENT_BANKS: ContentBank[] = [
  { id: "google-fonts", name: "Google Fonts", kind: ["font"], license: "OFL-1.1 / per family", url: "https://fonts.google.com/", attribution: "none", commercial: "yes", use: "Adicionar pesos reais ao Brand Kit e presets de legenda." },
  { id: "openmoji", name: "OpenMoji", kind: ["sticker", "icon"], license: "CC BY-SA 4.0", url: "https://openmoji.org/", attribution: "required", commercial: "yes", use: "Stickers e emojis; guardar crédito no projeto exportado." },
  { id: "iconstash", name: "IconStash", kind: ["sticker", "icon"], license: "per pack (MIT/Apache/CC/OFL)", url: "https://iconstash.com/", attribution: "per-asset", commercial: "check", use: "Importação somente após registrar a licença de cada pack." },
  { id: "lottie-free", name: "LottieFiles free", kind: ["motion", "sticker"], license: "Lottie Simple License / per asset", url: "https://lottiefiles.com/page/license", attribution: "recommended", commercial: "check", use: "Overlays animados; não redistribuir arquivos isoladamente nem compilar um catálogo concorrente." },
  { id: "pixabay", name: "Pixabay", kind: ["motion", "sticker", "icon"], license: "Pixabay Content License", url: "https://pixabay.com/service/license-summary/", attribution: "recommended", commercial: "yes", use: "Mídia e SFX via API; não oferecer download standalone." },
  { id: "internal-caption-bank", name: "VaiViral Caption Bank", kind: ["caption", "font", "motion"], license: "internal", url: "/editor", attribution: "none", commercial: "yes", use: "Presets nacionais para notícia, podcast, UGC e conteúdo educativo." },
];

export const MODERN_CAPTION_DIRECTIONS = [
  { id: "word-pop", label: "Palavra em destaque", tags: ["shorts", "viral", "karaoke"] },
  { id: "clean-subtitle", label: "Legenda limpa", tags: ["podcast", "educativo", "acessível"] },
  { id: "editorial-box", label: "Caixa editorial", tags: ["notícia", "comentário", "headline"] },
  { id: "kinetic-stack", label: "Pilha cinética", tags: ["hook", "impacto", "reels"] },
  { id: "speaker-label", label: "Nome do falante", tags: ["entrevista", "podcast", "debate"] },
  { id: "safe-bottom", label: "Rodapé seguro", tags: ["social", "acessível", "sem rosto"] },
] as const;
