import { useEffect, useMemo, useRef, useState } from "react";
import { Captions, Copy, Eye, EyeOff, Film, Headphones, Image, Lock, Magnet, Music2, Scissors, Sparkles, Timer, Unlock, Volume2, VolumeX, Waves } from "lucide-react";
import { formatProjectTime, isTrackCompatible, snapProjectTime, visibleTimelineRange, type AnimatableProperty, type Clip, type EditorProjectV2, type Track } from "@/lib/editor-v2";

interface TimelineProps {
  project: EditorProjectV2;
  currentTime: number;
  playing: boolean;
  zoom: number;
  assetThumbnails: Record<string, string>;
  assetWaveforms: Record<string, number[]>;
  onZoom: (value: number) => void;
  onSeek: (time: number) => void;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (clipId: string, trackId: string, start: number) => void;
  onTrim: (clipId: string, start: number, end: number) => void;
  onMoveKeyframe: (clipId: string, property: AnimatableProperty, keyframeId: string, localTime: number) => void;
  onSplit: () => void;
  onAutoSplit: (interval: number) => void;
  onDuplicate: () => void;
  onToggleSnap: () => void;
  onToggleRipple: () => void;
  onTrackPatch: (trackId: string, patch: Partial<Pick<Track, "muted" | "solo" | "gain" | "hidden" | "locked">>) => void;
  onDropLibraryItem: (id: string, at: number) => void;
}

type Draft = { id: string; mode: "move" | "trim-start" | "trim-end"; start: number; end: number; targetTrackId: string; compatible: boolean };
const TRACK_LABEL_WIDTH = 136;
const TRACK_HEIGHT = 48;
const RULER_HEIGHT = 28;

