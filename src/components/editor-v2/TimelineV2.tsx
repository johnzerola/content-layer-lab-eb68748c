import { useEffect, useMemo, useRef, useState } from "react";
import { Captions, ChevronDown, Copy, Eye, EyeOff, Film, FlipHorizontal2, FlipVertical2, Gauge, Group, Headphones, Image, Layers3, Lock, Magnet, Music2, Pause, Play, Rewind, RotateCcw, Scissors, Sparkles, Timer, Trash2, Ungroup, Unlock, Volume2, VolumeX, Waves } from "lucide-react";
import { formatProjectTime, isTrackCompatible, snapProjectTime, visibleTimelineRange, type AnimatableProperty, type Clip, type EditorProjectV2, type Track, type TrackKind } from "@/lib/editor-v2";

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
  onRemoveSilence: (options: { threshold: number; minSilence: number; padding: number }) => void;
  removingSilence: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onTogglePlayback: () => void;
  onSkip: (seconds: number) => void;
  onBatchSpeed: (speed: number) => void;
  onBatchToggleReverse: () => void;
  onBatchToggleFlip: (axis: "horizontal" | "vertical") => void;
  onCreateCompound: () => void;
  onDissolveCompound: () => void;
  onAddTrack: (kind: Exclude<TrackKind, "video" | "captions">) => void;
  onToggleSnap: () => void;
  onToggleRipple: () => void;
  onTrackPatch: (trackId: string, patch: Partial<Pick<Track, "muted" | "solo" | "gain" | "hidden" | "locked">>) => void;
  onDropLibraryItem: (id: string, at: number) => void;
  onSelectTransition: (transitionId: string) => void;
  onResizeTransition: (transitionId: string, duration: number) => void;
  onEditEffectRange: (clipId: string, effectId: string, start: number, end: number) => void;
}

type Draft = { id: string; mode: "move" | "trim-start" | "trim-end"; start: number; end: number; targetTrackId: string; compatible: boolean };
const TRACK_LABEL_WIDTH = 136;
const TRACK_HEIGHT = 48;
const RULER_HEIGHT = 28;

