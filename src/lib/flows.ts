/**
 * Fluxos independentes de importação e exportação.
 * Cada ferramenta ativa (ViralBatch e CorteIA) tem a sua própria fila,
 * as suas próprias fontes de entrada e as suas próprias regras de saída.
 */
export type Mode = "lote" | "clip";

const slug = (s: string) =>
  s
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\w\-. ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "video";

export interface ImportFlow {
  step: string;
  title: string;
  hint: string;
  /** aceita seleção de pasta inteira (centenas de arquivos) */
  folder: boolean;
  /** aceita importar colando um link */
  link: boolean;
  linkPlaceholder: string;
  linkHint: string;
  /** quantos arquivos por importação */
  multiple: boolean;
  filesLabel: string;
}

export interface ExportFlow {
  /** título do bloco de entrega */
  title: string;
  /** presets de plataforma (proporção/fps/bitrate) fazem sentido? */
  platforms: boolean;
  /** múltiplas variações anti-duplicidade por vídeo? */
  variants: boolean;
  /** mantém o nome original do arquivo na saída */
  keepSourceName: boolean;
  zipPrefix: string;
  filePrefix: string;
}

export interface Flow {
  brand: string;
  import: ImportFlow;
  export: ExportFlow;
}

export const FLOWS: Record<Mode, Flow> = {
  lote: {
    brand: "ViralBatch",
    import: {
      step: "02",
      title: "Importe o lote de vídeos",
      hint: "arraste centenas de arquivos ou uma pasta inteira · mp4 · mov · webm",
      folder: true,
      link: true,
      linkPlaceholder: "https://... TikTok, Instagram, YouTube, X, Reddit ou arquivo direto",
      linkHint:
        "cada link público vira mais um item do lote. tiktok · instagram · youtube · x · reddit · vimeo.",
      multiple: true,
      filesLabel: "Selecionar arquivos",
    },
    export: {
      title: "Entrega do lote",
      platforms: true,
      variants: true,
      keepSourceName: false,
      zipPrefix: "viralbatch",
      filePrefix: "lote",
    },
  },
  clip: {
    brand: "CorteIA",
    import: {
      step: "02",
      title: "Importe o vídeo longo",
      hint: "um podcast, live ou VSL — a IA encontra os melhores trechos",
      folder: false,
      link: true,
      linkPlaceholder: "https://... cole o link do vídeo longo",
      linkHint:
        "importa direto de links públicos do tiktok · instagram · youtube · x · reddit · vimeo.",
      multiple: true,
      filesLabel: "Selecionar vídeo",
    },
    export: {
      title: "Entrega dos cortes",
      platforms: true,
      variants: false,
      keepSourceName: false,
      zipPrefix: "corteia",
      filePrefix: "corte",
    },
  },
};

/** Nome do arquivo exportado, seguindo a regra de cada fluxo. */
export function outputName(
  mode: Mode,
  opts: { index: number; sourceName: string; templateName: string; label?: string; ext: string },
) {
  const f = FLOWS[mode].export;
  const idx = String(opts.index + 1).padStart(3, "0");
  const suffix = opts.label ? `-${opts.label}` : "";
  const base = f.keepSourceName
    ? `${slug(opts.sourceName)}-${f.filePrefix}`
    : mode === "lote"
      ? `${slug(opts.templateName)}-${idx}`
      : `${f.filePrefix}-${idx}`;
  return `${base}${suffix}.${opts.ext}`;
}

/** Nome do ZIP de cada fluxo. */
export function zipName(mode: Mode, templateName: string) {
  const f = FLOWS[mode].export;
  return mode === "lote" ? `${f.zipPrefix}-${slug(templateName)}.zip` : `${f.zipPrefix}-${f.filePrefix}s.zip`;
}
