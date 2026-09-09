/** Catálogo de provedores e coleções aprovadas para a biblioteca do editor.
 * Cada item exige proveniência explícita antes de aparecer como “pronto para uso”.
 * URLs de API são referências de integração; não baixamos conteúdo em build.
 */
export type AssetCatalogKind = "transicao" | "efeito" | "template" | "musica" | "sfx" | "fonte" | "sticker";
export type AssetLicense = "MIT" | "Apache-2.0" | "OFL-1.1" | "CC BY-SA 4.0" | "Pixabay-Content" | "source-available" | "internal";

export interface AssetCatalogSource {
  id: string;
  name: string;
  kinds: AssetCatalogKind[];
  license: AssetLicense;
  url: string;
  attributionRequired: boolean;
  integration: "bundled" | "api" | "reference";
  notes: string;
}

export const ASSET_CATALOG_SOURCES: AssetCatalogSource[] = [
  {
    id: "internal-presets",
    name: "VaiViral Presets",
    kinds: ["transicao", "efeito", "template", "sticker"],
    license: "internal",
    url: "/editor",
    attributionRequired: false,
    integration: "bundled",
    notes: "Presets desenhados e testados no renderer atual.",
  },
  {
    id: "pixabay-media",
    name: "Pixabay Media",
    kinds: ["musica", "sfx", "sticker"],
    license: "Pixabay-Content",
    url: "https://pixabay.com/api/docs/",
    attributionRequired: false,
    integration: "api",
    notes: "Requer chave/API e exibir origem; conteúdo não pode ser redistribuído isoladamente.",
  },
  {
    id: "google-fonts",
    name: "Google Fonts",
    kinds: ["fonte"],
    license: "OFL-1.1",
    url: "https://fonts.google.com/",
    attributionRequired: false,
    integration: "api",
    notes: "Registrar família e pesos usados no projeto antes de exportar.",
  },
  {
    id: "openmoji",
    name: "OpenMoji",
    kinds: ["sticker", "fonte"],
    license: "CC BY-SA 4.0",
    url: "https://openmoji.org/faq",
    attributionRequired: true,
    integration: "api",
    notes: "Stickers/emoji comerciais exigem crédito e ShareAlike para derivações.",
  },
  {
    id: "lottie-public",
    name: "LottieFiles públicos",
    kinds: ["sticker", "efeito"],
    license: "source-available",
    url: "https://lottiefiles.com/page/license",
    attributionRequired: false,
    integration: "api",
    notes: "Validar licença por asset; não redistribuir arquivos isolados nem montar catálogo concorrente.",
  },
  {
    id: "gl-transitions",
    name: "GL Transitions",
    kinds: ["transicao", "efeito"],
    license: "MIT",
    url: "https://github.com/gl-transitions/gl-transitions",
    attributionRequired: false,
    integration: "reference",
    notes: "Shaders exigem adaptador WebGL separado; não inserir no canvas 2D sem validação.",
  },
  {
    id: "openvideo-editor",
    name: "OpenVideo Editor",
    kinds: ["transicao", "efeito", "template"],
    license: "source-available",
    url: "https://github.com/openvideodev/react-video-editor",
    attributionRequired: true,
    integration: "reference",
    notes: "Arquitetura e UX são referência; confirmar licença comercial antes de reutilizar código.",
  },
  {
    id: "rendiv",
    name: "Rendiv transitions",
    kinds: ["transicao", "efeito", "template"],
    license: "Apache-2.0",
    url: "https://github.com/thecodacus/rendiv",
    attributionRequired: false,
    integration: "reference",
    notes: "Primitivas de transição e easing são referência para um adaptador próprio.",
  },
];

export function sourcesFor(kind: AssetCatalogKind) {
  return ASSET_CATALOG_SOURCES.filter((source) => source.kinds.includes(kind));
}
