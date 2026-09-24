import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Move, RotateCw } from "lucide-react";
import { DEFAULT_CLIP_TRANSFORM, asProjectTime, createPlaybackSurfaceKeys, findClip, projectToSourceTime, resolveCompositionFrame, sourceToProjectTime, type CaptionCue, type Clip, type ClipTransform, type EditorProjectV2, type ResolvedClipPresentation } from "@/lib/editor-v2";
import { captionWordMotionFrame } from "@/lib/editor-v2/caption-motion";
import { StickerVisualV2 } from "./StickerVisualV2";

interface CanvasProps {
  project: EditorProjectV2;
  currentTime: number;
  playing: boolean;
  assetSources: Record<string, string>;
  onPlaybackTime: (time: number) => void;
  onSelect: (id: string | null, additive?: boolean) => void;
  onTransform: (clipId: string, transform: ClipTransform) => void;
  onDropLibraryItem: (id: string) => void;
  onDropMediaAsset: (id: string) => void;
  onImportFiles: (files: FileList) => void;
}

type Gesture = { clipId: string; mode: "move" | "resize" | "rotate"; startX: number; startY: number; initial: ClipTransform; startAngle?: number };

export function EditorCanvasV2({ project, currentTime, playing, assetSources, onPlaybackTime, onSelect, onTransform, onDropLibraryItem, onDropMediaAsset, onImportFiles }: CanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ id: string; transform: ClipTransform } | null>(null);
  const resolvedLayers = useMemo(() => resolveCompositionFrame(project, currentTime), [project, currentTime]);
  const activeClips = useMemo(() => resolvedLayers.map((layer) => findClip(project, layer.clipId)).filter((clip): clip is Clip => Boolean(clip)), [project, resolvedLayers]);
  const playbackSurfaceKeys = useMemo(() => createPlaybackSurfaceKeys(project), [project]);
  const playbackClockClipId = activeClips.find((clip) => clip.kind === "video" && !clip.reversed && project.tracks.find((track) => track.id === clip.trackId)?.kind === "video")?.id ?? null;
  const primary = findClip(project, project.selection.primaryId);

  const beginGesture = (event: React.PointerEvent, clip: Clip, mode: Gesture["mode"]) => {
    event.stopPropagation();
    event.preventDefault();
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    onSelect(clip.id, additive);
    // Modifier click is reserved for building a multi-selection. It must not
    // move a clip while the user is still choosing the group.
    if (additive) return;
    const initial = { ...DEFAULT_CLIP_TRANSFORM, ...clip.transform };
    const rect = frameRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width * initial.x / 100 : event.clientX;
    const centerY = rect ? rect.top + rect.height * initial.y / 100 : event.clientY;
    const gesture: Gesture = { clipId: clip.id, mode, startX: event.clientX, startY: event.clientY, initial, ...(mode === "rotate" ? { startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) } : {}) };
    let latest: ClipTransform | null = null;
    const move = (next: PointerEvent) => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = (next.clientX - gesture.startX) / rect.width * 100;
      const dy = (next.clientY - gesture.startY) / rect.height * 100;
      let transform = gesture.mode === "move"
        ? { ...gesture.initial, x: gesture.initial.x + dx, y: gesture.initial.y + dy }
        : gesture.mode === "resize" ? { ...gesture.initial, width: Math.max(8, gesture.initial.width + dx * 2), height: Math.max(6, gesture.initial.height + dy * 2) }
        : { ...gesture.initial, rotation: gesture.initial.rotation + (Math.atan2(next.clientY - centerY, next.clientX - centerX) - (gesture.startAngle ?? 0)) * 180 / Math.PI };
      transform = snapTransform(transform);
      latest = transform;
      setDraft({ id: clip.id, transform });
    };
    const up = () => {
      if (latest) onTransform(clip.id, latest);
      setDraft(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  return (
    <section className="editor-v2-stage relative flex h-full min-h-0 flex-col overflow-hidden" aria-label="Prévia do vídeo">
      <div className="editor-v2-stage-header flex h-10 shrink-0 items-center justify-between px-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Prévia</span><span>{project.settings.width} × {project.settings.height}</span></div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Move className="size-3" /><span className="hidden sm:inline">Arraste para posicionar</span></div>
      </div>
      <div className="editor-v2-canvas-workspace relative grid min-h-0 flex-1 place-items-center overflow-hidden p-4 sm:p-6" onPointerDown={(event) => { if (event.target === event.currentTarget) onSelect(null); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) { onImportFiles(event.dataTransfer.files); return; } const mediaId = event.dataTransfer.getData("application/x-vaiviral-media-asset"); if (mediaId) { onDropMediaAsset(mediaId); return; } const id = event.dataTransfer.getData("application/x-vaiviral-library-item"); if (id) onDropLibraryItem(id); }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,oklch(0.25_0.035_275/.42),transparent_45%)]" />
        <div ref={frameRef} data-testid="editor-v2-canvas" className="editor-v2-canvas-frame relative max-h-full max-w-full overflow-hidden rounded-[18px] bg-[#080a0f]" style={{ aspectRatio: `${project.settings.width}/${project.settings.height}`, height: project.settings.width < project.settings.height ? "min(100%, 620px)" : "auto", width: project.settings.width < project.settings.height ? "auto" : "min(100%, 820px)" }} onPointerDown={(event) => { if (event.target === event.currentTarget) onSelect(null); }}>
          <div className="absolute inset-0 bg-[linear-gradient(155deg,#192033_0%,#0d1018_48%,#08090d_100%)]" />
          <div className="absolute inset-x-0 top-0 h-[38%] bg-[radial-gradient(circle_at_65%_45%,rgba(128,102,255,.35),transparent_45%)]" />
          {!activeClips.length && <div className="absolute inset-0 grid place-items-center p-8 text-center"><div className="max-w-52"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-white/6 text-muted-foreground"><ImagePlus className="size-5" /></span><p className="mt-3 text-sm font-medium">Arraste sua mídia para começar</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Solte aqui um vídeo, foto, áudio ou recurso da biblioteca.</p></div></div>}
          {activeClips.map((clip) => {
            const layer = resolvedLayers.find((item) => item.clipId === clip.id)!;
            const transform = draft?.id === clip.id ? draft.transform : layer.transform;
            const transition = layer.transition;
            const selected = project.selection.itemIds.includes(clip.id);
            const assetUrl = clip.assetId ? assetSources[clip.assetId] : undefined;
            return <CanvasClip key={playbackSurfaceKeys[clip.id] ?? clip.id} clip={clip} transform={transform} transition={transition} presentation={layer.presentation} selected={selected} primary={primary?.id === clip.id} currentTime={currentTime} playing={playing} drivesPlaybackClock={playbackClockClipId === clip.id} onPlaybackTime={onPlaybackTime} {...(layer.caption ? { caption: layer.caption } : {})} {...(assetUrl ? { assetUrl } : {})} onSelect={(additive) => onSelect(clip.id, additive)} onMove={(event) => beginGesture(event, clip, "move")} onResize={(event) => beginGesture(event, clip, "resize")} onRotate={(event) => beginGesture(event, clip, "rotate")} onKeyboardTransform={(next) => onTransform(clip.id, next)} />;
          })}
          <div className="pointer-events-none absolute inset-[5%] border border-dashed border-white/10" aria-hidden />
          {draft && (Math.abs(draft.transform.x - 50) < 0.01 || Math.abs(draft.transform.y - 50) < 0.01) && <><span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary/65" /><span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary/65" /></>}
        </div>
      </div>
    </section>
  );
}

