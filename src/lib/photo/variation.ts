/** Anti-duplicidade para imagens: variações sutis e determinísticas por semente. */

export interface PhotoVariation {
  /** recorte percentual em cada borda (0–0.06) */
  crop: number;
  /** zoom extra aplicado depois do recorte */
  zoom: number;
  /** rotação em graus (fração de grau) */
  rotate: number;
  mirror: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  /** deslocamento de temperatura em graus de matiz */
  hue: number;
  /** intensidade do grão (0–1) */
  noise: number;
  /** variação percentual das dimensões finais */
  sizeJitter: number;
  /** qualidade do JPEG/WebP resultante */
  quality: number;
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gera uma variação determinística.
 * @param seed semente (mesma semente = mesmo resultado)
 * @param intensity 0 = quase nada, 1 = máximo seguro
 * @param mirrorAllowed permite espelhar horizontalmente
 */
export function buildPhotoVariation(
  seed: number,
  intensity: number,
  mirrorAllowed = false,
): PhotoVariation {
  const rnd = mulberry32(seed);
  const k = Math.max(0, Math.min(1, intensity));
  const span = (max: number) => (rnd() * 2 - 1) * max * k;

  return {
    crop: Math.abs(span(0.05)),
    zoom: 1 + Math.abs(span(0.05)),
    rotate: span(0.9),
    // quando o usuário liga o espelhamento, ele é sempre aplicado (escolha explícita)
    mirror: mirrorAllowed,
    brightness: 1 + span(0.07),
    contrast: 1 + span(0.07),
    saturation: 1 + span(0.09),
    hue: span(6),
    noise: Math.abs(span(0.05)),
    sizeJitter: span(0.02),
    quality: Math.max(0.72, Math.min(0.95, 0.9 + span(0.08))),
  };
}

const MAKES: { make: string; models: string[] }[] = [
  { make: "Apple", models: ["iPhone 13", "iPhone 14 Pro", "iPhone 15", "iPhone 15 Pro Max"] },
  { make: "samsung", models: ["SM-S911B", "SM-A546E", "SM-S928B"] },
  { make: "Xiaomi", models: ["23127PN0CG", "2201117TG", "Redmi Note 12"] },
  { make: "motorola", models: ["moto g84 5G", "motorola edge 40"] },
];

const SOFTWARE = ["17.4.1", "14 QKQ1", "Photos 2.0", "1.0.0"];

export interface FakeExifIdentity {
  make: string;
  model: string;
  software: string;
}

/** Escolhe uma identidade de câmera plausível a partir da semente. */
export function pickCameraIdentity(seed: number): FakeExifIdentity {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const brand = MAKES[Math.floor(rnd() * MAKES.length)] ?? MAKES[0]!;
  const model = brand.models[Math.floor(rnd() * brand.models.length)] ?? brand.models[0]!;
  const software = SOFTWARE[Math.floor(rnd() * SOFTWARE.length)] ?? SOFTWARE[0]!;
  return { make: brand.make, model, software };
}

/** Data de captura aleatória dentro dos últimos `days` dias. */
export function pickCaptureDate(seed: number, days = 21, now = Date.now()): Date {
  const rnd = mulberry32(seed ^ 0x85ebca6b);
  const back = rnd() * days * 24 * 3600 * 1000;
  return new Date(now - back);
}

/** Nome de arquivo neutro, sem rastro do original. */
export function randomPhotoName(seed: number, ext: string, date = new Date()): string {
  const rnd = mulberry32(seed ^ 0xc2b2ae35);
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = Math.floor(rnd() * 9000 + 1000);
  return `IMG_${stamp}_${suffix}.${ext}`;
}
