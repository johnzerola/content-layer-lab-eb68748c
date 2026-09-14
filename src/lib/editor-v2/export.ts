import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { cleanMp4Metadata } from "@/lib/mp4meta";
import { FrameReader, type DecodedFrame } from "@/lib/decode";
import { pickAudioCodec, pickBitrate, pickVideoCodec } from "@/lib/encode-presets";
import { drawSticker, type StickerId } from "@/lib/editor/stickers";
import { resolveAudioMixFrame } from "./audio";
import { asProjectTime } from "./types";
import { projectToSourceTime } from "./clock";
import {
  createEditorRenderManifest,
  editorProjectFromManifest,
  resolveCompositionFrame,
  type EditorRenderManifestV2,
  type ResolvedVisualLayer,
} from "./render-manifest";
import type { CaptionCue, Clip, EditorProjectV2, MediaAsset } from "./types";

export interface EditorV2ExportOptions {
  project: EditorProjectV2;
  assetFiles: ReadonlyMap<string, File>;
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
}

interface AudioPcm {
  planes: Float32Array[];
  channels: number;
  sampleRate: number;
}

interface VideoCursor {
  reader: FrameReader;
  current: DecodedFrame | null;
}

function abortIfNeeded(signal?: AbortSignal) {
  signal?.throwIfAborted();
}

function activeAudioAssetIds(manifest: EditorRenderManifestV2): Set<string> {
  const result = new Set<string>();
  const groupsByClip = new Map<string, EditorRenderManifestV2["audioGroups"][number]>();
  for (const group of manifest.audioGroups) {
    if (group.extractedClipId) groupsByClip.set(group.extractedClipId, group);
    if (group.dialogueClipId) groupsByClip.set(group.dialogueClipId, group);
    if (group.musicClipId) groupsByClip.set(group.musicClipId, group);
  }
  for (const clip of manifest.audioClips) {
    const group = groupsByClip.get(clip.id);
    if (!group || group.activeRepresentation === "extracted" && group.extractedClipId === clip.id
      || group.activeRepresentation === "separated" && (group.dialogueClipId === clip.id || group.musicClipId === clip.id)) {
      result.add(clip.assetId);
    }
  }
  for (const group of manifest.audioGroups) {
    if (group.activeRepresentation === "embedded") result.add(group.sourceAssetId);
  }
  return result;
}

async function decodeAudioAssets(
  manifest: EditorRenderManifestV2,
  files: ReadonlyMap<string, File>,
  signal?: AbortSignal,
): Promise<Map<string, AudioBuffer>> {
  const ids = activeAudioAssetIds(manifest);
  if (!ids.size) return new Map();
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("Este navegador não consegue preparar o áudio da exportação.");
  const context = new AudioCtx();
  const decoded = new Map<string, AudioBuffer>();
  try {
    for (const id of ids) {
      abortIfNeeded(signal);
      const file = files.get(id);
      if (!file) continue;
      try {
        decoded.set(id, await context.decodeAudioData(await file.arrayBuffer()));
      } catch {
        throw new Error(`Não foi possível decodificar o áudio de ${file.name} para exportar.`);
      }
    }
    return decoded;
  } finally {
    await context.close();
  }
}

