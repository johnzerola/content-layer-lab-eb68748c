/**
 * Renderização real de um projeto de template (instance_data) para MP4.
 *
 * O desenho segue as coordenadas relativas do TemplateDoc e o vídeo do corte
 * é lido pelo intervalo escolhido (CUT_VIDEO). Saída padrão: 1080x1920.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { pickAudioCodec, pickBitrate, pickVideoCodec } from "@/lib/encode-presets";
import { renderAudioTrack } from "@/lib/audio-track";
import { cleanMp4Metadata } from "@/lib/mp4meta";
import { bgSleep } from "@/lib/keepalive";
import {
  composeTransitions,
  cropRect,
  keptSegments,
  preEditFilter,
  segmentTransitionAt,
  segmentsDuration,
  srcTimeAt,
  transitionAt,
  type PreEdit,
  type TransitionState,
} from "@/lib/preedit";
import {
  ASPECT_SIZES,
  NEUTRAL_FILTER,
  type AnimationSpec,
  type FilterValues,
  type TemplateDoc,
  type TemplateLayer,
} from "@/lib/video-template/types";

export interface TemplateRenderCut {
  start: number;
  end: number;
}

export interface TemplateRenderOptions {
  doc: TemplateDoc;
  file: File;
  cut?: TemplateRenderCut | null;
  /** pré-edição: trechos, keyframes de enquadramento, transições e cor */
  preedit?: PreEdit | null;
  fps?: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal | undefined;
}


export function templateRenderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.VideoEncoder !== "undefined" &&
    typeof window.VideoFrame !== "undefined"
  );
}

function filterCss(f: Partial<FilterValues> | null | undefined): string {
  if (!f) return "none";
  const v = { ...NEUTRAL_FILTER, ...f };
  const parts = [
    `brightness(${v.brightness})`,
    `contrast(${v.contrast})`,
    `saturate(${v.saturation})`,
    `hue-rotate(${v.hue}deg)`,
    `sepia(${v.sepia})`,
    `grayscale(${v.grayscale})`,
  ];
  if (v.blur) parts.push(`blur(${v.blur}px)`);
  return parts.join(" ");
}

function activeAt(layer: TemplateLayer, t: number): boolean {
  if (!layer.visible) return false;
  if (t < layer.startTime) return false;
  if (layer.endTime != null && t > layer.endTime) return false;
  return true;
}

const EASE: Record<string, (k: number) => number> = {
  linear: (k) => k,
  easeIn: (k) => k * k,
  easeOut: (k) => 1 - Math.pow(1 - k, 3),
  easeInOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
};

interface AnimState {
  alpha: number;
  scale: number;
  dx: number;
  dy: number;
  rotate: number;
}

const NEUTRAL_ANIM: AnimState = { alpha: 1, scale: 1, dx: 0, dy: 0, rotate: 0 };

/** Estado visual de uma animação (entrada/saída/loop) em `k` de 0 a 1. */
function animState(spec: AnimationSpec | null | undefined, k: number, outward: boolean, loop = false): AnimState {
  if (!spec || !spec.type || spec.type === "none") return NEUTRAL_ANIM;
  const e = (EASE[spec.easing] ?? EASE["easeOut"]!)(Math.min(1, Math.max(0, k)));
  const inv = 1 - e;
  const dir = outward ? -1 : 1;
  switch (spec.type) {
    case "fadeIn":
      return { ...NEUTRAL_ANIM, alpha: e };
    case "slideUp":
      return { ...NEUTRAL_ANIM, alpha: e, dy: dir * inv * 0.25 };
    case "slideDown":
      return { ...NEUTRAL_ANIM, alpha: e, dy: -dir * inv * 0.25 };
    case "slideLeft":
      return { ...NEUTRAL_ANIM, alpha: e, dx: dir * inv * 0.25 };
    case "slideRight":
      return { ...NEUTRAL_ANIM, alpha: e, dx: -dir * inv * 0.25 };
    case "scaleIn":
    case "zoom":
      return { ...NEUTRAL_ANIM, alpha: e, scale: 0.7 + e * 0.3 };
    case "pop":
      return { ...NEUTRAL_ANIM, alpha: e, scale: 0.6 + Math.sin(e * Math.PI * 0.5) * 0.45 };
    case "bounce":
      return { ...NEUTRAL_ANIM, alpha: e, dy: -Math.abs(Math.sin(inv * Math.PI * 2)) * 0.06 };
    case "pulse":
      return loop
        ? { ...NEUTRAL_ANIM, scale: 1 + Math.sin(k * Math.PI * 2) * 0.05 }
        : { ...NEUTRAL_ANIM, alpha: e, scale: 0.95 + e * 0.05 };
    case "shake":
      return { ...NEUTRAL_ANIM, dx: Math.sin(k * Math.PI * 8) * 0.01 };
    case "float":
      return { ...NEUTRAL_ANIM, dy: Math.sin(k * Math.PI * 2) * 0.02 };
    case "spin":
      return { ...NEUTRAL_ANIM, rotate: k * 360 };
    default:
      return { ...NEUTRAL_ANIM, alpha: e };
  }
}

