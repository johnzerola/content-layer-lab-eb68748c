/**
 * Validação de mídia por plataforma/formato antes de agendar ou publicar.
 * Regras públicas das APIs oficiais (Instagram Graph, Facebook Pages,
 * TikTok Content Posting, YouTube Shorts).
 */

export type MediaPlatform = "instagram" | "facebook" | "tiktok" | "youtube";
export type MediaKind = "reels" | "feed" | "stories" | "shorts";

export type MediaSpec = {
  /** Duração em segundos (opcional quando ainda não foi medida). */
  durationSec?: number | null;
  /** Largura/altura em pixels. */
  width?: number | null;
  height?: number | null;
  /** Tamanho do arquivo em bytes. */
  sizeBytes?: number | null;
  /** Extensão/contêiner, ex.: "mp4", "mov", "jpg". */
  format?: string | null;
  mediaType?: "video" | "image";
  captionLength?: number;
};

export type MediaIssue = {
  level: "error" | "warning";
  field: "duration" | "aspect" | "resolution" | "size" | "format" | "caption";
  message: string;
};

type Rule = {
  minDurationSec?: number;
  maxDurationSec?: number;
  /** Faixa de proporção largura/altura aceita. */
  minAspect?: number;
  maxAspect?: number;
  /** Proporção recomendada (fora dela vira aviso, não erro). */
  preferredAspect?: number;
  minWidth?: number;
  maxSizeBytes?: number;
  formats: string[];
  maxCaption: number;
};

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

const VERTICAL: Pick<Rule, "minAspect" | "maxAspect" | "preferredAspect"> = {
  minAspect: 0.5,
  maxAspect: 0.5625 + 0.02,
  preferredAspect: 9 / 16,
};

const RULES: Record<MediaPlatform, Partial<Record<MediaKind, Rule>>> = {
  instagram: {
    reels: { ...VERTICAL, minDurationSec: 3, maxDurationSec: 90, minWidth: 540, maxSizeBytes: 1 * GB, formats: ["mp4", "mov"], maxCaption: 2200 },
    stories: { ...VERTICAL, minDurationSec: 1, maxDurationSec: 60, minWidth: 540, maxSizeBytes: 100 * MB, formats: ["mp4", "mov", "jpg", "jpeg", "png"], maxCaption: 2200 },
    feed: { minAspect: 0.5625, maxAspect: 1.91, minDurationSec: 3, maxDurationSec: 60 * 15, minWidth: 480, maxSizeBytes: 1 * GB, formats: ["mp4", "mov", "jpg", "jpeg", "png"], maxCaption: 2200 },
  },
  facebook: {
    reels: { ...VERTICAL, minDurationSec: 3, maxDurationSec: 90, minWidth: 540, maxSizeBytes: 4 * GB, formats: ["mp4", "mov"], maxCaption: 2200 },
    feed: { minAspect: 0.5, maxAspect: 1.91, minDurationSec: 1, maxDurationSec: 60 * 240, minWidth: 480, maxSizeBytes: 10 * GB, formats: ["mp4", "mov", "jpg", "jpeg", "png"], maxCaption: 5000 },
    stories: { ...VERTICAL, minDurationSec: 1, maxDurationSec: 60, minWidth: 540, maxSizeBytes: 100 * MB, formats: ["mp4", "mov", "jpg", "jpeg", "png"], maxCaption: 2200 },
  },
  tiktok: {
    reels: { ...VERTICAL, minDurationSec: 3, maxDurationSec: 60 * 10, minWidth: 540, maxSizeBytes: 4 * GB, formats: ["mp4", "mov", "webm"], maxCaption: 2200 },
  },
  youtube: {
    shorts: { ...VERTICAL, minDurationSec: 1, maxDurationSec: 180, minWidth: 540, maxSizeBytes: 256 * GB, formats: ["mp4", "mov", "webm"], maxCaption: 5000 },
    feed: { minAspect: 0.5, maxAspect: 2.0, minDurationSec: 1, maxDurationSec: 60 * 720, minWidth: 426, maxSizeBytes: 256 * GB, formats: ["mp4", "mov", "webm"], maxCaption: 5000 },
  },
};

/** Formato equivalente quando a plataforma não tem aquele nome exato. */
function resolveRule(platform: MediaPlatform, kind: MediaKind): Rule | null {
  const table = RULES[platform];
  const direct = table[kind];
  if (direct) return direct;
  if (kind === "shorts") return table.reels ?? null;
  if (kind === "reels") return table.shorts ?? table.feed ?? null;
  return table.feed ?? null;
}

