import { injectExifIntoJpeg, type PhotoExif } from "./exif";
import { extForFormat, presetById, type PhotoFormat } from "./presets";
import {
  buildPhotoVariation,
  hashSeed,
  pickCameraIdentity,
  pickCaptureDate,
  randomPhotoName,
  type PhotoVariation,
} from "./variation";

export interface PhotoAdjust {
  /** giro manual em múltiplos de 90 */
  rotate90: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  saturation: number;
  /** 0 = sem nitidez extra, 1 = máximo */
  sharpness: number;
  /** zoom manual (1 = sem zoom) */
  zoom: number;
}

export const DEFAULT_ADJUST: PhotoAdjust = {
  rotate90: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sharpness: 0,
  zoom: 1,
};

export const PHOTO_FONTS = [
  { id: "Inter, system-ui, sans-serif", label: "Inter" },
  { id: "'Arial Black', Impact, sans-serif", label: "Arial Black" },
  { id: "Impact, 'Arial Black', sans-serif", label: "Impact" },
  { id: "Georgia, serif", label: "Georgia" },
  { id: "'Courier New', monospace", label: "Courier" },
  { id: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
] as const;

export type PhotoTextPosition = "top" | "center" | "bottom";

export interface PhotoTextOverlay {
  headline?: string | undefined;
  cta?: string | undefined;
  color: string;
  background: string;
  /** família de fonte CSS */
  fontFamily: string;
  /** tamanho relativo à largura da imagem (0.02–0.14) */
  fontScale: number;
  weight: number;
  uppercase: boolean;
  /** caixa atrás do texto */
  boxed: boolean;
  position: PhotoTextPosition;
}

export const DEFAULT_TEXT: PhotoTextOverlay = {
  color: "#ffffff",
  background: "#0f172a",
  fontFamily: PHOTO_FONTS[0].id,
  fontScale: 0.055,
  weight: 700,
  uppercase: false,
  boxed: true,
  position: "bottom",
};

export interface PhotoRenderOptions {
  presetId: string;
  format: PhotoFormat;
  /** 0–1: força da anti-duplicidade */
  intensity: number;
  allowMirror: boolean;
  adjust: PhotoAdjust;
  text?: PhotoTextOverlay | undefined;
  /** metadados novos */
  metadata: {
    enabled: boolean;
    artist?: string | undefined;
    copyright?: string | undefined;
    gps?: { lat: number; lon: number } | undefined;
    days: number;
  };
  seed: string;
  /** limita o lado maior — usado nas prévias rápidas */
  maxSide?: number | undefined;
}

export interface PhotoResult {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  variation: PhotoVariation;
  exif: PhotoExif | null;
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function targetSize(
  bitmap: ImageBitmap,
  presetId: string,
  rotate90: number,
  jitter: number,
  maxSide?: number,
): { width: number; height: number } {
  const preset = presetById(presetId);
  const swapped = rotate90 === 90 || rotate90 === 270;
  const srcW = swapped ? bitmap.height : bitmap.width;
  const srcH = swapped ? bitmap.width : bitmap.height;
  const baseW = preset.width || srcW;
  const baseH = preset.height || srcH;
  const scale = 1 + jitter;
  let width = Math.max(64, Math.round((baseW * scale) / 2) * 2);
  let height = Math.max(64, Math.round((baseH * scale) / 2) * 2);
  if (maxSide && Math.max(width, height) > maxSide) {
    const k = maxSide / Math.max(width, height);
    width = Math.max(64, Math.round((width * k) / 2) * 2);
    height = Math.max(64, Math.round((height * k) / 2) * 2);
  }
  return { width, height };
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawPhotoText(
  ctx: CanvasRenderingContext2D,
  text: PhotoTextOverlay,
  width: number,
  height: number,
) {
  const blocks = [
    { value: text.headline, scale: 1 },
    { value: text.cta, scale: 0.72 },
  ].filter((b) => b.value && b.value.trim()) as { value: string; scale: number }[];
  if (!blocks.length) return;

  const base = Math.round(width * text.fontScale);
  const maxWidth = width * 0.86;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  type Line = { text: string; size: number };
  const lines: Line[] = [];
  for (const block of blocks) {
    const size = Math.max(12, Math.round(base * block.scale));
    ctx.font = `${text.weight} ${size}px ${text.fontFamily}`;
    const value = text.uppercase ? block.value.toUpperCase() : block.value;
    for (const line of wrapLines(ctx, value, maxWidth)) lines.push({ text: line, size });
  }

  const gap = base * 0.28;
  const totalHeight = lines.reduce((sum, l) => sum + l.size * 1.25, 0) + gap * (lines.length - 1);
  const margin = height * 0.08;
  const startY =
    text.position === "top"
      ? margin + totalHeight / 2
      : text.position === "center"
        ? height / 2
        : height - margin - totalHeight / 2;

  let y = startY - totalHeight / 2;
  for (const line of lines) {
    const lineH = line.size * 1.25;
    const cy = y + lineH / 2;
    ctx.font = `${text.weight} ${line.size}px ${text.fontFamily}`;
    if (text.boxed) {
      const padding = line.size * 0.42;
      const boxW = ctx.measureText(line.text).width + padding * 2;
      const boxH = lineH + padding * 0.4;
      ctx.fillStyle = text.background;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.roundRect((width - boxW) / 2, cy - boxH / 2, boxW, boxH, boxH / 3);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = line.size * 0.25;
    }
    ctx.fillStyle = text.color;
    ctx.fillText(line.text, width / 2, cy);
    ctx.shadowBlur = 0;
    y += lineH + gap;
  }
  ctx.restore();
}

function applyGrain(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  if (amount <= 0.001) return;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const strength = amount * 28;
  for (let i = 0; i < data.length; i += 4) {
    const delta = (Math.random() - 0.5) * strength;
    data[i] = Math.max(0, Math.min(255, data[i]! + delta));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + delta));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! + delta));
  }
  ctx.putImageData(image, 0, 0);
}