export function TimelineV2(props: TimelineProps) {
  const { project, currentTime, playing, zoom, assetThumbnails, assetWaveforms, onZoom, onSeek, onSelect, onMove, onTrim, onMoveKeyframe, onSplit, onAutoSplit, onRemoveSilence, removingSilence, onDuplicate, onDelete, onTogglePlayback, onSkip, onBatchSpeed, onBatchToggleReverse, onBatchToggleFlip, onCreateCompound, onDissolveCompound, onAddTrack, onToggleSnap, onToggleRipple, onTrackPatch, onDropLibraryItem, onSelectTransition, onResizeTransition, onEditEffectRange } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [autoCutOpen, setAutoCutOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [transitionDraft, setTransitionDraft] = useState<{ id: string; duration: number } | null>(null);
  const [effectDraft, setEffectDraft] = useState<{ id: string; start: number; end: number } | null>(null);
  const [autoCutInterval, setAutoCutInterval] = useState(2);
  const [autoCutMode, setAutoCutMode] = useState<"interval" | "silence">("interval");
  const [silencePreset, setSilencePreset] = useState<"natural" | "tight">("natural");
  const [viewport, setViewport] = useState({ scrollLeft: 0, width: 1200 });
  const pxPerSecond = 52 * zoom;
  const width = Math.max(900, project.settings.duration * pxPerSecond + 120);
  const visible = visibleTimelineRange(viewport.scrollLeft, viewport.width, TRACK_LABEL_WIDTH, pxPerSecond);
  const ticks = useMemo(() => Array.from({ length: Math.ceil(project.settings.duration) + 1 }, (_, index) => index), [project.settings.duration]).filter((tick) => tick >= visible.start - 1 && tick <= visible.end + 1);
  const selectedClips = project.tracks.flatMap((track) => track.clips).filter((clip) => project.selection.itemIds.includes(clip.id));
  const selectedCompoundIds = [...new Set(selectedClips.map((clip) => clip.metadata?.["compoundGroupId"]).filter((id): id is string => typeof id === "string"))];

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

  const beginPlayheadGesture = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const update = (clientX: number) => onSeek(timeFromPointer(clientX));
    update(event.clientX);
    const move = (next: PointerEvent) => update(next.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const beginClipGesture = (event: React.PointerEvent, clip: Clip, mode: Draft["mode"]) => {
    event.preventDefault();
    event.stopPropagation();
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    onSelect(clip.id, additive);
    if (additive) return;
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

  const beginTransitionResize = (event: React.PointerEvent, transitionId: string, duration: number, side: "left" | "right") => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    let latest = duration;
    const move = (next: PointerEvent) => {
      const delta = (next.clientX - startX) / pxPerSecond * 2 * (side === "right" ? 1 : -1);
      latest = Math.max(.1, duration + delta);
      setTransitionDraft({ id: transitionId, duration: latest });
    };
    const up = () => {
      onResizeTransition(transitionId, latest);
      setTransitionDraft(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const beginEffectGesture = (event: React.PointerEvent, clip: Clip, effectId: string, mode: "move" | "start" | "end", initialStart: number, initialEnd: number) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(clip.id, false);
    const startX = event.clientX;
    const clipDuration = Number(clip.projectEnd) - Number(clip.projectStart);
    let latest = { id: effectId, start: initialStart, end: initialEnd };
    const move = (next: PointerEvent) => {
      const delta = (next.clientX - startX) / pxPerSecond;
      if (mode === "move") {
        const duration = initialEnd - initialStart;
        const start = Math.max(0, Math.min(clipDuration - duration, initialStart + delta));
        latest = { id: effectId, start, end: start + duration };
      } else if (mode === "start") latest = { id: effectId, start: Math.max(0, Math.min(initialEnd - .04, initialStart + delta)), end: initialEnd };
      else latest = { id: effectId, start: initialStart, end: Math.min(clipDuration, Math.max(initialStart + .04, initialEnd + delta)) };
      setEffectDraft(latest);
    };
    const up = () => {
      onEditEffectRange(clip.id, effectId, latest.start, latest.end);
      setEffectDraft(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  return (
    <section className="editor-v2-timeline flex h-full min-h-0 flex-col" aria-label="Timeline multitrack">
      <header className="editor-v2-timeline-toolbar flex h-11 shrink-0 items-center gap-1 px-2 sm:px-3">
        <div className="mr-1 flex items-center gap-0.5 rounded-lg border border-white/8 bg-black/20 p-0.5" role="group" aria-label="Controles de reprodução">
          <button type="button" onClick={() => onSkip(-5)} className="editor-icon-button size-7" aria-label="Voltar 5 segundos"><RotateCcw className="size-3.5" /></button>
          <button type="button" onClick={onTogglePlayback} className="editor-icon-button size-7 bg-primary/18 text-primary" aria-label={playing ? "Pausar" : "Reproduzir"}>{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
          <button type="button" onClick={() => onSkip(5)} className="editor-icon-button size-7" aria-label="Avançar 5 segundos"><RotateCcw className="size-3.5 scale-x-[-1]" /></button>
        </div>
        <button type="button" onClick={onSplit} className="editor-tool-button"><Scissors className="size-3.5" /><span className="hidden sm:inline">Dividir</span></button>
        <div className="relative">
          <button type="button" aria-label="Cortes automáticos" title="Cortar seleção por intervalo" onClick={() => setAutoCutOpen((open) => !open)} aria-expanded={autoCutOpen} className={`editor-tool-button ${autoCutOpen ? "text-primary" : ""}`}><Timer className="size-3.5" /><span className="hidden xl:inline">Cortes automáticos</span></button>
          {autoCutOpen && <form onSubmit={(event) => { event.preventDefault(); if (autoCutMode === "interval") onAutoSplit(autoCutInterval); else onRemoveSilence(silencePreset === "natural" ? { threshold: .06, minSilence: .35, padding: .1 } : { threshold: .11, minSilence: .22, padding: .06 }); if (!removingSilence) setAutoCutOpen(false); }} className="editor-auto-cut-popover absolute left-0 top-9 z-50 w-72 rounded-xl border border-white/10 p-3 shadow-2xl">
            <p className="text-[11px] font-semibold text-foreground">Cortes automáticos</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-black/20 p-1" role="tablist" aria-label="Tipo de corte automático"><button type="button" role="tab" aria-selected={autoCutMode === "interval"} onClick={() => setAutoCutMode("interval")} className={`h-8 rounded-md text-[9px] font-semibold ${autoCutMode === "interval" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>Por intervalo</button><button type="button" role="tab" aria-selected={autoCutMode === "silence"} onClick={() => setAutoCutMode("silence")} className={`h-8 rounded-md text-[9px] font-semibold ${autoCutMode === "silence" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>Remover silêncios</button></div>
            {autoCutMode === "interval" ? <><p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">Divide todos os vídeos selecionados em partes iguais. Uma ação, um Ctrl+Z.</p><label className="mt-3 block text-[9px] text-muted-foreground">Intervalo em segundos<input autoFocus aria-label="Intervalo dos cortes automáticos em segundos" type="number" min="0.25" max="60" step="0.25" value={autoCutInterval} onChange={(event) => setAutoCutInterval(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-xs tabular-nums text-foreground" /></label><div className="mt-2 grid grid-cols-4 gap-1">{[1, 2, 3, 5].map((value) => <button key={value} type="button" onClick={() => setAutoCutInterval(value)} className={`h-7 rounded-md text-[9px] ${autoCutInterval === value ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}>{value}s</button>)}</div></> : <><p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">Analisa o áudio real, remove pausas e fecha os espaços automaticamente.</p><div className="mt-3 grid grid-cols-2 gap-1"><button type="button" onClick={() => setSilencePreset("natural")} className={`rounded-lg border p-2 text-left ${silencePreset === "natural" ? "border-primary/60 bg-primary/12" : "border-white/8 bg-white/[.025]"}`}><span className="block text-[9px] font-semibold text-foreground">Natural</span><span className="mt-0.5 block text-[8px] text-muted-foreground">Mantém respirações curtas</span></button><button type="button" onClick={() => setSilencePreset("tight")} className={`rounded-lg border p-2 text-left ${silencePreset === "tight" ? "border-primary/60 bg-primary/12" : "border-white/8 bg-white/[.025]"}`}><span className="block text-[9px] font-semibold text-foreground">Dinâmico</span><span className="mt-0.5 block text-[8px] text-muted-foreground">Shorts com ritmo rápido</span></button></div></>}
            <button type="submit" disabled={removingSilence} className="editor-primary-button mt-3 flex h-9 w-full items-center justify-center rounded-lg text-[10px] font-semibold text-white disabled:cursor-wait disabled:opacity-60">{removingSilence ? "Analisando áudio…" : autoCutMode === "interval" ? "Aplicar cortes" : "Remover pausas"}</button>
          </form>}
        </div>
        <button type="button" onClick={onDuplicate} className="editor-tool-button"><Copy className="size-3.5" /><span className="hidden sm:inline">Duplicar</span></button>
        <div className="relative">
          <button type="button" disabled={!project.selection.itemIds.length} onClick={() => setBatchOpen((open) => !open)} aria-expanded={batchOpen} className={`editor-tool-button disabled:cursor-not-allowed disabled:opacity-35 ${batchOpen ? "text-primary" : ""}`}><Gauge className="size-3.5" /><span className="hidden xl:inline">Ações</span>{project.selection.itemIds.length > 0 && <span className="rounded bg-primary/18 px-1.5 py-0.5 text-[8px] font-bold text-primary">{project.selection.itemIds.length}</span>}<ChevronDown className="size-3" /></button>
          {batchOpen && <div className="editor-auto-cut-popover absolute left-0 top-9 z-50 w-72 rounded-xl border border-white/10 p-3 shadow-2xl">
            <p className="text-[11px] font-semibold text-foreground">Editar {project.selection.itemIds.length} itens</p>
            <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Ctrl+clique adiciona ou remove trechos. Cada ação abaixo usa um único Ctrl+Z.</p>
            <p className="mt-3 text-[9px] font-semibold text-foreground">Velocidade dos vídeos</p>
            <div className="mt-1 grid grid-cols-4 gap-1">{[.5, .75, 1, 1.5].map((speed) => <button key={speed} type="button" onClick={() => { onBatchSpeed(speed); setBatchOpen(false); }} className="h-8 rounded-lg bg-white/5 text-[9px] font-semibold text-muted-foreground hover:bg-primary/15 hover:text-primary">{speed}×</button>)}</div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button type="button" onClick={() => { onBatchToggleReverse(); setBatchOpen(false); }} className="editor-tool-button justify-center"><Rewind className="size-3.5" />Inverter</button>
              <button type="button" onClick={() => { onBatchToggleFlip("horizontal"); setBatchOpen(false); }} className="editor-tool-button justify-center"><FlipHorizontal2 className="size-3.5" />Horizontal</button>
              <button type="button" onClick={() => { onBatchToggleFlip("vertical"); setBatchOpen(false); }} className="editor-tool-button justify-center"><FlipVertical2 className="size-3.5" />Vertical</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 border-t border-white/8 pt-2">
              <button type="button" disabled={selectedClips.length < 2} onClick={() => { onCreateCompound(); setBatchOpen(false); }} className="editor-tool-button justify-center disabled:cursor-not-allowed disabled:opacity-35"><Group className="size-3.5" />Criar composto</button>
              <button type="button" disabled={selectedCompoundIds.length !== 1} onClick={() => { onDissolveCompound(); setBatchOpen(false); }} className="editor-tool-button justify-center disabled:cursor-not-allowed disabled:opacity-35"><Ungroup className="size-3.5" />Desagrupar</button>
            </div>
          </div>}
        </div>
        <button type="button" onClick={onDelete} disabled={!project.selection.itemIds.length} className="editor-tool-button text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30" aria-label="Excluir itens selecionados"><Trash2 className="size-3.5" /><span className="hidden xl:inline">Excluir</span></button>
        <span className="mx-1 h-5 w-px bg-white/8" />
        <button type="button" onClick={onToggleSnap} aria-pressed={project.settings.snapEnabled} className={`editor-tool-button ${project.settings.snapEnabled ? "text-primary" : ""}`}><Magnet className="size-3.5" /><span className="hidden md:inline">Ajuste</span></button>
        <button type="button" onClick={onToggleRipple} aria-pressed={project.settings.rippleEnabled} className={`editor-tool-button ${project.settings.rippleEnabled ? "text-primary" : ""}`}><Waves className="size-3.5" /><span className="hidden md:inline">Ripple</span></button>
        <div className="relative">
          <button type="button" onClick={() => setLayerOpen((open) => !open)} aria-expanded={layerOpen} className={`editor-tool-button ${layerOpen ? "text-primary" : ""}`}><Layers3 className="size-3.5" /><span className="hidden xl:inline">Camada</span><ChevronDown className="size-3" /></button>
          {layerOpen && <div className="editor-auto-cut-popover absolute right-0 top-9 z-50 w-56 rounded-xl border border-white/10 p-2 shadow-2xl"><p className="px-2 pb-1 text-[9px] font-semibold text-foreground">Adicionar camada</p>{([['overlay','Sobreposição'],['voice','Voz'],['music','Música'],['sfx','Efeito sonoro']] as const).map(([kind, label]) => <button key={kind} type="button" onClick={() => { onAddTrack(kind); setLayerOpen(false); }} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[9px] text-muted-foreground hover:bg-primary/12 hover:text-primary"><TrackIcon kind={kind} />{label}</button>)}</div>}
        </div>
        <div className="ml-auto flex items-center gap-2"><label htmlFor="timeline-zoom" className="text-[10px] text-muted-foreground">Zoom</label><input id="timeline-zoom" aria-label="Zoom da timeline" type="range" min="0.55" max="3" step="0.05" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} className="w-20 accent-violet-500 sm:w-32" /><span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span></div>
      </header>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto vaiviral-scrollbar" onScroll={(event) => setViewport({ scrollLeft: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-vaiviral-library-item"); if (id) onDropLibraryItem(id, timeFromPointer(event.clientX)); }}>
        <div className="relative min-h-full" style={{ width: width + TRACK_LABEL_WIDTH }}>
          <div className="editor-v2-ruler sticky top-0 z-30 flex h-7 backdrop-blur">
            <div className="sticky left-0 z-40 flex shrink-0 items-center border-r border-white/8 bg-[oklch(0.105_0.012_270)] px-3 text-[9px] font-medium text-muted-foreground" style={{ width: TRACK_LABEL_WIDTH }}>{formatProjectTime(currentTime)}</div>
            <div className="relative cursor-ew-resize touch-none" style={{ width }} onPointerDown={beginPlayheadGesture}>{ticks.map((tick) => <span key={tick} className="pointer-events-none absolute bottom-0 h-2 border-l border-white/18 text-[8px] tabular-nums text-muted-foreground" style={{ left: tick * pxPerSecond }}><span className="absolute left-1 top-[-10px]">{tick % 5 === 0 ? formatProjectTime(tick).slice(0, 5) : ""}</span></span>)}</div>
          </div>
          {project.tracks.map((track) => {
            const target = draft?.targetTrackId === track.id;
            return <div key={track.id} data-track-id={track.id} data-track-kind={track.kind} className={`editor-v2-track group/track flex ${target ? draft.compatible ? "bg-primary/[0.07]" : "bg-destructive/[0.08]" : ""}`} style={{ height: TRACK_HEIGHT }}>
              <div className="editor-v2-track-label sticky left-0 z-20 flex shrink-0 items-center gap-1.5 px-2" style={{ width: TRACK_LABEL_WIDTH }}><TrackIcon kind={track.kind} /><span className="min-w-0 flex-1 truncate text-[10px] font-medium">{track.name}</span>{(track.kind === "voice" || track.kind === "music" || track.kind === "sfx") && <TrackButton label={track.solo ? `Desativar solo de ${track.name}` : `Ouvir somente ${track.name}`} active={track.solo} onClick={() => onTrackPatch(track.id, { solo: !track.solo })}><Headphones /></TrackButton>}<TrackButton label={track.muted ? `Ativar som de ${track.name}` : `Silenciar ${track.name}`} active={track.muted} onClick={() => onTrackPatch(track.id, { muted: !track.muted })}>{track.muted ? <VolumeX /> : <Volume2 />}</TrackButton><TrackButton label={track.hidden ? `Mostrar ${track.name}` : `Ocultar ${track.name}`} active={track.hidden} onClick={() => onTrackPatch(track.id, { hidden: !track.hidden })}>{track.hidden ? <EyeOff /> : <Eye />}</TrackButton><TrackButton label={track.locked ? `Desbloquear ${track.name}` : `Bloquear ${track.name}`} active={track.locked} onClick={() => onTrackPatch(track.id, { locked: !track.locked })}>{track.locked ? <Lock /> : <Unlock />}</TrackButton></div>
              <div className="relative bg-black/5" style={{ width }} onPointerDown={beginPlayheadGesture}>
                {track.clips.filter((clip) => Number(clip.projectEnd) >= visible.start && Number(clip.projectStart) <= visible.end).map((clip) => {
                  const value = draft?.id === clip.id ? draft : { start: Number(clip.projectStart), end: Number(clip.projectEnd) };
                  const selected = project.selection.itemIds.includes(clip.id);
                  const thumbnail = clip.assetId ? assetThumbnails[clip.assetId] : undefined;
                  const badges = [clip.metadata?.["compoundGroupId"] ? "COMPOSTO" : "", Math.abs(clip.playbackRate - 1) > .001 ? `${clip.playbackRate.toFixed(2).replace(/0$/, "")}×` : "", clip.reversed ? "REV" : "", clip.flipHorizontal ? "↔" : "", clip.flipVertical ? "↕" : ""].filter(Boolean);
                  return <div key={clip.id} data-clip-id={clip.id} data-clip-kind={clip.kind} role="button" tabIndex={0} aria-label={`${clip.name}, de ${formatProjectTime(value.start)} até ${formatProjectTime(value.end)}`} aria-pressed={selected} onPointerDown={(event) => beginClipGesture(event, clip, "move")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(clip.id, event.ctrlKey || event.metaKey || event.shiftKey); } }} className={`editor-v2-clip editor-v2-clip-${track.kind} absolute top-1.5 flex h-9 min-w-8 touch-none items-center overflow-hidden rounded-md px-2 text-[10px] font-medium text-white outline-none ring-inset transition-shadow focus-visible:ring-2 focus-visible:ring-white ${selected ? "is-selected ring-2 ring-white/80" : ""}`} style={{ left: value.start * pxPerSecond, width: Math.max(24, (value.end - value.start) * pxPerSecond), ...(thumbnail ? { backgroundImage: `linear-gradient(90deg,rgba(21,11,48,.28),rgba(21,11,48,.68)),url(${thumbnail})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" } : {}) }}>
                    {(track.kind === "voice" || track.kind === "music" || track.kind === "sfx") && <Waveform {...(clip.assetId && assetWaveforms[clip.assetId] ? { peaks: assetWaveforms[clip.assetId] } : {})} />}
                    <span className="relative z-10 truncate drop-shadow-sm">{clip.name}</span>
                    {badges.length > 0 && <span className="relative z-10 ml-auto flex shrink-0 gap-0.5 pl-1" aria-label={badges.join(", ")}>{badges.map((badge) => <i key={badge} className="rounded bg-black/45 px-1 py-0.5 text-[7px] not-italic font-bold tracking-wide text-white/90">{badge}</i>)}</span>}
                    {clip.effects.map((effect) => {
                      const clipDuration = Number(clip.projectEnd) - Number(clip.projectStart);
                      const start = effectDraft?.id === effect.id ? effectDraft.start : Math.max(0, Number(effect.parameters["start"] ?? 0));
                      const end = effectDraft?.id === effect.id ? effectDraft.end : Math.min(clipDuration, Number(effect.parameters["end"] ?? clipDuration));
                      return <div key={effect.id} data-effect-id={effect.id} title={`${effect.definitionId} · arraste para mover; use as bordas para ajustar`} onPointerDown={(event) => beginEffectGesture(event, clip, effect.id, "move", start, end)} className={`absolute bottom-0 z-30 h-2 min-w-3 cursor-grab rounded-t border-x border-t border-cyan-100/70 ${effect.enabled ? "bg-cyan-400/90 shadow-[0_0_9px_rgba(34,211,238,.55)]" : "bg-slate-500/70"}`} style={{ left: start * pxPerSecond, width: Math.max(12, (end - start) * pxPerSecond) }}><button type="button" aria-label={`Ajustar início de ${effect.definitionId}`} onPointerDown={(event) => beginEffectGesture(event, clip, effect.id, "start", start, end)} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/15 hover:bg-white/50" /><button type="button" aria-label={`Ajustar fim de ${effect.definitionId}`} onPointerDown={(event) => beginEffectGesture(event, clip, effect.id, "end", start, end)} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/15 hover:bg-white/50" /></div>;
                    })}
                    {selected && clip.animations.flatMap((animation) => animation.keyframes.map((keyframe) => <button key={`${animation.property}-${keyframe.id}`} type="button" data-keyframe-id={keyframe.id} aria-label={`${animation.property} em ${formatProjectTime(Number(clip.projectStart) + Number(keyframe.time))}`} onPointerDown={(event) => beginKeyframeGesture(event, clip, animation.property, keyframe.id, Number(keyframe.time))} onClick={(event) => { event.stopPropagation(); onSeek(Number(clip.projectStart) + Number(keyframe.time)); }} className="absolute top-1/2 z-30 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-white bg-primary shadow-[0_0_0_2px_rgba(8,8,15,.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ left: Number(keyframe.time) * pxPerSecond }} />))}
                    {!track.locked && <><button type="button" aria-label={`Aparar início de ${clip.name}`} onPointerDown={(event) => beginClipGesture(event, clip, "trim-start")} className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30 focus-visible:bg-white/35" /><button type="button" aria-label={`Aparar fim de ${clip.name}`} onPointerDown={(event) => beginClipGesture(event, clip, "trim-end")} className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30 focus-visible:bg-white/35" /></>}
                  </div>;
                })}
                {project.transitions.filter((transition) => track.clips.some((clip) => clip.id === transition.fromClipId)).map((transition) => {
                  const from = track.clips.find((clip) => clip.id === transition.fromClipId);
                  if (!from) return null;
                  const duration = transitionDraft?.id === transition.id ? transitionDraft.duration : transition.duration;
                  const transitionWidth = Math.max(20, duration * pxPerSecond);
                  return <div key={transition.id} data-transition-id={transition.id} role="button" tabIndex={0} aria-label={`Transição ${transition.definitionId}, ${duration.toFixed(2)} segundos`} title={`${transition.definitionId} · arraste as bordas para ajustar`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelectTransition(transition.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectTransition(transition.id); } }} className="absolute top-1/2 z-30 flex h-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-md border border-fuchsia-200/70 bg-fuchsia-500/85 px-2 text-[8px] font-bold text-white shadow-[0_0_16px_rgba(217,70,239,.35)] backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ left: Number(from.projectEnd) * pxPerSecond, width: transitionWidth }}>
                    <button type="button" aria-label="Ajustar início da transição" onPointerDown={(event) => beginTransitionResize(event, transition.id, duration, "left")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-white/10 hover:bg-white/35" />
                    <span className="max-w-full truncate">{duration.toFixed(2)}s</span>
                    <button type="button" aria-label="Ajustar fim da transição" onPointerDown={(event) => beginTransitionResize(event, transition.id, duration, "right")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-white/10 hover:bg-white/35" />
                  </div>;
                })}
              </div>
            </div>;
          })}
          <button type="button" aria-label={`Mover agulha, posição ${formatProjectTime(currentTime)}`} onPointerDown={beginPlayheadGesture} className="absolute bottom-0 top-0 z-40 w-3 -translate-x-1/2 cursor-ew-resize touch-none bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" style={{ left: TRACK_LABEL_WIDTH + currentTime * pxPerSecond }}><span className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(124,92,255,.9)]" /><span className="pointer-events-none absolute -top-0.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-primary shadow-[0_0_12px_rgba(124,92,255,.8)]" /></button>
        </div>
      </div>
    </section>
  );
}

function TrackIcon({ kind }: { kind: EditorProjectV2["tracks"][number]["kind"] }) { const Icon = kind === "video" ? Film : kind === "captions" ? Captions : kind === "voice" ? Volume2 : kind === "music" || kind === "sfx" ? Music2 : kind === "overlay" ? Image : Sparkles; return <Icon className="size-3.5 shrink-0 text-muted-foreground" />; }
function TrackButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-label={label} aria-pressed={active} onPointerDown={(event) => event.stopPropagation()} onClick={onClick} className={`grid size-5 shrink-0 place-items-center rounded [&>svg]:size-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${active ? "bg-primary/20 text-primary" : "text-muted-foreground opacity-45 hover:bg-white/8 hover:opacity-100"}`}>{children}</button>; }
function Waveform({ peaks }: { peaks?: number[] }) { const values = peaks?.length ? peaks : Array.from({ length: 20 }, () => .08); return <span data-waveform-state={peaks?.length ? "ready" : "pending"} className="pointer-events-none absolute inset-x-1 bottom-1 top-1 flex items-center gap-px opacity-45" aria-hidden>{values.slice(0, 180).map((peak, index) => <i key={index} className="min-w-px flex-1 rounded-full bg-white" style={{ height: `${Math.max(8, Math.min(100, peak * 100))}%` }} />)}</span>; }
