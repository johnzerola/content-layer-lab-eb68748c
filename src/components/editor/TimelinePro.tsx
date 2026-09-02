/** Timeline multitrack: régua, playhead, tracks por layer, zoom e cortes. */
import { memo, useCallback, useRef } from "react";
import type { TemplateLayer } from "@/lib/video-template/types";
import type { TimeRange } from "@/lib/editor/transcript";

interface Props {
  duration: number;
  currentTime: number;
  zoom: number;
  layers: TemplateLayer[];
  selectedId: string | null;
  removed: TimeRange[];
  onSeek: (time: number) => void;
  onSelect: (id: string) => void;
  onZoom: (zoom: number) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onSplit: () => void;
  /** Move/redimensiona a camada na timeline (arraste do clipe ou das bordas). */
  onTrim?: (id: string, startTime: number, endTime: number) => void;
  /** Faixa base do vídeo importado. */
  media?: { name: string; segments: TimeRange[] } | null;
  /** corta o vídeo na agulha (playhead), criando dois trechos */
  onSplitMedia?: (() => void) | undefined;
  /** arrasta as bordas de um trecho do vídeo */
  onTrimSegment?: ((index: number, start: number, end: number) => void) | undefined;
  /** clique na emenda entre dois trechos: escolher a transição */
  onSegmentTransition?: ((index: number) => void) | undefined;
  /** rótulo da transição de cada emenda (índice i = entre trecho i e i+1) */
  segmentTransitions?: string[];
  /** keyframes de enquadramento (segundos) mostrados na régua */
  keyframes?: number[];
  /** adiciona keyframe no tempo atual */
  onAddKeyframe?: (() => void) | undefined;
}