export function TimelineV2(props: TimelineProps) {
  const { project, currentTime, playing, zoom, assetThumbnails, assetWaveforms, onZoom, onSeek, onSelect, onMove, onTrim, onMoveKeyframe, onSplit, onAutoSplit, onDuplicate, onToggleSnap, onToggleRipple, onTrackPatch, onDropLibraryItem } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [autoCutOpen, setAutoCutOpen] = useState(false);
  const [autoCutInterval, setAutoCutInterval] = useState(2);
  const [viewport, setViewport] = useState({ scrollLeft: 0, width: 1200 });
  const pxPerSecond = 52 * zoom;
  const width = Math.max(900, project.settings.duration * pxPerSecond + 120);
  const visible = visibleTimelineRange(viewport.scrollLeft, viewport.width, TRACK_LABEL_WIDTH, pxPerSecond);
  const ticks = useMemo(() => Array.from({ length: Math.ceil(project.settings.duration) + 1 }, (_, index) => index), [project.settings.duration]).filter((tick) => tick >= visible.start - 1 && tick <= visible.end + 1);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setViewport({ scrollLeft: element.scrollLeft, width: element.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !playing) return;
    const playheadX = TRACK_LABEL_WIDTH + currentTime * pxPerSecond;
    const safeLeft = element.scrollLeft + TRACK_LABEL_WIDTH + 16;
    const safeRight = element.scrollLeft + element.clientWidth - 72;
    if (playheadX < safeLeft || playheadX > safeRight) {
      element.scrollTo({ left: Math.max(0, playheadX - element.clientWidth * 0.32), behavior: "auto" });
    }
  }, [currentTime, playing, pxPerSecond]);

  const timeFromPointer = (clientX: number) => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, (clientX - rect.left + scrollRef.current!.scrollLeft - TRACK_LABEL_WIDTH) / pxPerSecond);
  };
  const trackFromPointer = (clientY: number) => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return project.tracks[0]!;
    const index = Math.max(0, Math.min(project.tracks.length - 1, Math.floor((clientY - rect.top + scrollRef.current!.scrollTop - RULER_HEIGHT) / TRACK_HEIGHT)));
    return project.tracks[index]!;
  };

  const beginClipGesture = (event: React.PointerEvent, clip: Clip, mode: Draft["mode"]) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(clip.id, event.shiftKey);
    const pointerStart = timeFromPointer(event.clientX);
    const initialStart = Number(clip.projectStart);
    const initialEnd = Number(clip.projectEnd);
    let latest: Draft | null = null;
    const move = (next: PointerEvent) => {
      const delta = timeFromPointer(next.clientX) - pointerStart;
      const target = mode === "move" ? trackFromPointer(next.clientY) : project.tracks.find((track) => track.id === clip.trackId)!;
      const compatible = isTrackCompatible(clip, target) && !target.locked;
      if (mode === "move") {
        const duration = initialEnd - initialStart;
        const start = snapProjectTime(project, Math.max(0, initialStart + delta), clip.id);
        latest = { id: clip.id, mode, start, end: start + duration, targetTrackId: target.id, compatible };
      } else if (mode === "trim-start") {
        latest = { id: clip.id, mode, start: snapProjectTime(project, Math.min(initialEnd - 0.04, Math.max(0, initialStart + delta)), clip.id), end: initialEnd, targetTrackId: clip.trackId, compatible };
      } else {
        latest = { id: clip.id, mode, start: initialStart, end: snapProjectTime(project, Math.max(initialStart + 0.04, initialEnd + delta), clip.id), targetTrackId: clip.trackId, compatible };
      }
      setDraft(latest);
    };
    const up = () => {
      if (latest?.compatible) {
        if (latest.mode === "move") onMove(clip.id, latest.targetTrackId, latest.start);
        else onTrim(clip.id, latest.start, latest.end);
      }
      setDraft(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const beginKeyframeGesture = (event: React.PointerEvent, clip: Clip, property: AnimatableProperty, keyframeId: string, initialTime: number) => {
    event.preventDefault();
    event.stopPropagation();
    const pointerStart = timeFromPointer(event.clientX);
    let latest = initialTime;
    const move = (next: PointerEvent) => {
      latest = Math.max(0, Math.min(Number(clip.projectEnd) - Number(clip.projectStart), initialTime + timeFromPointer(next.clientX) - pointerStart));
    };
    const up = () => {
      onMoveKeyframe(clip.id, property, keyframeId, latest);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  return (
    <section className="editor-v2-timeline flex h-full min-h-0 flex-col" aria-label="Timeline multitrack">
      <header className="editor-v2-timeline-toolbar flex h-11 shrink-0 items-center gap-1 px-2 sm:px-3">
        <button type="button" onClick={onSplit} className="editor-tool-button"><Scissors className="size-3.5" /><span className="hidden sm:inline">Dividir</span></button>
        <div className="relative">
          <button type="button" aria-label="Cortes automáticos" title="Cortar seleção por intervalo" onClick={() => setAutoCutOpen((open) => !open)} aria-expanded={autoCutOpen} className={`editor-tool-button ${autoCutOpen ? "text-primary" : ""}`}><Timer className="size-3.5" /><span className="hidden xl:inline">Cortes automáticos</span></button>
          {autoCutOpen && <form onSubmit={(event) => { event.preventDefault(); onAutoSplit(autoCutInterval); setAutoCutOpen(false); }} className="editor-auto-cut-popover absolute left-0 top-9 z-50 w-64 rounded-xl border border-white/10 p-3 shadow-2xl">
            <p className="text-[11px] font-semibold text-foreground">Cortar por intervalo</p>
            <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Divide todos os vídeos selecionados em partes iguais. Uma ação, um Ctrl+Z.</p>
            <label className="mt-3 block text-[9px] text-muted-foreground">Intervalo em segundos<input autoFocus aria-label="Intervalo dos cortes automáticos em segundos" type="number" min="0.25" max="60" step="0.25" value={autoCutInterval} onChange={(event) => setAutoCutInterval(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-xs tabular-nums text-foreground" /></label>
            <div className="mt-2 grid grid-cols-4 gap-1">{[1, 2, 3, 5].map((value) => <button key={value} type="button" onClick={() => setAutoCutInterval(value)} className={`h-7 rounded-md text-[9px] ${autoCutInterval === value ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}>{value}s</button>)}</div>
            <button type="submit" className="editor-primary-button mt-3 h-8 w-full rounded-lg text-[10px] font-semibold text-white">Aplicar cortes</button>
          </form>}
        </div>
        <button type="button" onClick={onDuplicate} className="editor-tool-button"><Copy className="size-3.5" /><span className="hidden sm:inline">Duplicar</span></button>
        <span className="mx-1 h-5 w-px bg-white/8" />
        <button type="button" onClick={onToggleSnap} aria-pressed={project.settings.snapEnabled} className={`editor-tool-button ${project.settings.snapEnabled ? "text-primary" : ""}`}><Magnet className="size-3.5" /><span className="hidden md:inline">Ajuste</span></button>
        <button type="button" onClick={onToggleRipple} aria-pressed={project.settings.rippleEnabled} className={`editor-tool-button ${project.settings.rippleEnabled ? "text-primary" : ""}`}><Waves className="size-3.5" /><span className="hidden md:inline">Ripple</span></button>
        <div className="ml-auto flex items-center gap-2"><label htmlFor="timeline-zoom" className="text-[10px] text-muted-foreground">Zoom</label><input id="timeline-zoom" aria-label="Zoom da timeline" type="range" min="0.55" max="3" step="0.05" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} className="w-20 accent-violet-500 sm:w-32" /><span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span></div>
      </header>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto vaiviral-scrollbar" onScroll={(event) => setViewport({ scrollLeft: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-vaiviral-library-item"); if (id) onDropLibraryItem(id, timeFromPointer(event.clientX)); }}>
        <div className="relative min-h-full" style={{ width: width + TRACK_LABEL_WIDTH }}>
          <div className="editor-v2-ruler sticky top-0 z-30 flex h-7 backdrop-blur">
            <div className="sticky left-0 z-40 flex shrink-0 items-center border-r border-white/8 bg-[oklch(0.105_0.012_270)] px-3 text-[9px] font-medium text-muted-foreground" style={{ width: TRACK_LABEL_WIDTH }}>{formatProjectTime(currentTime)}</div>
            <div className="relative" style={{ width }} onPointerDown={(event) => onSeek(timeFromPointer(event.clientX))}>{ticks.map((tick) => <span key={tick} className="absolute bottom-0 h-2 border-l border-white/18 text-[8px] tabular-nums text-muted-foreground" style={{ left: tick * pxPerSecond }}><span className="absolute left-1 top-[-10px]">{tick % 5 === 0 ? formatProjectTime(tick).slice(0, 5) : ""}</span></span>)}</div>
          </div>
          {project.tracks.map((track) => {
            const target = draft?.targetTrackId === track.id;
            return <div key={track.id} data-track-id={track.id} data-track-kind={track.kind} className={`editor-v2-track group/track flex ${target ? draft.compatible ? "bg-primary/[0.07]" : "bg-destructive/[0.08]" : ""}`} style={{ height: TRACK_HEIGHT }}>
              <div className="editor-v2-track-label sticky left-0 z-20 flex shrink-0 items-center gap-1.5 px-2" style={{ width: TRACK_LABEL_WIDTH }}><TrackIcon kind={track.kind} /><span className="min-w-0 flex-1 truncate text-[10px] font-medium">{track.name}</span>{(track.kind === "voice" || track.kind === "music" || track.kind === "sfx") && <TrackButton label={track.solo ? `Desativar solo de ${track.name}` : `Ouvir somente ${track.name}`} active={track.solo} onClick={() => onTrackPatch(track.id, { solo: !track.solo })}><Headphones /></TrackButton>}<TrackButton label={track.muted ? `Ativar som de ${track.name}` : `Silenciar ${track.name}`} active={track.muted} onClick={() => onTrackPatch(track.id, { muted: !track.muted })}>{track.muted ? <VolumeX /> : <Volume2 />}</TrackButton><TrackButton label={track.hidden ? `Mostrar ${track.name}` : `Ocultar ${track.name}`} active={track.hidden} onClick={() => onTrackPatch(track.id, { hidden: !track.hidden })}>{track.hidden ? <EyeOff /> : <Eye />}</TrackButton><TrackButton label={track.locked ? `Desbloquear ${track.name}` : `Bloquear ${track.name}`} active={track.locked} onClick={() => onTrackPatch(track.id, { locked: !track.locked })}>{track.locked ? <Lock /> : <Unlock />}</TrackButton></div>
              <div className="relative bg-black/5" style={{ width }} onPointerDown={(event) => onSeek(timeFromPointer(event.clientX))}>
                {track.clips.filter((clip) => Number(clip.projectEnd) >= visible.start && Number(clip.projectStart) <= visible.end).map((clip) => {
                  const value = draft?.id === clip.id ? draft : { start: Number(clip.projectStart), end: Number(clip.projectEnd) };
                  const selected = project.selection.itemIds.includes(clip.id);
                  const thumbnail = clip.assetId ? assetThumbnails[clip.assetId] : undefined;
                  const badges = [Math.abs(clip.playbackRate - 1) > .001 ? `${clip.playbackRate.toFixed(2).replace(/0$/, "")}×` : "", clip.reversed ? "REV" : "", clip.flipHorizontal ? "↔" : "", clip.flipVertical ? "↕" : ""].filter(Boolean);
                  return <div key={clip.id} data-clip-id={clip.id} data-clip-kind={clip.kind} role="button" tabIndex={0} aria-label={`${clip.name}, de ${formatProjectTime(value.start)} até ${formatProjectTime(value.end)}`} aria-pressed={selected} onPointerDown={(event) => beginClipGesture(event, clip, "move")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(clip.id, event.shiftKey); } }} className={`editor-v2-clip editor-v2-clip-${track.kind} absolute top-1.5 flex h-9 min-w-8 touch-none items-center overflow-hidden rounded-md px-2 text-[10px] font-medium text-white outline-none ring-inset transition-shadow focus-visible:ring-2 focus-visible:ring-white ${selected ? "is-selected ring-2 ring-white/80" : ""}`} style={{ left: value.start * pxPerSecond, width: Math.max(24, (value.end - value.start) * pxPerSecond), ...(thumbnail ? { backgroundImage: `linear-gradient(90deg,rgba(21,11,48,.28),rgba(21,11,48,.68)),url(${thumbnail})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" } : {}) }}>
                    {(track.kind === "voice" || track.kind === "music" || track.kind === "sfx") && <Waveform {...(clip.assetId && assetWaveforms[clip.assetId] ? { peaks: assetWaveforms[clip.assetId] } : {})} />}
                    <span className="relative z-10 truncate drop-shadow-sm">{clip.name}</span>
                    {badges.length > 0 && <span className="relative z-10 ml-auto flex shrink-0 gap-0.5 pl-1" aria-label={badges.join(", ")}>{badges.map((badge) => <i key={badge} className="rounded bg-black/45 px-1 py-0.5 text-[7px] not-italic font-bold tracking-wide text-white/90">{badge}</i>)}</span>}
                    {selected && clip.animations.flatMap((animation) => animation.keyframes.map((keyframe) => <button key={`${animation.property}-${keyframe.id}`} type="button" data-keyframe-id={keyframe.id} aria-label={`${animation.property} em ${formatProjectTime(Number(clip.projectStart) + Number(keyframe.time))}`} onPointerDown={(event) => beginKeyframeGesture(event, clip, animation.property, keyframe.id, Number(keyframe.time))} onClick={(event) => { event.stopPropagation(); onSeek(Number(clip.projectStart) + Number(keyframe.time)); }} className="absolute top-1/2 z-30 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-white bg-primary shadow-[0_0_0_2px_rgba(8,8,15,.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ left: Number(keyframe.time) * pxPerSecond }} />))}
                    {!track.locked && <><button type="button" aria-label={`Aparar início de ${clip.name}`} onPointerDown={(event) => beginClipGesture(event, clip, "trim-start")} className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30 focus-visible:bg-white/35" /><button type="button" aria-label={`Aparar fim de ${clip.name}`} onPointerDown={(event) => beginClipGesture(event, clip, "trim-end")} className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30 focus-visible:bg-white/35" /></>}
                  </div>;
                })}
                {project.transitions.filter((transition) => track.clips.some((clip) => clip.id === transition.fromClipId)).map((transition) => { const from = track.clips.find((clip) => clip.id === transition.fromClipId); return from ? <span key={transition.id} data-transition-id={transition.id} role="img" aria-label={`Transição ${transition.definitionId}`} title={`${transition.definitionId} · ${transition.duration}s`} className="absolute top-1/2 z-20 grid size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 place-items-center rounded-[3px] border border-fuchsia-200 bg-fuchsia-500 shadow" style={{ left: Number(from.projectEnd) * pxPerSecond }}><span className="size-1.5 rounded-sm bg-white/80" /></span> : null; })}
              </div>
            </div>;
          })}
          <div className="pointer-events-none absolute bottom-0 top-0 z-40 w-px bg-white shadow-[0_0_0_1px_rgba(124,92,255,.9)]" style={{ left: TRACK_LABEL_WIDTH + currentTime * pxPerSecond }}><span className="absolute -top-0.5 -left-1.5 h-3 w-3 rotate-45 rounded-[2px] bg-primary" /></div>
        </div>
      </div>
    </section>
  );
}

function TrackIcon({ kind }: { kind: EditorProjectV2["tracks"][number]["kind"] }) { const Icon = kind === "video" ? Film : kind === "captions" ? Captions : kind === "voice" ? Volume2 : kind === "music" || kind === "sfx" ? Music2 : kind === "overlay" ? Image : Sparkles; return <Icon className="size-3.5 shrink-0 text-muted-foreground" />; }
function TrackButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-label={label} aria-pressed={active} onPointerDown={(event) => event.stopPropagation()} onClick={onClick} className={`grid size-5 shrink-0 place-items-center rounded [&>svg]:size-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${active ? "bg-primary/20 text-primary" : "text-muted-foreground opacity-45 hover:bg-white/8 hover:opacity-100"}`}>{children}</button>; }
function Waveform({ peaks }: { peaks?: number[] }) { const values = peaks?.length ? peaks : Array.from({ length: 20 }, () => .08); return <span data-waveform-state={peaks?.length ? "ready" : "pending"} className="pointer-events-none absolute inset-x-1 bottom-1 top-1 flex items-center gap-px opacity-45" aria-hidden>{values.slice(0, 180).map((peak, index) => <i key={index} className="min-w-px flex-1 rounded-full bg-white" style={{ height: `${Math.max(8, Math.min(100, peak * 100))}%` }} />)}</span>; }