/** Junta entrada, saída e loop de uma camada no instante `t`. */
function layerAnim(layer: TemplateLayer, t: number): AnimState {
  const local = t - layer.startTime;
  let s: AnimState = NEUTRAL_ANIM;
  const inSpec = layer.animationIn;
  if (inSpec && inSpec.duration > 0) {
    const k = (local - (inSpec.delay || 0)) / inSpec.duration;
    if (k < 1) s = animState(inSpec, Math.max(0, k), false);
  }
  const outSpec = layer.animationOut;
  if (outSpec && outSpec.duration > 0 && layer.endTime != null) {
    const left = layer.endTime - t;
    if (left < outSpec.duration) s = animState(outSpec, Math.max(0, left) / outSpec.duration, true);
  }
  const loopSpec = layer.animationLoop;
  if (loopSpec && loopSpec.duration > 0) {
    const l = animState(loopSpec, (local % loopSpec.duration) / loopSpec.duration, false, true);
    s = { alpha: s.alpha * l.alpha, scale: s.scale * l.scale, dx: s.dx + l.dx, dy: s.dy + l.dy, rotate: s.rotate + l.rotate };
  }
  return s;
}


function drawFit(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "cover" | "contain" | "fill",
) {
  if (!sw || !sh) return;
  if (fit === "fill") {
    ctx.drawImage(src, x, y, w, h);
    return;
  }
  const scale = fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function paintBackground(ctx: CanvasRenderingContext2D, doc: TemplateDoc, W: number, H: number, images: Map<string, HTMLImageElement>) {
  const bg = doc.canvas.background;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (bg.kind === "color") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === "gradient") {
    const rad = ((bg.angle ?? 0) * Math.PI) / 180;
    const g = ctx.createLinearGradient(0, 0, Math.cos(rad) * W, Math.sin(rad) * H);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === "image" && bg.src) {
    const img = images.get(bg.src);
    if (img) drawFit(ctx, img, img.naturalWidth, img.naturalHeight, 0, 0, W, H, "cover");
  }
}