function CanvasClip({ clip, transform, transition, presentation, selected, primary, currentTime, playing, drivesPlaybackClock, onPlaybackTime, assetUrl, caption, onSelect, onMove, onResize, onRotate, onKeyboardTransform }: { clip: Clip; transform: ClipTransform; transition: { opacity: number; translateX: number; scale: number }; presentation: ResolvedClipPresentation; selected: boolean; primary: boolean; currentTime: number; playing: boolean; drivesPlaybackClock: boolean; onPlaybackTime: (time: number) => void; assetUrl?: string; caption?: { cue: CaptionCue; preset: Record<string, unknown> }; onSelect: (additive: boolean) => void; onMove: (event: React.PointerEvent) => void; onResize: (event: React.PointerEvent) => void; onRotate: (event: React.PointerEvent) => void; onKeyboardTransform: (transform: ClipTransform) => void }) {
  const colors = Array.isArray(clip.metadata?.["colors"]) ? clip.metadata["colors"] as string[] : ["#7657ff", "#111522", "#f8f7ff"];
  const text = clip.style?.text ?? clip.name;
  return (
    <div role="button" tabIndex={0} aria-label={`${clip.name}${selected ? ", selecionado" : ""}`} onPointerDown={onMove} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(event.ctrlKey || event.metaKey || event.shiftKey); return; } const step = event.shiftKey ? 5 : 1; if (event.key === "ArrowLeft") onKeyboardTransform({ ...transform, x: transform.x - step }); else if (event.key === "ArrowRight") onKeyboardTransform({ ...transform, x: transform.x + step }); else if (event.key === "ArrowUp") onKeyboardTransform({ ...transform, y: transform.y - step }); else if (event.key === "ArrowDown") onKeyboardTransform({ ...transform, y: transform.y + step }); else return; event.preventDefault(); event.stopPropagation(); }} className="absolute touch-none select-none outline-none" style={{ left: `${transform.x}%`, top: `${transform.y}%`, width: `${transform.width}%`, height: `${transform.height}%`, opacity: transform.opacity * transition.opacity * presentation.opacity, transform: `translate(calc(-50% + ${transition.translateX + presentation.translateX}%), calc(-50% + ${presentation.translateY}%)) rotate(${transform.rotation + presentation.rotation}deg) scale(${transform.scale * transition.scale * presentation.scale})`, filter: presentation.filter, zIndex: selected ? 30 : 10 }}>
      {assetUrl && (clip.kind === "video" || clip.kind === "image") ? <MediaVisual clip={clip} url={assetUrl} currentTime={currentTime} playing={playing} drivesPlaybackClock={drivesPlaybackClock} onPlaybackTime={onPlaybackTime} /> : caption ? <CaptionVisual clip={clip} cue={caption.cue} preset={caption.preset} currentTime={currentTime} /> : clip.kind === "sticker" && clip.sticker ? <StickerVisualV2 sticker={clip.sticker} time={Math.max(0, currentTime - Number(clip.projectStart))} /> : clip.kind === "shape" ? <div className={`${clip.metadata?.["rendererId"] === "circle" ? "h-full aspect-square rounded-full" : clip.metadata?.["rendererId"] === "line" ? "absolute left-0 right-0 top-1/2 h-1 rounded-full" : "h-full w-full rounded-xl"}`} style={{ background: `linear-gradient(135deg,${colors[0]},${colors[1] ?? "#2dd4aa"})` }} /> : <div className="flex h-full w-full items-center justify-center px-3 text-center" style={{ color: clip.style?.color, background: clip.style?.backgroundColor, borderRadius: clip.style?.borderRadius, fontFamily: clip.style?.fontFamily, fontWeight: clip.style?.fontWeight, fontSize: `clamp(10px, ${Math.max(1, (clip.style?.fontSize ?? 48) / 34)}vw, ${clip.style?.fontSize ?? 48}px)`, textAlign: clip.style?.align, textTransform: clip.style?.uppercase ? "uppercase" : undefined, letterSpacing: clip.style?.letterSpacing, lineHeight: clip.style?.lineHeight ?? 1.02, WebkitTextStroke: clip.style?.strokeWidth ? `${Math.max(.5, clip.style.strokeWidth / 5)}px ${clip.style.strokeColor ?? "#000"}` : undefined, textShadow: clip.style?.shadow ? `0 3px 12px ${clip.style?.strokeColor ?? "#000"}` : undefined }}>{text}</div>}
      {presentation.overlay && <div className="pointer-events-none absolute inset-0" style={{ background: presentation.overlay, opacity: presentation.overlayOpacity, mixBlendMode: presentation.overlay.startsWith("#") ? "screen" : "normal" }} />}
      {selected && <div className={`pointer-events-none absolute -inset-1 border ${primary ? "border-primary" : "border-primary/55"}`}><span className="absolute -left-1.5 -top-1.5 size-3 rounded-[3px] border border-primary bg-white" /><span className="absolute -right-1.5 -top-1.5 size-3 rounded-[3px] border border-primary bg-white" /><span className="absolute -bottom-1.5 -left-1.5 size-3 rounded-[3px] border border-primary bg-white" /></div>}
      {primary && <><button type="button" onPointerDown={onResize} onKeyDown={(event) => { const step = event.shiftKey ? 5 : 1; if (event.key === "ArrowRight") onKeyboardTransform({ ...transform, width: transform.width + step }); else if (event.key === "ArrowDown") onKeyboardTransform({ ...transform, height: transform.height + step }); else if (event.key === "ArrowLeft") onKeyboardTransform({ ...transform, width: Math.max(8, transform.width - step) }); else if (event.key === "ArrowUp") onKeyboardTransform({ ...transform, height: Math.max(6, transform.height - step) }); else return; event.preventDefault(); event.stopPropagation(); }} aria-label={`Redimensionar ${clip.name}`} className="absolute -bottom-2 -right-2 z-10 size-4 cursor-nwse-resize rounded-[4px] border border-primary bg-white shadow" /><button type="button" onPointerDown={onRotate} onKeyDown={(event) => { const step = event.shiftKey ? 15 : 1; if (event.key === "ArrowLeft") onKeyboardTransform({ ...transform, rotation: transform.rotation - step }); else if (event.key === "ArrowRight") onKeyboardTransform({ ...transform, rotation: transform.rotation + step }); else return; event.preventDefault(); event.stopPropagation(); }} aria-label={`Girar ${clip.name}`} className="absolute -top-7 left-1/2 z-10 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-primary text-white focus-visible:ring-2 focus-visible:ring-white"><RotateCw className="size-3" /></button></>}
    </div>
  );
}