/** Mixes the serialized contract. Gains are sampled every 128 frames (~2.7 ms). */
async function renderAudioFromManifest(
  manifest: EditorRenderManifestV2,
  project: EditorProjectV2,
  files: ReadonlyMap<string, File>,
  signal?: AbortSignal,
): Promise<AudioPcm | null> {
  const decoded = await decodeAudioAssets(manifest, files, signal);
  const duration = manifest.settings.duration;
  const sampleRate = 48_000;
  const channels = 2;
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
  const planes = [new Float32Array(frameCount), new Float32Array(frameCount)];
  let audible = false;
  const blockSize = 128;
  for (let offset = 0; offset < frameCount; offset += blockSize) {
    if (offset % (blockSize * 200) === 0) abortIfNeeded(signal);
    const length = Math.min(blockSize, frameCount - offset);
    const middle = offset + length / 2;
    const projectTime = middle / sampleRate;
    const layers = resolveAudioMixFrame(project, projectTime).filter((layer) => !layer.muted && layer.gain > 0);
    for (const layer of layers) {
      const source = decoded.get(layer.assetId);
      if (!source) throw new Error(`A mídia de áudio necessária não está disponível: ${layer.assetId}.`);
      audible = true;
      for (let index = 0; index < length; index += 1) {
        const delta = (offset + index - middle) / sampleRate;
        const sourcePosition = (layer.sourceTime + delta * layer.playbackRate) * source.sampleRate;
        if (sourcePosition < 0 || sourcePosition >= source.length - 1) continue;
        const left = Math.floor(sourcePosition);
        const fraction = sourcePosition - left;
        for (let channel = 0; channel < channels; channel += 1) {
          const sourceChannel = source.getChannelData(Math.min(channel, source.numberOfChannels - 1));
          const value = sourceChannel[left]! * (1 - fraction) + sourceChannel[left + 1]! * fraction;
          const plane = planes[channel];
          if (plane) plane[offset + index] = (plane[offset + index] ?? 0) + value * layer.gain;
        }
      }
    }
  }
  if (!audible) return null;
  let peak = 0;
  for (const plane of planes) {
    for (let index = 0; index < plane.length; index += 1) peak = Math.max(peak, Math.abs(plane[index]!));
  }
  const limiterGain = peak > 1 ? 1 / peak : 1;
  if (limiterGain < 1) {
    for (const plane of planes) {
      for (let index = 0; index < plane.length; index += 1) plane[index] = (plane[index] ?? 0) * limiterGain;
    }
  }
  return { planes, channels, sampleRate };
}

async function openVisualAssets(project: EditorProjectV2, files: ReadonlyMap<string, File>) {
  const images = new Map<string, ImageBitmap>();
  const videos = new Map<string, VideoCursor>();
  const needed = new Set(project.tracks.flatMap((track) => track.clips)
    .filter((clip) => clip.enabled && (clip.kind === "video" || clip.kind === "image"))
    .map((clip) => clip.assetId)
    .filter((id): id is string => Boolean(id)));
  for (const id of needed) {
    const asset = project.assets.find((item) => item.id === id);
    const file = files.get(id);
    if (!asset || !file) throw new Error(`A mídia visual necessária não está disponível: ${asset?.name ?? id}.`);
    if (asset.kind === "image") {
      images.set(id, await createImageBitmap(file));
      continue;
    }
    const reader = await FrameReader.open(file);
    if (!reader) throw new Error(`Este navegador não conseguiu decodificar ${file.name}.`);
    videos.set(id, { reader, current: null });
  }
  return { images, videos };
}

async function frameAt(cursor: VideoCursor, target: number): Promise<VideoFrame> {
  const current = cursor.current;
  if (!current || target < current.time - 0.05 || target > current.time + 2.5) {
    current?.frame.close();
    await cursor.reader.seek(Math.max(0, target - 0.04));
    cursor.current = await cursor.reader.read();
  }
  while (cursor.current && cursor.current.time + cursor.current.duration <= target - 0.0001) {
    const next = await cursor.reader.read();
    if (!next) break;
    cursor.current.frame.close();
    cursor.current = next;
  }
  if (!cursor.current) throw new Error("O vídeo terminou antes do tempo esperado na timeline.");
  return cursor.current.frame;
}

function objectCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / Math.max(1, sourceWidth), height / Math.max(1, sourceHeight));
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sx = (sourceWidth - cropWidth) / 2;
  const sy = (sourceHeight - cropHeight) / 2;
  ctx.drawImage(source, sx, sy, cropWidth, cropHeight, -width / 2, -height / 2, width, height);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.max(0, Math.min(radius, Math.min(width, height) / 2)));
}

