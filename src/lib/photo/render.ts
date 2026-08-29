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
}

export const DEFAULT_ADJUST: PhotoAdjust = {
  rotate90: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
};

export interface PhotoTextOverlay {
  headline?: string | undefined;
  cta?: string | undefined;
  color: string;
  background: string;
}

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
): { width: number; height: number } {
  const preset = presetById(presetId);
  const swapped = rotate90 === 90 || rotate90 === 270;
  const srcW = swapped ? bitmap.height : bitmap.width;
  const srcH = swapped ? bitmap.width : bitmap.height;
  const baseW = preset.width || srcW;
  const baseH = preset.height || srcH;
  const scale = 1 + jitter;
  return {
    width: Math.max(64, Math.round((baseW * scale) / 2) * 2),
    height: Math.max(64, Math.round((baseH * scale) / 2) * 2),
  };
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: PhotoTextOverlay,
  width: number,
  height: number,
) {
  const lines = [text.headline, text.cta].filter(Boolean) as string[];
  if (!lines.length) return;
  const size = Math.round(width * 0.055);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    ctx.font = `700 ${index === 0 ? size : Math.round(size * 0.72)}px Inter, system-ui, sans-serif`;
    const metrics = ctx.measureText(line);
    const padding = size * 0.4;
    const boxW = metrics.width + padding * 2;
    const boxH = (index === 0 ? size : size * 0.72) + padding;
    const y = height - height * 0.12 - index * (boxH + size * 0.25);
    ctx.fillStyle = text.background;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.roundRect((width - boxW) / 2, y - boxH / 2, boxW, boxH, boxH / 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = text.color;
    ctx.fillText(line, width / 2, y);
  });
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
  const cover = Math.max(boxW / srcW, boxH / srcH) * variation.zoom;
  const drawW = srcW * cover;
  const drawH = srcH * cover;
  ctx.drawImage(bitmap, cropX, cropY, srcW, srcH, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  ctx.filter = "none";

  applyGrain(ctx, width, height, variation.noise);
  if (options.text) drawText(ctx, options.text, width, height);
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
