/**
 * Carregamento de mídia do ChatScene — fotos, figurinhas animadas, GIF e vídeo.
 *
 * Tudo é convertido para uma sequência de quadros conhecida antes do primeiro
 * desenho. Assim a prévia e a exportação continuam determinísticas: o desenho
 * escolhe o quadro pela posição na linha do tempo, nunca pelo relógio do
 * navegador.
 */

export interface LoadedMedia {
  /** quadros na ordem; mídia parada tem apenas um */
  frames: CanvasImageSource[];
  /** quadros por segundo da animação */
  fps: number;
  width: number;
  height: number;
  /** largura / altura */
  aspect: number;
  animated: boolean;
  /** o conteúdo tem fundo transparente (figurinha) */
  transparent: boolean;
}

const ANIMATED_SAMPLE_FPS = 12;
const MAX_ANIMATION_SECONDS = 10;
const MAX_SIDE = 720;

export interface LoadMediaOptions {
  /** quadros por segundo ao amostrar vídeo/animação (padrão 12) */
  sampleFps?: number;
  /** teto de segundos amostrados (padrão 10) */
  maxSeconds?: number;
  /** orçamento de tempo de decodificação em ms; ao estourar, usa o que já tem */
  decodeBudgetMs?: number;
}

function sizeOf(source: CanvasImageSource): { width: number; height: number } {
  const any = source as { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
  const width = any.videoWidth || any.width || 1;
  const height = any.videoHeight || any.height || 1;
  return { width: Number(width), height: Number(height) };
}

async function toBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function still(source: CanvasImageSource, transparent: boolean): LoadedMedia {
  const { width, height } = sizeOf(source);
  return {
    frames: [source],
    fps: 1,
    width,
    height,
    aspect: width / Math.max(1, height),
    animated: false,
    transparent,
  };
}

async function decodeStill(blob: Blob): Promise<CanvasImageSource | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* tenta o caminho do <img> */
    }
  }
  return new Promise<CanvasImageSource | null>((resolve) => {
    const img = new Image();
    const src = URL.createObjectURL(blob);
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** GIF, WebP e APNG animados: decodificados quadro a quadro pelo navegador. */
async function decodeAnimatedImage(blob: Blob): Promise<LoadedMedia | null> {
  const Decoder = (globalThis as { ImageDecoder?: new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike })
    .ImageDecoder;
  if (!Decoder) return null;
  try {
    const data = await blob.arrayBuffer();
    const decoder = new Decoder({ data, type: blob.type || "image/gif" });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const count = track?.frameCount ?? 1;
    if (count <= 1) return null;

    const frames: CanvasImageSource[] = [];
    const step = 1_000_000 / ANIMATED_SAMPLE_FPS; // µs por quadro amostrado
    let elapsed = 0;
    const limit = MAX_ANIMATION_SECONDS * 1_000_000;
    for (let i = 0; i < count && elapsed < limit; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const duration = Math.max(step / 2, image.duration ?? step);
      const repeats = Math.max(1, Math.round(duration / step));
      for (let r = 0; r < repeats && elapsed < limit; r++) {
        frames.push(image);
        elapsed += step;
      }
    }
    if (!frames.length) return null;
    const { width, height } = sizeOf(frames[0]!);
    return {
      frames,
      fps: ANIMATED_SAMPLE_FPS,
      width,
      height,
      aspect: width / Math.max(1, height),
      animated: true,
      transparent: /webp|png/.test(blob.type) || blob.type === "image/gif",
    };
  } catch {
    return null;
  }
}

/** Vídeo (meme, clipe curto): amostrado em quadros para entrar na conversa. */
async function decodeVideo(blob: Blob, options: LoadMediaOptions = {}): Promise<LoadedMedia | null> {
  const sampleFps = Math.max(2, options.sampleFps ?? ANIMATED_SAMPLE_FPS);
  const maxSeconds = Math.max(1, options.maxSeconds ?? MAX_ANIMATION_SECONDS);
  // vídeos grandes do usuário não podem segurar a prévia: decodifica no
  // máximo ~12s de relógio e segue com os quadros que já saíram
  const decodeBudgetMs = Math.max(3000, options.decodeBudgetMs ?? 12000);
  const startedAt = Date.now();
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("vídeo inválido"));
      setTimeout(() => reject(new Error("tempo esgotado ao ler o vídeo")), 12000);
    });
    const duration = Math.min(video.duration || 0, maxSeconds);
    if (!duration) return null;
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 1280;
    const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
    const w = Math.max(2, Math.round(vw * scale));
    const h = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const frames: CanvasImageSource[] = [];
    const total = Math.max(1, Math.round(duration * sampleFps));
    for (let i = 0; i < total; i++) {
      if (frames.length > 0 && Date.now() - startedAt > decodeBudgetMs) break;
      const t = (i / sampleFps) % duration;
      await new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener("seeked", done);
          resolve();
        };
        video.addEventListener("seeked", done);
        video.currentTime = t;
        setTimeout(done, 600);
      });
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(
        typeof createImageBitmap === "function"
          ? await createImageBitmap(canvas)
          : ((): CanvasImageSource => {
              const copy = document.createElement("canvas");
              copy.width = w;
              copy.height = h;
              copy.getContext("2d")?.drawImage(canvas, 0, 0);
              return copy;
            })(),
      );
    }
    if (!frames.length) return null;
    return {
      frames,
      fps: sampleFps,
      width: w,
      height: h,
      aspect: w / h,
      animated: true,
      transparent: false,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Carrega qualquer mídia suportada; devolve null quando não dá para usar. */
export async function loadMedia(url: string, options: LoadMediaOptions = {}): Promise<LoadedMedia | null> {
  const blob = await toBlob(url);
  if (!blob) return null;
  if (blob.type.startsWith("video/")) {
    return (await decodeVideo(blob, options)) ?? null;
  }
  const animated = await decodeAnimatedImage(blob);
  if (animated) return animated;
  const image = await decodeStill(blob);
  if (!image) return null;
  return still(image, /png|webp|gif|svg/.test(blob.type));
}

/** Quadro da mídia para um instante da conversa (em segundos desde que entrou). */
export function mediaFrameAt(media: LoadedMedia, seconds: number): CanvasImageSource {
  if (!media.animated || media.frames.length < 2) return media.frames[0]!;
  const index = Math.floor(Math.max(0, seconds) * media.fps) % media.frames.length;
  return media.frames[index]!;
}

// tipagem mínima da API ImageDecoder (ainda não está no lib.dom padrão)
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } };
  decode(init: { frameIndex: number }): Promise<{ image: CanvasImageSource & { duration?: number } }>;
}
