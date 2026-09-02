/** Canvas visual do editor de templates: renderiza as camadas em coordenadas relativas. */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { filterToCss } from "@/lib/video-template/factory";
import type { TemplateDoc, TemplateLayer } from "@/lib/video-template/types";

type Handle = "move" | "nw" | "ne" | "sw" | "se" | "rotate";

const SNAP = 1; // em % do canvas

function bgStyle(doc: TemplateDoc): React.CSSProperties {
  const bg = doc.canvas.background;
  switch (bg.kind) {
    case "color":
      return { background: bg.color };
    case "gradient":
      return { background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` };
    case "image":
      return bg.src ? { backgroundImage: `url(${bg.src})`, backgroundSize: "cover" } : { background: "#000" };
    default:
      return { background: "#000" };
  }
}

const LayerView = memo(function LayerView({
  layer,
  doc,
  sampleVideoUrl,
}: {
  layer: TemplateLayer;
  doc: TemplateDoc;
  sampleVideoUrl: string | null;
}) {
  const scale = doc.canvas.height / 100; // px por 1% de altura
  const common: React.CSSProperties = {
    width: "100%",
    height: "100%",
    filter: layer.filter ? filterToCss(layer.filter) : undefined,
  };

  if (layer.type === "text") {
    return (
      <div
        style={{
          ...common,
          display: "flex",
          alignItems: "center",
          justifyContent:
            layer.align === "left" ? "flex-start" : layer.align === "right" ? "flex-end" : "center",
          textAlign: layer.align,
          fontFamily: layer.fontFamily,
          fontWeight: layer.fontWeight,
          fontSize: `${(layer.fontSize / doc.canvas.height) * 100}cqh`,
          color: layer.color,
          letterSpacing: `${layer.letterSpacing / 20}em`,
          lineHeight: layer.lineHeight,
          textTransform: layer.uppercase ? "uppercase" : "none",
          fontStyle: layer.italic ? "italic" : "normal",
          textDecoration: layer.underline ? "underline" : "none",
          WebkitTextStroke: layer.strokeWidth ? `${layer.strokeWidth / 6}px ${layer.strokeColor}` : undefined,
          textShadow: layer.shadow ? "0 2px 12px rgba(0,0,0,.65)" : undefined,
          background: layer.background ?? "transparent",
          borderRadius: layer.radius / 4,
          padding: layer.padding / 6,
          overflow: "hidden",
        }}
      >
        <span>{layer.text}</span>
      </div>
    );
  }

  if (layer.type === "image") {
    return layer.src ? (
      <img
        src={layer.src}
        alt={layer.name}
        style={{ ...common, objectFit: layer.fit === "fill" ? "fill" : layer.fit, borderRadius: layer.radius / 4 }}
      />
    ) : (
      <div
        className="flex h-full w-full items-center justify-center border border-dashed border-border/70 bg-muted/20 text-[10px] text-muted-foreground"
        style={{ borderRadius: layer.radius / 4 }}
      >
        {layer.name}
      </div>
    );
  }

  if (layer.type === "video") {
    const src = layer.src ?? (layer.bindingType !== "STATIC" ? sampleVideoUrl : null);
    const radius = layer.mask === "circle" ? "50%" : `${layer.radius / 4}px`;
    return src ? (
      <video
        src={src}
        muted
        autoPlay
        loop={layer.loop}
        playsInline
        style={{
          ...common,
          objectFit: layer.fit === "fill" ? "fill" : layer.fit,
          borderRadius: radius,
          filter: `${layer.filter ? filterToCss(layer.filter) : ""} ${layer.backgroundBlur ? `blur(${layer.backgroundBlur}px)` : ""}`.trim() || undefined,
        }}
      />
    ) : (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-primary/50 bg-primary/10 text-[10px] text-primary"
        style={{ borderRadius: radius }}
      >
        <span className="font-mono uppercase">{layer.bindingType === "STATIC" ? "vídeo" : layer.bindingType}</span>
        <span className="text-muted-foreground">prévia dinâmica</span>
      </div>
    );
  }

  if (layer.type === "shape") {
    const radius = layer.shape === "circle" ? "50%" : layer.shape === "rounded" ? layer.radius / 4 : 0;
    return (
      <div
        style={{
          ...common,
          background: layer.fill,
          borderRadius: radius,
          border: layer.strokeWidth ? `${layer.strokeWidth / 4}px solid ${layer.stroke}` : undefined,
          height: layer.shape === "line" ? 2 : "100%",
        }}
      />
    );
  }

  // caption
  const s = layer.style;
  return (
    <div
      className="flex h-full w-full items-center"
      style={{
        justifyContent: s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center",
        background: s.background ?? "transparent",
        borderRadius: 8,
        outline: "1px dashed rgba(124,92,255,.55)",
      }}
    >
      <span
        style={{
          fontFamily: s.fontFamily,
          fontWeight: s.fontWeight,
          fontSize: `${(s.fontSize / doc.canvas.height) * 100}cqh`,
          color: s.color,
          textTransform: s.uppercase ? "uppercase" : "none",
          WebkitTextStroke: s.strokeWidth ? `${s.strokeWidth / 6}px ${s.strokeColor}` : undefined,
          textShadow: s.shadow ? "0 2px 10px rgba(0,0,0,.7)" : undefined,
        }}
      >
        Suas <span style={{ color: s.highlightColor }}>legendas</span> aqui
      </span>
      <span className="sr-only">{scale}</span>
    </div>
  );
});

export function EditorCanvas({
  doc,
  selectedId,
  onSelect,
  onChange,
  zoom,
  showGrid,
  showSafeArea,
  snap = true,
  interactive = true,
}: {
  doc: TemplateDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<TemplateLayer>) => void;
  zoom: number;
  showGrid?: boolean;
  showSafeArea?: boolean;
  snap?: boolean;
  interactive?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ axis: "x" | "y"; pos: number }[]>([]);

  const startDrag = useCallback(
    (layer: TemplateLayer, handle: Handle) => (e: React.PointerEvent) => {
      if (!interactive || layer.locked) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(layer.id);
      const box = wrapRef.current?.getBoundingClientRect();
      if (!box) return;
      const start = { mx: e.clientX, my: e.clientY, x: layer.x, y: layer.y, w: layer.width, h: layer.height, r: layer.rotation };

      const move = (ev: PointerEvent) => {
        const dx = ((ev.clientX - start.mx) / box.width) * 100;
        const dy = ((ev.clientY - start.my) / box.height) * 100;
        const g: { axis: "x" | "y"; pos: number }[] = [];
        if (handle === "move") {
          let x = start.x + dx;
          let y = start.y + dy;
          if (snap && !ev.altKey) {
            for (const t of [0, 50 - start.w / 2, 100 - start.w]) if (Math.abs(x - t) < SNAP) { x = t; g.push({ axis: "x", pos: t + start.w / 2 }); }
            for (const t of [0, 50 - start.h / 2, 100 - start.h]) if (Math.abs(y - t) < SNAP) { y = t; g.push({ axis: "y", pos: t + start.h / 2 }); }
          }
          onChange(layer.id, { x: round(x), y: round(y) });
        } else if (handle === "rotate") {
          onChange(layer.id, { rotation: round(start.r + dx * 3) });
        } else {
          const west = handle === "nw" || handle === "sw";
          const north = handle === "nw" || handle === "ne";
          const w = Math.max(2, west ? start.w - dx : start.w + dx);
          const h = Math.max(1, north ? start.h - dy : start.h + dy);
          const patch: Partial<TemplateLayer> = { width: round(w), height: round(h) };
          if (west) patch.x = round(start.x + (start.w - w));
          if (north) patch.y = round(start.y + (start.h - h));
          onChange(layer.id, patch);
        }
        setGuides(g);
      };
      const up = () => {
        setGuides([]);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [interactive, onChange, onSelect, snap],
  );

  // atalhos de movimento com as setas
  useEffect(() => {
    if (!interactive || !selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const step = e.shiftKey ? 5 : 0.5;
      const layer = doc.layers.find((l) => l.id === selectedId);
      if (!layer) return;
      if (e.key === "ArrowLeft") onChange(layer.id, { x: round(layer.x - step) });
      else if (e.key === "ArrowRight") onChange(layer.id, { x: round(layer.x + step) });
      else if (e.key === "ArrowUp") onChange(layer.id, { y: round(layer.y - step) });
      else if (e.key === "ArrowDown") onChange(layer.id, { y: round(layer.y + step) });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc.layers, interactive, onChange, selectedId]);

  const ordered = [...doc.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
      <div
        ref={wrapRef}
        onPointerDown={() => onSelect(null)}
        className="relative shadow-2xl"
        style={{
          aspectRatio: `${doc.canvas.width}/${doc.canvas.height}`,
          height: `${Math.round(zoom * 100)}%`,
          maxWidth: "100%",
          containerType: "size",
          ...bgStyle(doc),
          filter: filterToCss(doc.filter),
        }}
      >
        {ordered.map((layer) =>
          layer.visible ? (
            <div
              key={layer.id}
              onPointerDown={startDrag(layer, "move")}
              className={`absolute ${interactive && !layer.locked ? "cursor-move" : ""} ${
                selectedId === layer.id ? "outline outline-2 outline-primary" : ""
              }`}
              style={{
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
                opacity: layer.opacity,
                transform: `rotate(${layer.rotation}deg) scaleX(${layer.flipX ? -1 : 1}) scaleY(${layer.flipY ? -1 : 1})`,
                zIndex: layer.zIndex + 1,
              }}
            >
              <LayerView layer={layer} doc={doc} sampleVideoUrl={doc.sampleVideoUrl ?? null} />
              {interactive && selectedId === layer.id && !layer.locked && (
                <>
                  {(["nw", "ne", "sw", "se"] as Handle[]).map((h) => (
                    <span
                      key={h}
                      onPointerDown={startDrag(layer, h)}
                      className="absolute size-2.5 rounded-[2px] bg-primary"
                      style={{
                        left: h.includes("w") ? -5 : undefined,
                        right: h.includes("e") ? -5 : undefined,
                        top: h.startsWith("n") ? -5 : undefined,
                        bottom: h.startsWith("s") ? -5 : undefined,
                        cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                      }}
                    />
                  ))}
                  <span
                    onPointerDown={startDrag(layer, "rotate")}
                    title="Girar"
                    className="absolute left-1/2 -top-6 size-3 -translate-x-1/2 cursor-grab rounded-full border border-primary bg-background"
                  />
                </>
              )}
            </div>
          ) : null,
        )}

        {showGrid && (
          <div className="pointer-events-none absolute inset-0" style={{ zIndex: 9999 }}>
            {[1, 2].map((i) => (
              <div key={`x${i}`} className="absolute top-0 bottom-0 w-px bg-primary/20" style={{ left: `${(i / 3) * 100}%` }} />
            ))}
            {[1, 2].map((i) => (
              <div key={`y${i}`} className="absolute right-0 left-0 h-px bg-primary/20" style={{ top: `${(i / 3) * 100}%` }} />
            ))}
          </div>
        )}
        {showSafeArea && (
          <div className="pointer-events-none absolute inset-x-[5%] top-[12%] bottom-[18%] border border-dashed border-warn/60" style={{ zIndex: 9999 }} />
        )}
        {guides.map((g, i) => (
          <div
            key={i}
            className="pointer-events-none absolute bg-warn/80"
            style={
              g.axis === "x"
                ? { left: `${g.pos}%`, top: 0, bottom: 0, width: 1, zIndex: 9999 }
                : { top: `${g.pos}%`, left: 0, right: 0, height: 1, zIndex: 9999 }
            }
          />
        ))}
      </div>
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
