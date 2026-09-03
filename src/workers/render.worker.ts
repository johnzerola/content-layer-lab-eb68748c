/// <reference lib="webworker" />
/**
 * Worker de exportação: desenha em OffscreenCanvas e codifica o MP4 fora da
 * thread da interface. Vários workers rodam em paralelo (pool em
 * `src/lib/render-pool.ts`), então o app continua fluido durante o lote.
 */
import { coreEncodeMp4 } from "@/lib/encode-core";
import { setImageSource } from "@/lib/draw";
import type { Template } from "@/lib/template";
import type { Variation } from "@/lib/variation";
import type { CaptionCue } from "@/lib/captions";
import type { PreEdit } from "@/lib/preedit";
import type { AudioPcm, Envelope } from "@/lib/audio-track";
import type { QualityTier } from "@/lib/encode-presets";

export interface RenderRequest {
  type: "render";
  id: number;
  file: File;
  duration: number;
  template: Template;
  variation: Variation;
  offsetX: number;
  offsetY: number;
  headline?: string | undefined;
  fps?: number | undefined;
  bitrate?: number | undefined;
  tier?: QualityTier | undefined;
  clip?: { start: number; end: number } | undefined;
  pre?: PreEdit | null | undefined;
  captions?: CaptionCue[] | undefined;
  plate?: { bitmap: ImageBitmap; ok: string[] } | null | undefined;
  audio?: AudioPcm | null | undefined;
  envelope?: Envelope | null | undefined;
  images?: { src: string; bitmap: ImageBitmap }[] | undefined;
  fonts?: { name: string; dataUrl: string }[] | undefined;
}

export type WorkerRequest = RenderRequest | { type: "cancel"; id: number };

export type WorkerResponse =
  | { type: "progress"; id: number; p: number }
  | { type: "phase"; id: number; phase: string }
  /** sinal de vida: o trabalho segue, mesmo que um quadro demore */
  | { type: "alive"; id: number }
  | { type: "done"; id: number; buffer: ArrayBuffer }
  | { type: "error"; id: number; message: string; name: string };

const cancelled = new Set<number>();
const registeredFonts = new Set<string>();

async function registerFonts(fonts?: { name: string; dataUrl: string }[]) {
  const store = (globalThis as unknown as { fonts?: { add: (f: FontFace) => void } }).fonts;
  if (!store) return;
  for (const f of fonts ?? []) {
    if (registeredFonts.has(f.name)) continue;
    try {
      // faixa ampla de peso: o canvas pede "800 60px Familia" e precisa casar
      const face = new FontFace(f.name, `url(${f.dataUrl})`, { weight: "100 900" });
      await face.load();
      store.add(face);
      registeredFonts.add(f.name);
    } catch {
      /* segue com a fonte padrão */
    }
  }
}

const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "cancel") {
    cancelled.add(msg.id);
    return;
  }
  const { id } = msg;
  // pulso a cada 3s: o vigia distingue "quadro lento" de "travou de vez"
  const beat = setInterval(() => post({ type: "alive", id }), 3_000);
  try {
    await registerFonts(msg.fonts);
    for (const img of msg.images ?? []) setImageSource(img.src, img.bitmap);

    const buffer = await coreEncodeMp4({
      file: msg.file,
      duration: msg.duration,
      template: msg.template,
      variation: msg.variation,
      offsetX: msg.offsetX,
      offsetY: msg.offsetY,
      headline: msg.headline,
      fps: msg.fps,
      bitrate: msg.bitrate,
      tier: msg.tier,
      clip: msg.clip,
      pre: msg.pre,
      captions: msg.captions,
      plate: msg.plate ? { canvas: msg.plate.bitmap, ok: new Set(msg.plate.ok) } : null,
      audio: msg.audio,
      envelope: msg.envelope,
      onProgress: (p) => post({ type: "progress", id, p }),
      onPhase: (phase) => post({ type: "phase", id, phase }),
      isCancelled: () => cancelled.has(id),
    });

    clearInterval(beat);
    cancelled.delete(id);
    post({ type: "done", id, buffer }, [buffer]);
  } catch (err) {
    clearInterval(beat);
    cancelled.delete(id);
    const error = err as Error;
    post({
      type: "error",
      id,
      message: String(error?.message ?? err),
      name: error?.name ?? "Error",
    });
  }
};
