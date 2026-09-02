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
}: {
  layer: TemplateLayer;
  duration: number;
  selected: boolean;
  onSelect: () => void;
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
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ left: `${left}%`, width: `${width}%` }}
      className={`absolute top-1 h-7 truncate rounded-md border px-2 text-left text-[11px] ${tone} ${
        selected ? "border-primary ring-1 ring-primary" : "border-white/10"
      } ${layer.visible ? "" : "opacity-40"}`}
    >
      {layer.name}
    </button>
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
          Dividir no playhead
        </button>
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
                  />
                </div>
              </div>
            ))}
            {!ordered.length && (
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