function CaptionVisual({ clip, cue, preset, currentTime }: { clip: Clip; cue: CaptionCue; preset: Record<string, unknown>; currentTime: number }) {
  const mode = String(preset["mode"] ?? "line");
  const activeColor = String(preset["activeWordColor"] ?? "#a990ff");
  const inactiveOpacity = Number(preset["inactiveWordOpacity"] ?? 1);
  const motion = String(preset["motion"] ?? "none");
  const words = cue.words?.length ? cue.words : [{ id: `${cue.id}-line`, text: cue.text, start: cue.start, end: cue.end }];
  const activeIndex = Math.max(0, words.findIndex((word) => currentTime >= Number(word.start) && currentTime < Number(word.end)));
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return <div data-caption-cue-id={cue.id} className="flex h-full w-full items-center justify-center px-3 text-center motion-reduce:transition-none" style={{ color: clip.style?.color, background: clip.style?.backgroundColor, borderRadius: clip.style?.borderRadius, fontFamily: clip.style?.fontFamily, fontWeight: clip.style?.fontWeight, fontSize: `clamp(10px, ${Math.max(1, (clip.style?.fontSize ?? 42) / 34)}vw, ${clip.style?.fontSize ?? 42}px)`, textAlign: clip.style?.align, textTransform: clip.style?.uppercase ? "uppercase" : undefined, lineHeight: clip.style?.lineHeight ?? 1.02, WebkitTextStroke: clip.style?.strokeWidth ? `${Math.max(.5, clip.style.strokeWidth / 5)}px ${clip.style.strokeColor ?? "#000"}` : undefined, textShadow: clip.style?.shadow ? `0 2px 10px ${clip.style.strokeColor ?? "#000"}` : undefined }}>
    <span>{words.map((word, index) => {
      if (mode === "line") return <span key={word.id}>{word.text}</span>;
      const active = index === activeIndex;
      const frame = captionWordMotionFrame(reducedMotion ? "none" : motion, currentTime, Number(word.start), Number(word.end), index, active);
      const boxed = active && clip.style?.highlight === "box";
      return <span key={word.id} data-caption-word-active={active ? "true" : "false"} className="transition-[color,opacity,transform,filter] duration-150 motion-reduce:transition-none" style={{ color: active && !boxed ? activeColor : clip.style?.color, opacity: (active ? 1 : inactiveOpacity) * frame.opacity, transform: `translate(${frame.translateX}em, ${frame.translateY}em) scale(${frame.scale})`, filter: frame.glow ? `drop-shadow(0 0 ${Math.round(5 + frame.glow * 7)}px ${activeColor})` : undefined, textDecoration: active && clip.style?.highlight === "underline" ? "underline" : undefined, textDecorationColor: activeColor, textDecorationThickness: active && clip.style?.highlight === "underline" ? ".1em" : undefined, textUnderlineOffset: active && clip.style?.highlight === "underline" ? ".12em" : undefined, background: boxed ? activeColor : undefined, borderRadius: 4, padding: boxed ? "0 4px" : undefined, display: "inline-block" }}>{word.text}{index < words.length - 1 ? " " : ""}</span>;
    })}</span>
  </div>;
}