function applyTextStyle(ctx: CanvasRenderingContext2D, clip: Clip, scale: number) {
  const style = clip.style ?? {};
  const size = Math.max(10, (style.fontSize ?? 48) * scale);
  ctx.font = `${style.fontWeight ?? 700} ${size}px ${style.fontFamily ?? "Inter, system-ui, sans-serif"}`;
  ctx.textAlign = style.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.color ?? "#ffffff";
  ctx.lineWidth = Math.max(0, (style.strokeWidth ?? 0) * scale);
  ctx.strokeStyle = style.strokeColor ?? "#000000";
  ctx.shadowColor = style.shadow ? style.strokeColor ?? "rgba(0,0,0,.8)" : "transparent";
  ctx.shadowBlur = style.shadow ? 12 * scale : 0;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawCaption(ctx: CanvasRenderingContext2D, clip: Clip, cue: CaptionCue, preset: Record<string, unknown>, time: number, width: number, height: number) {
  applyTextStyle(ctx, clip, Math.min(width / 1080, height / 1920));
  const words = cue.words?.length ? cue.words : [{ id: cue.id, text: cue.text, start: cue.start, end: cue.end }];
  const mode = String(preset["mode"] ?? "line");
  if (mode === "line") {
    const lines = wrapText(ctx, cue.text, width * 0.92);
    const lineHeight = (clip.style?.fontSize ?? 48) * Math.min(width / 1080, height / 1920) * (clip.style?.lineHeight ?? 1.05);
    lines.forEach((line, index) => {
      const y = (index - (lines.length - 1) / 2) * lineHeight;
      if (ctx.lineWidth) ctx.strokeText(line, 0, y, width * 0.95);
      ctx.fillText(line, 0, y, width * 0.95);
    });
    return;
  }
  const active = Math.max(0, words.findIndex((word) => time >= Number(word.start) && time < Number(word.end)));
  const gap = ctx.measureText(" ").width;
  const widths = words.map((word) => ctx.measureText(word.text).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, words.length - 1);
  let x = -total / 2;
  words.forEach((word, index) => {
    const wordWidth = widths[index]!;
    ctx.save();
    if (index === active) {
      const activeColor = String(preset["activeWordColor"] ?? clip.style?.highlightColor ?? "#a990ff");
      if (clip.style?.highlight === "box") {
        roundedRect(ctx, x - 5, -ctx.measureText("M").actualBoundingBoxAscent - 5, wordWidth + 10, ctx.measureText("M").actualBoundingBoxAscent * 1.6, 5);
        ctx.fillStyle = activeColor;
        ctx.fill();
        ctx.fillStyle = clip.style?.color ?? "#fff";
      } else ctx.fillStyle = activeColor;
    } else ctx.globalAlpha = Number(preset["inactiveWordOpacity"] ?? 1);
    if (ctx.lineWidth) ctx.strokeText(word.text, x + wordWidth / 2, 0);
    ctx.fillText(word.text, x + wordWidth / 2, 0);
    ctx.restore();
    x += wordWidth + gap;
  });
}

async function drawLayer(
  ctx: CanvasRenderingContext2D,
  project: EditorProjectV2,
  layer: ResolvedVisualLayer,
  time: number,
  width: number,
  height: number,
  images: Map<string, ImageBitmap>,
  videos: Map<string, VideoCursor>,
) {
  const clip = project.tracks.flatMap((track) => track.clips).find((item) => item.id === layer.clipId);
  if (!clip) return;
  const transform = layer.transform;
  const boxWidth = width * transform.width / 100;
  const boxHeight = height * transform.height / 100;
  const centerX = width * transform.x / 100 + (layer.transition.translateX + layer.presentation.translateX) / 100 * boxWidth;
  const centerY = height * transform.y / 100 + layer.presentation.translateY / 100 * boxHeight;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity * layer.transition.opacity * layer.presentation.opacity));
  ctx.translate(centerX, centerY);
  ctx.rotate((transform.rotation + layer.presentation.rotation) * Math.PI / 180);
  const visualScale = transform.scale * layer.transition.scale * layer.presentation.scale;
  const flipX = (clip.kind === "video" || clip.kind === "image") && clip.flipHorizontal ? -1 : 1;
  const flipY = (clip.kind === "video" || clip.kind === "image") && clip.flipVertical ? -1 : 1;
  ctx.scale(visualScale * flipX, visualScale * flipY);
  ctx.filter = layer.presentation.filter;
  if (clip.assetId && clip.kind === "image") {
    const image = images.get(clip.assetId);
    if (image) objectCover(ctx, image, image.width, image.height, boxWidth, boxHeight);
  } else if (clip.assetId && clip.kind === "video") {
    const cursor = videos.get(clip.assetId);
    if (!cursor) throw new Error(`Vídeo indisponível para o clipe ${clip.name}.`);
    const sourceTime = projectToSourceTime(clip, asProjectTime(time)) ?? clip.sourceIn;
    const frame = await frameAt(cursor, sourceTime);
    objectCover(ctx, frame, frame.displayWidth, frame.displayHeight, boxWidth, boxHeight);
  } else if (layer.caption) {
    drawCaption(ctx, clip, layer.caption.cue, layer.caption.preset, time, boxWidth, boxHeight);
  } else if (clip.kind === "sticker" && clip.sticker) {
    drawSticker(ctx, clip.sticker.stickerId as StickerId, -boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, {
      t: Math.max(0, time - Number(clip.projectStart)), color: clip.sticker.color, accent: clip.sticker.accent,
      text: clip.sticker.text, fontFamily: clip.style?.fontFamily ?? "Inter", speed: clip.sticker.speed,
    });
  } else if (clip.kind === "shape") {
    const colors = Array.isArray(clip.metadata?.["colors"]) ? clip.metadata!["colors"] as string[] : ["#7657ff", "#111522"];
    const gradient = ctx.createLinearGradient(-boxWidth / 2, -boxHeight / 2, boxWidth / 2, boxHeight / 2);
    gradient.addColorStop(0, colors[0] ?? "#7657ff");
    gradient.addColorStop(1, colors[1] ?? "#111522");
    ctx.fillStyle = gradient;
    if (clip.metadata?.["rendererId"] === "circle") { ctx.beginPath(); ctx.arc(0, 0, Math.min(boxWidth, boxHeight) / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
  } else {
    applyTextStyle(ctx, clip, Math.min(width / 1080, height / 1920));
    const text = clip.style?.uppercase ? (clip.style?.text ?? clip.name).toUpperCase() : clip.style?.text ?? clip.name;
    const lines = wrapText(ctx, text, boxWidth * 0.92);
    const lineHeight = (clip.style?.fontSize ?? 48) * Math.min(width / 1080, height / 1920) * (clip.style?.lineHeight ?? 1.05);
    if (clip.style?.backgroundColor) {
      roundedRect(ctx, -boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, (clip.style.borderRadius ?? 0) * Math.min(width / 1080, height / 1920));
      ctx.fillStyle = clip.style.backgroundColor;
      ctx.fill();
      ctx.fillStyle = clip.style.color ?? "#fff";
    }
    lines.forEach((line, index) => {
      const y = (index - (lines.length - 1) / 2) * lineHeight;
      if (ctx.lineWidth) ctx.strokeText(line, 0, y, boxWidth * 0.95);
      ctx.fillText(line, 0, y, boxWidth * 0.95);
    });
  }
  if (layer.presentation.overlay) {
    ctx.filter = "none";
    ctx.globalAlpha *= layer.presentation.overlayOpacity;
    ctx.fillStyle = layer.presentation.overlay;
    ctx.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
  }
  ctx.restore();
}

export async function renderEditorProjectV2(options: EditorV2ExportOptions): Promise<Blob> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error("A exportação V2 exige um navegador com WebCodecs.");
  }
  const manifest = JSON.parse(JSON.stringify(createEditorRenderManifest(options.project))) as EditorRenderManifestV2;
  const project = editorProjectFromManifest(manifest);
  const { width, height, fps, duration } = manifest.settings;
  if (!(width > 0 && height > 0 && fps > 0 && duration > 0)) throw new Error("Configuração de exportação inválida.");
  abortIfNeeded(options.signal);
  options.onProgress?.(0.01, "Preparando mídias");
  const [{ images, videos }, audio] = await Promise.all([
    openVisualAssets(project, options.assetFiles),
    renderAudioFromManifest(manifest, project, options.assetFiles, options.signal),
    document.fonts?.ready,
  ]);
  const bitrate = pickBitrate({ width, height, fps, tier: "balanced" });
  const picked = await pickVideoCodec(width, height, bitrate, fps, "balanced");
  if (!picked) throw new Error("Nenhum codificador de vídeo compatível foi encontrado.");
  const audioCodec = audio ? await pickAudioCodec(audio.channels, audio.sampleRate) : null;
  if (audio && (!audioCodec || typeof AudioEncoder === "undefined" || typeof AudioData === "undefined")) {
    throw new Error("O navegador não consegue exportar o mix de áudio; o arquivo não foi gerado mudo.");
  }
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width, height, frameRate: fps },
    ...(audio && audioCodec ? { audio: { codec: audioCodec, numberOfChannels: audio.channels, sampleRate: audio.sampleRate } } : {}),
    fastStart: "in-memory",
  });
  let videoError: DOMException | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (error) => { videoError = error; } });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas de exportação indisponível.");
  try {
    encoder.configure(picked.cfg);
    const totalFrames = Math.max(1, Math.ceil(duration * fps));
    const frameDuration = Math.round(1_000_000 / fps);
    for (let index = 0; index < totalFrames; index += 1) {
      abortIfNeeded(options.signal);
      if (videoError) throw videoError;
      const time = index / fps;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#080a0f";
      ctx.fillRect(0, 0, width, height);
      const layers = resolveCompositionFrame(project, time).sort((left, right) => left.order - right.order);
      for (const layer of layers) await drawLayer(ctx, project, layer, time, width, height, images, videos);
      const frame = new VideoFrame(canvas, { timestamp: index * frameDuration, duration: frameDuration });
      encoder.encode(frame, { keyFrame: index % Math.max(1, fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise<void>((resolve) => setTimeout(resolve, 1));
      if (index % 3 === 0) options.onProgress?.(0.08 + index / totalFrames * 0.78, "Renderizando vídeo");
    }
    await encoder.flush();
    if (videoError) throw videoError;

    if (audio && audioCodec) {
      options.onProgress?.(0.88, "Codificando áudio");
      let audioError: DOMException | null = null;
      const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (error) => { audioError = error; } });
      const config: AudioEncoderConfig = { codec: audioCodec === "aac" ? "mp4a.40.2" : "opus", sampleRate: audio.sampleRate, numberOfChannels: audio.channels, bitrate: 192_000 };
      const supported = await AudioEncoder.isConfigSupported(config).catch(() => null);
      if (!supported?.supported) throw new Error("Configuração de áudio incompatível com este navegador.");
      try {
        audioEncoder.configure(config);
        const chunkSize = 4_800;
        for (let offset = 0; offset < audio.planes[0]!.length; offset += chunkSize) {
          abortIfNeeded(options.signal);
          const length = Math.min(chunkSize, audio.planes[0]!.length - offset);
          const data = new Float32Array(length * audio.channels);
          for (let channel = 0; channel < audio.channels; channel += 1) data.set(audio.planes[channel]!.subarray(offset, offset + length), channel * length);
          const audioData = new AudioData({ format: "f32-planar", sampleRate: audio.sampleRate, numberOfFrames: length, numberOfChannels: audio.channels, timestamp: Math.round(offset / audio.sampleRate * 1_000_000), data });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        await audioEncoder.flush();
        if (audioError) throw audioError;
      } finally {
        if (audioEncoder.state !== "closed") audioEncoder.close();
      }
    }
    muxer.finalize();
    options.onProgress?.(1, "Exportação concluída");
    return new Blob([cleanMp4Metadata(muxer.target.buffer as ArrayBuffer)], { type: "video/mp4" });
  } finally {
    if (encoder.state !== "closed") encoder.close();
    for (const image of images.values()) image.close();
    for (const cursor of videos.values()) { cursor.current?.frame.close(); cursor.reader.close(); }
  }
}