function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const Clip = memo(function Clip({
  layer,
  duration,
  selected,
  onSelect,
  onTrim,
}: {
  layer: TemplateLayer;
  duration: number;
  selected: boolean;
  onSelect: () => void;
  onTrim?: ((id: string, startTime: number, endTime: number) => void) | undefined;
}) {
  const start = Math.max(0, layer.startTime);
  const end = layer.endTime ?? duration;
  const left = duration ? (start / duration) * 100 : 0;
  const width = duration ? Math.max(1, ((end - start) / duration) * 100) : 100;
  const tone =
    layer.type === "video"
      ? "bg-primary/40"
      : layer.type === "caption"
        ? "bg-[oklch(0.62_0.18_30)]/50"
        : layer.type === "text"
          ? "bg-[oklch(0.62_0.16_290)]/50"
          : "bg-[oklch(0.62_0.14_180)]/45";

  const drag = useCallback(
    (mode: "move" | "start" | "end") => (e: React.PointerEvent) => {
      if (!onTrim || layer.locked || !duration) return;
      e.stopPropagation();
      e.preventDefault();
      const rail = (e.currentTarget as HTMLElement).parentElement?.parentElement;
      const railWidth = rail?.getBoundingClientRect().width ?? 1;
      const originX = e.clientX;
      const s0 = start;
      const e0 = end;
      const move = (ev: PointerEvent) => {
        const delta = ((ev.clientX - originX) / railWidth) * duration;
        let ns = s0;
        let ne = e0;
        if (mode === "move") {
          const shift = Math.min(Math.max(delta, -s0), duration - e0);
          ns = s0 + shift;
          ne = e0 + shift;
        } else if (mode === "start") {
          ns = Math.min(Math.max(0, s0 + delta), e0 - 0.2);
        } else {
          ne = Math.max(Math.min(duration, e0 + delta), s0 + 0.2);
        }
        onTrim(layer.id, Number(ns.toFixed(3)), Number(ne.toFixed(3)));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [duration, end, layer.id, layer.locked, onTrim, start],
  );

  const hasAnim = Boolean(layer.animationIn || layer.animationOut || layer.animationLoop);

  return (
    <div
      style={{ left: `${left}%`, width: `${width}%` }}
      className={`absolute top-1 h-7 rounded-md border ${tone} ${
        selected ? "border-primary ring-1 ring-primary" : "border-white/10"
      } ${layer.visible ? "" : "opacity-40"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        onPointerDown={drag("move")}
        className="h-full w-full cursor-grab truncate px-3 text-left text-[11px] active:cursor-grabbing"
      >
        {hasAnim ? "✦ " : ""}
        {layer.name}
      </button>
      {onTrim && !layer.locked && (
        <>
          <span
            role="presentation"
            onPointerDown={drag("start")}
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-white/25"
          />
          <span
            role="presentation"
            onPointerDown={drag("end")}
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-white/25"
          />
        </>
      )}
    </div>
  );
});

export function TimelinePro({
  duration,
  currentTime,
  zoom,
  layers,
  selectedId,
  removed,
  onSeek,
  onSelect,
  onZoom,
  onToggleVisible,
  onToggleLock,
  onSplit,
  onTrim,
  media,
  onSplitMedia,
  onTrimSegment,
  onSegmentTransition,
  segmentTransitions = [],
  keyframes = [],
  onAddKeyframe,
}: Props) {

  const trackRef = useRef<HTMLDivElement | null>(null);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !duration) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const ticks = Math.min(14, Math.max(4, Math.round(duration / 10) || 4));
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="flex h-full flex-col border-t border-border/60 bg-card/40">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <span className="font-mono">{fmt(currentTime)}</span>
        <span className="text-muted-foreground">/ {fmt(duration)}</span>
        <button type="button" onClick={onSplit} className="rounded-md border border-border/60 px-2 py-1">
          Dividir camada
        </button>
        {onSplitMedia && (
          <button
            type="button"
            onClick={onSplitMedia}
            className="rounded-md border border-primary/60 px-2 py-1 text-primary"
            title="Corta o vídeo exatamente na agulha"
          >
            ✂ Cortar vídeo na agulha
          </button>
        )}
        {onAddKeyframe && (
          <button
            type="button"
            onClick={onAddKeyframe}
            className="rounded-md border border-border/60 px-2 py-1"
            title="Grava o enquadramento atual como keyframe"
          >
            ◆ Keyframe
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            aria-label="Zoom da timeline"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
          <div
            className="relative h-6 cursor-pointer border-b border-border/50 text-[10px] text-muted-foreground"
            onPointerDown={(e) => seekFromEvent(e.clientX)}
          >
            {Array.from({ length: ticks + 1 }, (_, i) => (
              <span
                key={i}
                className="absolute top-1 -translate-x-1/2 font-mono"
                style={{ left: `${(i / ticks) * 100}%` }}
              >
                {fmt((duration * i) / ticks)}
              </span>
            ))}
            {keyframes.map((t, i) => (
              <button
                key={`k${i}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(t);
                }}
                aria-label={`Ir para o keyframe ${fmt(t)}`}
                className="absolute bottom-0 h-2 w-2 -translate-x-1/2 rotate-45 bg-amber-400"
                style={{ left: `${duration ? (t / duration) * 100 : 0}%` }}
              />
            ))}
          </div>

          <div className="relative" ref={trackRef} onPointerDown={(e) => seekFromEvent(e.clientX)}>
            {removed.map((r, i) => (
              <div
                key={i}
                className="pointer-events-none absolute top-0 z-10 h-full bg-destructive/20"
                style={{
                  left: `${duration ? (r.start / duration) * 100 : 0}%`,
                  width: `${duration ? ((r.end - r.start) / duration) * 100 : 0}%`,
                }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-0 z-20 h-full w-px bg-primary"
              style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
            {media && (
              <div className="relative h-9 border-b border-border/30">
                <div className="absolute left-0 top-0 z-20 flex h-full w-28 items-center gap-1 bg-card/80 px-2 text-[11px]">
                  <span className="truncate">vídeo</span>
                </div>
                <div className="absolute inset-y-0 left-28 right-0">
                  {(media.segments.length ? media.segments : [{ start: 0, end: duration }]).map((s, i, arr) => {
                    const left = duration ? (s.start / duration) * 100 : 0;
                    const width = duration ? Math.max(1, ((s.end - s.start) / duration) * 100) : 100;
                    const dragEdge = (edge: "start" | "end") => (ev: React.PointerEvent) => {
                      if (!onTrimSegment || !duration || !media.segments.length) return;
                      ev.stopPropagation();
                      ev.preventDefault();
                      const rail = (ev.currentTarget as HTMLElement).parentElement?.parentElement;
                      const railWidth = rail?.getBoundingClientRect().width ?? 1;
                      const originX = ev.clientX;
                      const s0 = s.start;
                      const e0 = s.end;
                      const move = (m: PointerEvent) => {
                        const delta = ((m.clientX - originX) / railWidth) * duration;
                        if (edge === "start") {
                          onTrimSegment(i, Math.min(Math.max(0, s0 + delta), e0 - 0.2), e0);
                        } else {
                          onTrimSegment(i, s0, Math.max(Math.min(duration, e0 + delta), s0 + 0.2));
                        }
                      };
                      const up = () => {
                        window.removeEventListener("pointermove", move);
                        window.removeEventListener("pointerup", up);
                      };
                      window.addEventListener("pointermove", move);
                      window.addEventListener("pointerup", up);
                    };
                    return (
                      <div key={i} className="contents">
                        <div
                          className="absolute top-1 h-7 truncate rounded-md border border-primary/40 bg-primary/30 px-3 text-[11px] leading-7"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          {media.name}
                          {onTrimSegment && media.segments.length > 0 && (
                            <>
                              <span
                                role="presentation"
                                onPointerDown={dragEdge("start")}
                                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-white/25"
                              />
                              <span
                                role="presentation"
                                onPointerDown={dragEdge("end")}
                                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-white/25"
                              />
                            </>
                          )}
                        </div>
                        {i < arr.length - 1 && onSegmentTransition && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onSegmentTransition(i);
                            }}
                            title="Transição desta emenda"
                            className="absolute top-0 z-30 -translate-x-1/2 rounded-full border border-amber-400/70 bg-background px-1.5 text-[9px] font-medium text-amber-300"
                            style={{ left: `${duration ? (s.end / duration) * 100 : 0}%` }}
                          >
                            {segmentTransitions[i] ?? "⇄"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {ordered.map((layer) => (

              <div key={layer.id} className="relative h-9 border-b border-border/30">
                <div className="absolute left-0 top-0 z-20 flex h-full w-28 items-center gap-1 bg-card/80 px-2 text-[11px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisible(layer.id);
                    }}
                    aria-label={`Alternar visibilidade de ${layer.name}`}
                  >
                    {layer.visible ? "👁" : "🚫"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(layer.id);
                    }}
                    aria-label={`Travar ${layer.name}`}
                  >
                    {layer.locked ? "🔒" : "🔓"}
                  </button>
                  <span className="truncate">{layer.type}</span>
                </div>
                <div className="absolute inset-y-0 left-28 right-0">
                  <Clip
                    layer={layer}
                    duration={duration}
                    selected={layer.id === selectedId}
                    onSelect={() => onSelect(layer.id)}
                    onTrim={onTrim}
                  />
                </div>
              </div>
            ))}
            {!ordered.length && !media && (
              <p className="p-4 text-xs text-muted-foreground">
                Nenhuma camada ainda. Aplique um template ou adicione texto/mídia.
              </p>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