/** Máscara de nitidez (unsharp mask) leve. */
function applySharpen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
) {
  if (amount <= 0.01) return;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const s = src.data;
  const d = out.data;
  const k = amount * 1.2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        d[i] = s[i]!;
        d[i + 1] = s[i + 1]!;
        d[i + 2] = s[i + 2]!;
        d[i + 3] = s[i + 3]!;
        continue;
      }
      for (let c = 0; c < 3; c += 1) {
        const center = s[i + c]!;
        const around =
          s[i - 4 + c]! +
          s[i + 4 + c]! +
          s[i - width * 4 + c]! +
          s[i + width * 4 + c]!;
        const value = center + k * (center * 4 - around) * 0.25;
        d[i + c] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
      d[i + 3] = s[i + 3]!;
    }
  }
  ctx.putImageData(out, 0, 0);
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: PhotoFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem"))),
      format,
      format === "image/png" ? undefined : quality,
    );
  });
}

/** Renderiza uma variação da foto: limpa metadados, edita e regrava EXIF novo. */
export async function renderPhoto(
  file: File,
  options: PhotoRenderOptions,
  variationIndex = 0,
): Promise<PhotoResult> {
  const bitmap = await loadBitmap(file);
  const seedText = `${options.seed}:${file.name}:${file.size}:${variationIndex}`;
  const seed = hashSeed(seedText);
  const variation = buildPhotoVariation(seed, options.intensity, options.allowMirror);

  const { width, height } = targetSize(
    bitmap,
    options.presetId,
    options.adjust.rotate90,
    variation.sizeJitter,
    options.maxSide,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: options.format === "image/png" })!;
  ctx.imageSmoothingQuality = "high";

  if (options.format !== "image/png") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
  }

  const filters = [
    `brightness(${(variation.brightness * options.adjust.brightness).toFixed(3)})`,
    `contrast(${(variation.contrast * options.adjust.contrast).toFixed(3)})`,
    `saturate(${(variation.saturation * options.adjust.saturation).toFixed(3)})`,
    `hue-rotate(${variation.hue.toFixed(2)}deg)`,
  ];
  ctx.filter = filters.join(" ");

  // recorte anti-duplicidade na origem
  const cropX = bitmap.width * variation.crop;
  const cropY = bitmap.height * variation.crop;
  const srcW = bitmap.width - cropX * 2;
  const srcH = bitmap.height - cropY * 2;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(((options.adjust.rotate90 + variation.rotate) * Math.PI) / 180);
  if (variation.mirror) ctx.scale(-1, 1);

  const swapped = options.adjust.rotate90 === 90 || options.adjust.rotate90 === 270;
  const boxW = swapped ? height : width;
  const boxH = swapped ? width : height;
  const cover =
    Math.max(boxW / srcW, boxH / srcH) * variation.zoom * Math.max(1, options.adjust.zoom);
  const drawW = srcW * cover;
  const drawH = srcH * cover;
  ctx.drawImage(bitmap, cropX, cropY, srcW, srcH, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  ctx.filter = "none";

  applySharpen(ctx, width, height, options.adjust.sharpness);
  applyGrain(ctx, width, height, variation.noise);
  if (options.text) drawPhotoText(ctx, options.text, width, height);
  bitmap.close?.();

  const blob = await canvasToBlob(canvas, options.format, variation.quality);
  const capture = pickCaptureDate(seed, options.metadata.days);
  const ext = extForFormat(options.format);
  const name = randomPhotoName(seed, ext, capture);

  if (!options.metadata.enabled || options.format !== "image/jpeg") {
    return { name, blob, width, height, variation, exif: null };
  }

  const identity = pickCameraIdentity(seed);
  const exif: PhotoExif = {
    make: identity.make,
    model: identity.model,
    software: identity.software,
    dateTime: capture,
    artist: options.metadata.artist,
    copyright: options.metadata.copyright,
    orientation: 1,
    gps: options.metadata.gps,
  };
  const bytes = injectExifIntoJpeg(await blob.arrayBuffer(), exif);
  return {
    name,
    blob: new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" }),
    width,
    height,
    variation,
    exif,
  };
}