export function supportsKind(platform: MediaPlatform, kind: MediaKind): boolean {
  return Boolean(resolveRule(platform, kind));
}

function normalizeFormat(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().replace(/^\./, "").split("/").pop() ?? "";
  if (!cleaned) return null;
  if (cleaned === "quicktime") return "mov";
  if (cleaned === "jpeg") return "jpg";
  return cleaned.replace(/[^a-z0-9]/g, "");
}

function humanSize(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1).replace(/\.0$/, "")} GB`;
  return `${Math.round(bytes / MB)} MB`;
}

/** Valida um arquivo contra as regras da plataforma/formato escolhido. */
export function validateMediaForPlatform(
  platform: MediaPlatform,
  kind: MediaKind,
  spec: MediaSpec,
): { ok: boolean; issues: MediaIssue[] } {
  const rule = resolveRule(platform, kind);
  if (!rule) {
    return {
      ok: false,
      issues: [
        {
          level: "error",
          field: "format",
          message: `${platform} não aceita publicações do tipo ${kind}.`,
        },
      ],
    };
  }

  const issues: MediaIssue[] = [];
  const isVideo = (spec.mediaType ?? "video") === "video";

  const format = normalizeFormat(spec.format);
  if (format && !rule.formats.includes(format)) {
    issues.push({
      level: "error",
      field: "format",
      message: `Formato .${format} não é aceito aqui. Use: ${rule.formats.map((f) => `.${f}`).join(", ")}.`,
    });
  }

  if (isVideo && typeof spec.durationSec === "number" && spec.durationSec > 0) {
    if (rule.minDurationSec && spec.durationSec < rule.minDurationSec) {
      issues.push({
        level: "error",
        field: "duration",
        message: `Vídeo muito curto (${spec.durationSec.toFixed(1)}s). Mínimo: ${rule.minDurationSec}s.`,
      });
    }
    if (rule.maxDurationSec && spec.durationSec > rule.maxDurationSec) {
      issues.push({
        level: "error",
        field: "duration",
        message: `Vídeo muito longo (${Math.round(spec.durationSec)}s). Máximo: ${rule.maxDurationSec}s.`,
      });
    }
  }

  if (spec.width && spec.height) {
    const aspect = spec.width / spec.height;
    if (rule.minAspect && aspect < rule.minAspect - 0.001) {
      issues.push({
        level: "error",
        field: "aspect",
        message: `Proporção ${aspect.toFixed(2)}:1 é estreita demais. Mínimo ${rule.minAspect.toFixed(2)}:1.`,
      });
    } else if (rule.maxAspect && aspect > rule.maxAspect + 0.001) {
      issues.push({
        level: "error",
        field: "aspect",
        message: `Proporção ${aspect.toFixed(2)}:1 é larga demais. Máximo ${rule.maxAspect.toFixed(2)}:1.`,
      });
    } else if (rule.preferredAspect && Math.abs(aspect - rule.preferredAspect) > 0.03) {
      issues.push({
        level: "warning",
        field: "aspect",
        message: "Recomendado 9:16 para ocupar a tela inteira.",
      });
    }

    if (rule.minWidth && spec.width < rule.minWidth) {
      issues.push({
        level: "warning",
        field: "resolution",
        message: `Resolução baixa (${spec.width}px). Recomendado ao menos ${rule.minWidth}px de largura.`,
      });
    }
  }

  if (spec.sizeBytes && rule.maxSizeBytes && spec.sizeBytes > rule.maxSizeBytes) {
    issues.push({
      level: "error",
      field: "size",
      message: `Arquivo de ${humanSize(spec.sizeBytes)} excede o limite de ${humanSize(rule.maxSizeBytes)}.`,
    });
  }

  if (typeof spec.captionLength === "number" && spec.captionLength > rule.maxCaption) {
    issues.push({
      level: "error",
      field: "caption",
      message: `Legenda com ${spec.captionLength} caracteres. Máximo: ${rule.maxCaption}.`,
    });
  }

  return { ok: !issues.some((issue) => issue.level === "error"), issues };
}

/** Mensagem curta pronta para toast/tooltip. */
export function summarizeIssues(issues: MediaIssue[]): string {
  const errors = issues.filter((issue) => issue.level === "error");
  const list = errors.length > 0 ? errors : issues;
  return list.map((issue) => issue.message).join(" ");
}
