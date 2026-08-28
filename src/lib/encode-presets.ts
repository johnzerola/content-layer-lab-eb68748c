/**
 * Presets de codificação compartilhados pelos dois caminhos de exportação
 * (`encode.ts` na thread principal e `encode-core.ts` dentro do worker).
 *
 * Antes cada arquivo tinha a própria cópia da escolha de codec e um bitrate
 * fixo de 10 Mbps para qualquer resolução — 720p gastava o mesmo que 1080p sem
 * ganho visual, só tempo de codificação e arquivo maior.
 */

export type QualityTier = "hq" | "balanced" | "turbo";

export interface BitrateInput {
  width: number;
  height: number;
  fps?: number | undefined;
  tier?: QualityTier | undefined;
}

interface Row {
  /** maior lado da saída, em pixels */
  maxSide: number;
  hq: number;
  balanced: number;
  turbo: number;
}

/** Referência para vídeo social em H.264 a 30 fps. */
const TABLE: Row[] = [
  { maxSide: 1280, hq: 3_000_000, balanced: 2_200_000, turbo: 1_600_000 }, // abaixo de 720p
  { maxSide: 1281, hq: 5_000_000, balanced: 3_500_000, turbo: 2_500_000 }, // 720x1280
  { maxSide: 1920, hq: 9_000_000, balanced: 6_500_000, turbo: 4_500_000 }, // 1080 vertical/quadrado
  { maxSide: Infinity, hq: 10_000_000, balanced: 7_000_000, turbo: 5_000_000 }, // 1080p+ horizontal
];

const MIN_BITRATE = 800_000;
const MAX_BITRATE = 20_000_000;

function rowFor(width: number, height: number): Row {
  const maxSide = Math.max(width, height);
  const minSide = Math.min(width, height);
  // 720x1280 e menores verticais: usa a faixa de 720p
  if (maxSide <= 1280) return minSide <= 719 ? TABLE[0]! : TABLE[1]!;
  if (maxSide <= 1920) return minSide <= 1080 ? TABLE[2]! : TABLE[3]!;
  return TABLE[3]!;
}

/** Bitrate recomendado para a resolução/fps/qualidade pedidos. */
export function pickBitrate({ width, height, fps = 30, tier = "balanced" }: BitrateInput): number {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const row = rowFor(w, h);
  const base = tier === "hq" ? row.hq : tier === "turbo" ? row.turbo : row.balanced;
  // menos quadros por segundo = menos bits necessários (e vice-versa)
  const fpsFactor = Math.max(0.7, Math.min(1.6, 0.5 + (0.5 * Math.max(1, fps)) / 30));
  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, base * fpsFactor)));
}

export interface PickedVideoCodec {
  cfg: VideoEncoderConfig;
  mux: "avc" | "vp9";
}

const VIDEO_CANDIDATES: { codec: string; mux: "avc" | "vp9" }[] = [
  { codec: "avc1.640028", mux: "avc" },
  { codec: "avc1.4d0032", mux: "avc" },
  { codec: "avc1.42003c", mux: "avc" },
  { codec: "avc1.42001f", mux: "avc" },
  // último recurso: VP9 dentro do MP4 (quando o navegador não tem H.264)
  { codec: "vp09.00.10.08", mux: "vp9" },
];

/**
 * Escolhe o melhor codec suportado. Nos modos rápidos pedimos aceleração de
 * hardware e `latencyMode: "realtime"` (o codificador trabalha em pipeline em
 * vez de segurar quadros); se o navegador recusar, tentamos sem essas dicas.
 */
export async function pickVideoCodec(
  width: number,
  height: number,
  bitrate: number,
  framerate: number,
  tier: QualityTier = "balanced",
): Promise<PickedVideoCodec | null> {
  const Enc = globalThis.VideoEncoder;
  if (!Enc) return null;

  const hints: Partial<VideoEncoderConfig>[] =
    tier === "hq"
      ? [{ latencyMode: "quality" }]
      : [
          { latencyMode: "realtime", hardwareAcceleration: "prefer-hardware" },
          { latencyMode: "realtime" },
          { latencyMode: "quality" },
        ];

  for (const hint of hints) {
    for (const { codec, mux } of VIDEO_CANDIDATES) {
      try {
        const cfg: VideoEncoderConfig = {
          codec,
          width,
          height,
          bitrate,
          framerate,
          ...hint,
          ...(mux === "avc" ? { avc: { format: "avc" as const } } : {}),
        };
        const sup = await Enc.isConfigSupported(cfg);
        if (sup.supported) return { cfg, mux };
      } catch {
        /* tenta o próximo */
      }
    }
  }
  return null;
}

export async function pickAudioCodec(
  channels: number,
  sampleRate: number,
): Promise<"aac" | "opus" | null> {
  const Enc = globalThis.AudioEncoder;
  if (!Enc) return null;
  for (const [mux, codec] of [
    ["aac", "mp4a.40.2"],
    ["opus", "opus"],
  ] as const) {
    try {
      const sup = await Enc.isConfigSupported({
        codec,
        sampleRate,
        numberOfChannels: channels,
        bitrate: 128_000,
      });
      if (sup.supported) return mux;
    } catch {
      /* próximo */
    }
  }
  return null;
}