function MediaVisual({ clip, url, currentTime, playing, drivesPlaybackClock, onPlaybackTime }: { clip: Clip; url: string; currentTime: number; playing: boolean; drivesPlaybackClock: boolean; onPlaybackTime: (time: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const sourceTime = projectToSourceTime(clip, asProjectTime(currentTime)) ?? clip.sourceIn;
  const mediaTransform = `scaleX(${clip.flipHorizontal ? -1 : 1}) scaleY(${clip.flipVertical ? -1 : 1})`;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.playbackRate = Math.max(0.05, Math.min(4, clip.playbackRate));
  }, [clip.playbackRate]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (Math.abs(video.currentTime - sourceTime) > (clip.reversed ? 1 / 60 : 0.12)) video.currentTime = sourceTime;
  }, [clip.reversed, sourceTime]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing && !clip.reversed) void video.play().catch(() => undefined); else video.pause();
  }, [clip.reversed, playing]);
  useEffect(() => {
    const video = ref.current;
    if (!video || !playing || clip.reversed || !drivesPlaybackClock) return;
    const report = () => {
      const projectTime = sourceToProjectTime(clip, video.currentTime);
      if (projectTime !== null) onPlaybackTime(Number(projectTime));
    };
    if (video.requestVideoFrameCallback) {
      let handle = 0;
      const frame = () => { report(); handle = video.requestVideoFrameCallback(frame); };
      handle = video.requestVideoFrameCallback(frame);
      return () => video.cancelVideoFrameCallback?.(handle);
    }
    video.addEventListener("timeupdate", report);
    return () => video.removeEventListener("timeupdate", report);
  }, [clip, drivesPlaybackClock, onPlaybackTime, playing]);
  if (clip.kind === "image") return <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" style={{ transform: mediaTransform }} />;
  return <video ref={ref} src={url} muted playsInline preload="auto" className="pointer-events-none h-full w-full object-cover" style={{ transform: mediaTransform }} />;
}

function snapTransform(transform: ClipTransform): ClipTransform {
  const snap = (value: number) => [5, 50, 95].find((point) => Math.abs(point - value) <= 1.4) ?? value;
  return { ...transform, x: Math.max(0, Math.min(100, snap(transform.x))), y: Math.max(0, Math.min(100, snap(transform.y))), width: Math.min(100, transform.width), height: Math.min(100, transform.height) };
}