function drawText(ctx: CanvasRenderingContext2D, layer: Extract<TemplateLayer, { type: "text" }>, x: number, y: number, w: number, h: number) {
  const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  if (!text) return;
  ctx.font = `${layer.italic ? "italic " : ""}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = layer.align;

  // quebra por largura da camada
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > w && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const lineH = layer.fontSize * (layer.lineHeight || 1.2);
  const totalH = lines.length * lineH;
  const startY = y + Math.max(0, (h - totalH) / 2);
  const tx = layer.align === "center" ? x + w / 2 : layer.align === "right" ? x + w : x;

  if (layer.background) {
    ctx.fillStyle = layer.background;
    const pad = layer.padding || 0;
    ctx.fillRect(x - pad, startY - pad, w + pad * 2, totalH + pad * 2);
  }

  lines.forEach((ln, i) => {
    const ly = startY + i * lineH;
    if (layer.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowBlur = layer.fontSize * 0.25;
      ctx.shadowOffsetY = layer.fontSize * 0.06;
    }
    if (layer.strokeWidth > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = layer.strokeWidth;
      ctx.strokeStyle = layer.strokeColor;
      ctx.strokeText(ln, tx, ly);
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(ln, tx, ly);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
}

function drawShape(ctx: CanvasRenderingContext2D, layer: Extract<TemplateLayer, { type: "shape" }>, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = layer.fill;
  ctx.strokeStyle = layer.stroke;
  ctx.lineWidth = layer.strokeWidth;
  if (layer.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (layer.strokeWidth) ctx.stroke();
  } else if (layer.shape === "line") {
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.strokeStyle = layer.fill;
    ctx.lineWidth = Math.max(1, h);
    ctx.stroke();
  } else {
    const r = layer.shape === "rounded" ? Math.min(layer.radius, w / 2, h / 2) : 0;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    if (layer.strokeWidth) ctx.stroke();
  }
}

interface CaptionCueLike {
  start: number;
  end: number;
  text: string;
}

function captionCues(doc: TemplateDoc): CaptionCueLike[] {
  const raw = doc.settings?.["boundCaptions"];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is CaptionCueLike =>
      typeof c === "object" && c !== null && typeof (c as CaptionCueLike).text === "string",
  );
}

/** Desenha um frame completo do template no tempo `t` (em segundos do corte). */
export function drawTemplateFrame(
  ctx: CanvasRenderingContext2D,
  doc: TemplateDoc,
  t: number,
  video: HTMLVideoElement | null,
  images: Map<string, HTMLImageElement>,
  cues: CaptionCueLike[] = [],
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.filter = "none";
  paintBackground(ctx, doc, W, H, images);
  ctx.restore();

  const layers = [...doc.layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of layers) {
    if (!activeAt(layer, t)) continue;
    const x = (layer.x / 100) * W;
    const y = (layer.y / 100) * H;
    const w = (layer.width / 100) * W;
    const h = (layer.height / 100) * H;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    ctx.filter = filterCss(layer.filter ?? doc.filter);
    if (layer.rotation) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    if (layer.type === "video" && video && video.videoWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, layer.mask === "circle" ? Math.min(w, h) / 2 : layer.radius || 0);
      ctx.clip();
      drawFit(ctx, video, video.videoWidth, video.videoHeight, x, y, w, h, layer.fit);
      ctx.restore();
    } else if (layer.type === "image" && layer.src) {
      const img = images.get(layer.src);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, layer.radius || 0);
        ctx.clip();
        drawFit(ctx, img, img.naturalWidth, img.naturalHeight, x, y, w, h, layer.fit);
        ctx.restore();
      }
    } else if (layer.type === "text") {
      ctx.filter = "none";
      drawText(ctx, layer, x, y, w, h);
    } else if (layer.type === "shape") {
      drawShape(ctx, layer, x, y, w, h);
    } else if (layer.type === "caption") {
      const cue = cues.find((c) => t >= c.start && t <= c.end);
      if (cue) {
        ctx.filter = "none";
        const s = layer.style;
        drawText(
          ctx,
          {
            ...layer,
            type: "text",
            text: cue.text,
            fontFamily: s.fontFamily,
            fontWeight: s.fontWeight,
            fontSize: s.fontSize,
            color: s.color,
            align: s.align,
            letterSpacing: 0,
            lineHeight: 1.15,
            uppercase: s.uppercase,
            italic: false,
            underline: false,
            strokeColor: s.strokeColor,
            strokeWidth: s.strokeWidth,
            shadow: s.shadow,
            background: s.background,
            padding: 12,
            radius: 12,
          } as Extract<TemplateLayer, { type: "text" }>,
          x,
          y,
          w,
          h,
        );
      }
    }
    ctx.restore();
  }
}

function collectImageSources(doc: TemplateDoc): string[] {
  const out = new Set<string>();
  if (doc.canvas.background.kind === "image" && doc.canvas.background.src) out.add(doc.canvas.background.src);
  for (const l of doc.layers) if (l.type === "image" && l.src) out.add(l.src);
  return [...out];
}

/** Renderiza o projeto para um MP4 real (H.264 + AAC). */
export async function renderTemplateProject(opts: TemplateRenderOptions): Promise<Blob> {
  if (!templateRenderSupported()) throw new Error("Este navegador não suporta a renderização de vídeo (WebCodecs).");
  const { doc, file } = opts;
  const fps = opts.fps ?? 30;
  const size = ASPECT_SIZES[doc.aspectRatio] ?? ASPECT_SIZES["9:16"];
  const W = doc.canvas.width || size.width;
  const H = doc.canvas.height || size.height;
  const bitrate = pickBitrate({ width: W, height: H, fps, tier: "balanced" });
  const picked = await pickVideoCodec(W, H, bitrate, fps, "balanced");
  if (!picked) throw new Error("Codificação de vídeo não suportada neste navegador.");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("Não foi possível ler o vídeo do corte."));
      setTimeout(() => rej(new Error("Tempo esgotado ao abrir o vídeo.")), 20_000);
    });

    const start = Math.max(0, Math.min(opts.cut?.start ?? 0, Math.max(0, video.duration - 0.4)));
    const end = Math.min(video.duration || start + 1, opts.cut?.end ?? video.duration);
    const dur = Math.max(0.4, end - start);
    const totalFrames = Math.max(1, Math.round(dur * fps));

    const images = new Map<string, HTMLImageElement>();
    for (const src of collectImageSources(doc)) {
      const img = await loadImage(src);
      if (img) images.set(src, img);
    }

    const audio = await renderAudioTrack(file, [{ start, end }], 1, 0, 0).catch(() => null);
    const audioCodec = audio ? await pickAudioCodec(audio.channels, audio.sampleRate) : null;

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: picked.mux, width: W, height: H, frameRate: fps },
      ...(audio && audioCodec
        ? { audio: { codec: audioCodec, numberOfChannels: audio.channels, sampleRate: audio.sampleRate } }
        : {}),
      fastStart: "in-memory",
    });

    let encoderError: DOMException | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });
    encoder.configure(picked.cfg);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const cues = captionCues(doc);
    const frameDur = Math.round(1_000_000 / fps);

    const seekTo = (time: number) =>
      new Promise<void>((res) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.onseeked = null;
          res();
        };
        video.onseeked = finish;
        video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.001));
        setTimeout(finish, 3000);
      });

    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) throw new DOMException("cancelado", "AbortError");
      if (encoderError) throw encoderError;
      const tOut = i / fps;
      await seekTo(start + tOut);
      drawTemplateFrame(ctx, doc, tOut, video, images, cues);
      const frame = new VideoFrame(canvas, { timestamp: i * frameDur, duration: frameDur });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await bgSleep(2);
      if (i % 3 === 0) opts.onProgress?.(Math.min(0.96, i / totalFrames));
    }

    await encoder.flush();
    encoder.close();

    if (audio && audioCodec && typeof window.AudioEncoder !== "undefined") {
      const { rendered, channels, sampleRate } = audio;
      const aenc = new window.AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: () => undefined,
      });
      const cfg: AudioEncoderConfig = {
        codec: audioCodec === "aac" ? "mp4a.40.2" : "opus",
        sampleRate,
        numberOfChannels: channels,
        bitrate: 128_000,
      };
      const sup = await window.AudioEncoder.isConfigSupported(cfg).catch(() => null);
      if (sup?.supported) {
        aenc.configure(cfg);
        const chunkSize = 4800;
        const planes: Float32Array[] = [];
        for (let c = 0; c < channels; c++) planes.push(rendered.getChannelData(c));
        for (let off = 0; off < rendered.length; off += chunkSize) {
          const len = Math.min(chunkSize, rendered.length - off);
          const data = new Float32Array(len * channels);
          for (let c = 0; c < channels; c++) data.set(planes[c]!.subarray(off, off + len), c * len);
          const ad = new AudioData({
            format: "f32-planar",
            sampleRate,
            numberOfFrames: len,
            numberOfChannels: channels,
            timestamp: Math.round((off / sampleRate) * 1_000_000),
            data,
          });
          aenc.encode(ad);
          ad.close();
        }
        await aenc.flush();
        aenc.close();
      }
    }

    muxer.finalize();
    opts.onProgress?.(1);
    const raw = muxer.target.buffer as ArrayBuffer;
    return new Blob([cleanMp4Metadata(raw)], { type: "video/mp4" });
  } finally {
    URL.revokeObjectURL(url);
    video.src = "";
  }
}
