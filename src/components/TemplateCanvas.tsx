import { useEffect, useRef, useState } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  LAYER_LABELS,
  type LayerId,
  type SelId,
  type Template,
} from "@/lib/template";
import { drawFrame, preloadImage, type DrawOpts } from "@/lib/draw";
import { PlatformUIOverlay, type PlatformUI } from "@/components/PlatformUIOverlay";
import { motionAt, type Variation } from "@/lib/variation";


type Rect = { x: number; y: number; w: number; h: number };

const FIXED_KEY: Record<LayerId, keyof Template> = {
  video: "video",
  watermark: "watermark",
  avatar: "avatar",
  name: "name_",
  handle: "handle",
  headline: "headline",
  cta: "cta",
  captions: "captions",
};

const ORDER: LayerId[] = [
  "video",
  "avatar",
  "name",
  "handle",
  "headline",
  "cta",
  "captions",
  "watermark",
];

function isExtra(id: SelId): id is string {
  return typeof id === "string" && id.startsWith("extra:");
}

function layerOf(t: Template, id: SelId): (Rect & { visible: boolean }) | null {
  if (isExtra(id)) {
    const found = (t.extras ?? []).find((e) => `extra:${e.id}` === id);
    return found ?? null;
  }
  const key = FIXED_KEY[id as LayerId];
  const l = t[key] as unknown as (Rect & { visible: boolean }) | undefined;
  return l ?? null;
}

function rectOf(t: Template, id: SelId): Rect | null {
  const l = layerOf(t, id);
  if (!l) return null;
  const h =
    "size" in (l as object) && (l as { h?: number }).h == null
      ? (l as unknown as { size: number }).size * 1.2
      : l.h;
  return { x: l.x, y: l.y, w: l.w, h };
}

function applyRect(t: Template, id: SelId, r: Partial<Rect>): Template {
  // camadas de texto não têm altura própria: a altura vem de `size`
  const cur = layerOf(t, id) as (Rect & { size?: number; h?: number }) | null;
  const patch: Record<string, number> = { ...r };
  if (cur && cur.h == null && typeof cur.size === "number" && r.h != null) {
    patch["size"] = Math.max(8, Math.round(r.h / 1.2));
    delete patch["h"];
  }
  if (isExtra(id)) {
    return {
      ...t,
      extras: (t.extras ?? []).map((e) => (`extra:${e.id}` === id ? { ...e, ...patch } : e)),
    };
  }
  const key = FIXED_KEY[id as LayerId];
  const base = t[key] as unknown as Rect;
  if (!base) return t;
  return { ...t, [key]: { ...base, ...patch } } as Template;
}


function labelOf(t: Template, id: SelId) {
  if (isExtra(id)) return (t.extras ?? []).find((e) => `extra:${e.id}` === id)?.label ?? "Camada";
  return LAYER_LABELS[id as LayerId];
}

/** Todas as camadas selecionáveis, incluindo as livres. */
export function selectableIds(t: Template): SelId[] {
  return [...ORDER.filter((id) => layerOf(t, id)), ...(t.extras ?? []).map((e) => `extra:${e.id}`)];
}

type Guide = { axis: "x" | "y"; pos: number };
const SNAP = 14;
const MIN_W = 24;
const MIN_H = 20;

type DragMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const HANDLES: { mode: DragMode; style: React.CSSProperties; cursor: string }[] = [
  { mode: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
  { mode: "n", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
  { mode: "ne", style: { left: "100%", top: 0 }, cursor: "nesw-resize" },
  { mode: "e", style: { left: "100%", top: "50%" }, cursor: "ew-resize" },
  { mode: "se", style: { left: "100%", top: "100%" }, cursor: "nwse-resize" },
  { mode: "s", style: { left: "50%", top: "100%" }, cursor: "ns-resize" },
  { mode: "sw", style: { left: 0, top: "100%" }, cursor: "nesw-resize" },
  { mode: "w", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
];

function snapValue(
  value: number,
  size: number,
  targets: number[],
  guides: Guide[],
  axis: "x" | "y",
): number {
  const edges = [value, value + size / 2, value + size];
  let best: { delta: number; pos: number } | null = null;
  for (const t of targets) {
    for (let i = 0; i < edges.length; i++) {
      const delta = t - edges[i]!;
      if (Math.abs(delta) <= SNAP && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, pos: t };
      }
    }
  }
  if (!best) return value;
  guides.push({ axis, pos: best.pos });
  return Math.round(value + best.delta);
}

export function TemplateCanvas({
  template,
  selected,
  onSelect,
  onChange,
  interactive = true,
  poster,
  previewFile,
  drawOpts,
  motionVar,

  snap = true,
  speed = 1,
  loopStart = 0,
  loopEnd,
  videoRef,
  debug = false,
  debugGrid = 3,
  debugSafeArea = true,
  debugBoxes = true,
  uiOverlay = null,
  frameClassName,
}: {
  template: Template;
  selected?: SelId | null;
  onSelect?: (id: SelId) => void;
  onChange?: (t: Template) => void;
  interactive?: boolean;
  poster?: string | null;
  previewFile?: File | null;
  drawOpts?: DrawOpts | undefined;
  /** variação anti-duplicidade: anima o zoom/movimento na prévia */
  motionVar?: Variation | null | undefined;

  snap?: boolean;
  /** velocidade anti-duplicidade aplicada na prévia */
  speed?: number;
  /** janela exportada (clipagem + corte anti-duplicidade), em segundos do vídeo fonte */
  loopStart?: number;
  loopEnd?: number | undefined;
  /** expõe o <video> da prévia (usado pelo mini editor de keyframes) */
  videoRef?: { current: HTMLVideoElement | null };
  /** modo de depuração: grade, áreas seguras e caixas das camadas */
  debug?: boolean;
  /** divisões da grade (2 = metades, 3 = terços...) */
  debugGrid?: number;
  debugSafeArea?: boolean;
  debugBoxes?: boolean;
  /** simula a interface do app (TikTok/IG/Shorts) por cima da prévia — nunca entra na exportação */
  uiOverlay?: PlatformUI | null;
  /** permite o palco controlar o tamanho do quadro (padrão: 320px de largura) */
  frameClassName?: string;
}) {



  const W = template.canvasW ?? CANVAS_W;
  const H = template.canvasH ?? CANVAS_H;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const posterImg = useRef<HTMLImageElement | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);

  useEffect(() => {
    if (!poster) {
      posterImg.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => (posterImg.current = img);
    img.src = poster;
  }, [poster]);

  const videoEl = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!previewFile) {
      videoEl.current = null;
      if (videoRef) videoRef.current = null;
      return;
    }
    const url = URL.createObjectURL(previewFile);
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    // repete exatamente a janela que será exportada (clipe + corte anti-duplicidade)
    const onLoop = () => {
      const end = Math.min(loopEnd ?? Infinity, v.duration || Infinity);
      if (v.currentTime < loopStart - 0.05 || v.currentTime >= end) v.currentTime = loopStart;
    };
    v.addEventListener("loadedmetadata", onLoop);
    v.addEventListener("timeupdate", onLoop);
    const promise = v.play();
    if (promise !== undefined) {
      promise.catch((e) => {
        if (e.name !== "NotAllowedError") {
          console.warn("Auto-play blocked or failed:", e);
        }
      });
    }
    videoEl.current = v;
    if (videoRef) videoRef.current = v;
    return () => {
      v.removeEventListener("loadedmetadata", onLoop);
      v.removeEventListener("timeupdate", onLoop);
      v.pause();
      videoEl.current = null;
      if (videoRef) videoRef.current = null;
      URL.revokeObjectURL(url);
    };
  }, [previewFile, loopStart, loopEnd, videoRef]);



  // velocidade anti-duplicidade em tempo real
  useEffect(() => {
    if (videoEl.current) videoEl.current.playbackRate = Math.max(0.25, Math.min(4, speed || 1));
  }, [speed, previewFile]);

  // Patch cache removido: limpeza profissional agora é feita no backend CleanerIA.


  useEffect(() => {
    for (const src of [template.avatar.src, template.watermark.src]) {
      if (src) void preloadImage(src);
    }
    for (const e of template.extras ?? []) {
      if ("src" in e && e.src) void preloadImage(e.src);
    }
  }, [template.avatar.src, template.watermark.src, template.extras]);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const hasMotion = Boolean(motionVar && motionVar.motion && motionVar.motion.preset !== "none");
    const tick = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        const vid = videoEl.current;
        const p = posterImg.current;
        // readyState < 2 = ainda não há quadro decodificado: desenhar o <video>
        // agora pintaria preto. Nesse caso usamos o poster até o vídeo abrir.
        const source = vid && vid.videoWidth && vid.readyState >= 2
          ? { el: vid, width: vid.videoWidth, height: vid.videoHeight }
          : p
            ? { el: p, width: p.naturalWidth, height: p.naturalHeight }
            : null;
        const time = vid?.currentTime ?? (performance.now() - t0) / 1000;
        let extra: DrawOpts | undefined;
        if (hasMotion && motionVar) {
          const rate = Math.max(0.25, speed || 1);
          const dur = Math.max(1, ((loopEnd ?? vid?.duration ?? 10) - loopStart) / rate);
          const outTime = Math.max(0, (time - loopStart) / rate);
          // sem análise de áudio na prévia: energia simulada para o preset "pulso"
          const energy = 0.5 + 0.5 * Math.sin(outTime * 3.1);
          const mo = motionAt(motionVar, outTime, dur, energy);
          extra = {
            zoom: mo.zoom,
            brightness: mo.brightness,
            saturation: mo.saturation,
            rotate: mo.rotate,
            offsetX: Math.max(-1, Math.min(1, (drawOpts?.offsetX ?? template.video.offsetX) + mo.panX)),
            offsetY: Math.max(-1, Math.min(1, (drawOpts?.offsetY ?? template.video.offsetY) + mo.panY)),
          };
        }
        drawFrame(ctx, template, source, { ...drawOpts, ...extra, time });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [template, drawOpts, motionVar, speed, loopStart, loopEnd]);


  const [live, setLive] = useState<{ id: SelId; r: Rect } | null>(null);

  const drag = (id: SelId, mode: DragMode) => (e: React.PointerEvent) => {
    if (!interactive || !onChange) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(id);
    const startRect = rectOf(template, id);
    if (!startRect) return;
    const box = wrapRef.current!.getBoundingClientRect();
    const scale = W / box.width;
    const start = { mx: e.clientX, my: e.clientY, ...startRect };
    const ratio = start.w / Math.max(1, start.h);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    // alvos de alinhamento: bordas/centro do canvas + bordas das outras camadas
    const others = selectableIds(template)
      .filter((oid) => oid !== id)
      .map((oid) => rectOf(template, oid))
      .filter(Boolean) as Rect[];
    const xTargets = [0, W / 2, W, 60, W - 60, ...others.flatMap((r) => [r.x, r.x + r.w / 2, r.x + r.w])];
    const yTargets = [0, H / 2, H, 60, H - 60, ...others.flatMap((r) => [r.y, r.y + r.h / 2, r.y + r.h])];

    const nearest = (v: number, targets: number[], g: Guide[], axis: "x" | "y") => {
      let best: { d: number; pos: number } | null = null;
      for (const t of targets) {
        const d = t - v;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, pos: t };
      }
      if (!best) return v;
      g.push({ axis, pos: best.pos });
      return Math.round(best.pos);
    };

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.mx) * scale;
      const dy = (ev.clientY - start.my) * scale;
      const g: Guide[] = [];
      const doSnap = snap && !ev.altKey;

      if (mode === "move") {
        let x = Math.round(start.x + dx);
        let y = Math.round(start.y + dy);
        if (doSnap) {
          x = snapValue(x, start.w, xTargets, g, "x");
          y = snapValue(y, start.h, yTargets, g, "y");
        }
        const r = { x, y, w: start.w, h: start.h };
        setLive({ id, r });
        onChange(applyRect(template, id, { x, y }));
      } else {
        // redimensiona apenas pelo lado da alça: as bordas opostas ficam ancoradas
        const west = mode.includes("w");
        const east = mode.includes("e");
        const north = mode.includes("n");
        const south = mode.includes("s");
        const fromCenter = ev.altKey;

        let left = start.x;
        let right = start.x + start.w;
        let top = start.y;
        let bottom = start.y + start.h;

        if (east) {
          right = start.x + start.w + dx;
          if (doSnap) right = nearest(right, xTargets, g, "x");
          if (fromCenter) left = start.x + start.w - (right - start.x);
        }
        if (west) {
          left = start.x + dx;
          if (doSnap) left = nearest(left, xTargets, g, "x");
          if (fromCenter) right = start.x + (start.x + start.w - left);
        }
        if (south) {
          bottom = start.y + start.h + dy;
          if (doSnap) bottom = nearest(bottom, yTargets, g, "y");
          if (fromCenter) top = start.y + start.h - (bottom - start.y);
        }
        if (north) {
          top = start.y + dy;
          if (doSnap) top = nearest(top, yTargets, g, "y");
          if (fromCenter) bottom = start.y + (start.y + start.h - top);
        }

        let w = Math.max(MIN_W, Math.round(right - left));
        let h = Math.max(MIN_H, Math.round(bottom - top));

        // Shift mantém a proporção nas alças de canto
        if (ev.shiftKey && (east || west) && (north || south)) {
          if (w / h > ratio) w = Math.round(h * ratio);
          else h = Math.round(w / ratio);
        }

        const x = Math.round(west ? right - w : left);
        const y = Math.round(north ? bottom - h : top);
        const r = { x, y, w, h };
        setLive({ id, r });
        onChange(applyRect(template, id, r));
      }
      setGuides(g);
    };
    const up = () => {
      setGuides([]);
      setLive(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };


  // Canva-like: setas movem a camada selecionada (Shift = 10px)
  useEffect(() => {
    if (!interactive || !onChange || !selected) return;
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const step = ev.shiftKey ? 10 : 1;
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const mv = d[ev.key];
      if (!mv) return;
      const r = rectOf(template, selected);
      if (!r) return;
      ev.preventDefault();
      onChange(applyRect(template, selected, { x: Math.round(r.x + mv[0]), y: Math.round(r.y + mv[1]) }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, onChange, selected, template]);

  const ids = selectableIds(template);

  return (
    <div
      ref={wrapRef}
      className={`relative mx-auto overflow-hidden rounded-2xl border border-border bg-black ${frameClassName ?? "w-full max-w-[320px]"}`}
      style={{ aspectRatio: `${W}/${H}` }}
    >
      <canvas ref={canvasRef} width={W} height={H} className="block h-full w-full" />

      {uiOverlay && <PlatformUIOverlay platform={uiOverlay} />}

      {debug && (
        <div className="pointer-events-none absolute inset-0">
          {/* grade */}
          {Array.from({ length: Math.max(0, debugGrid - 1) }, (_, i) => (i + 1) / debugGrid).map((f) => (
            <div key={`gx${f}`} className="absolute top-0 bottom-0 w-px bg-primary/25" style={{ left: `${f * 100}%` }} />
          ))}
          {Array.from({ length: Math.max(0, debugGrid - 1) }, (_, i) => (i + 1) / debugGrid).map((f) => (
            <div key={`gy${f}`} className="absolute right-0 left-0 h-px bg-primary/25" style={{ top: `${f * 100}%` }} />
          ))}
          {/* centro */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-primary/50" />
          <div className="absolute right-0 left-0 top-1/2 h-px bg-primary/50" />
          {/* safe areas: UI dos apps (topo ~14%, base ~20%, laterais 5%) */}
          {debugSafeArea && (
            <>
              <div className="absolute inset-x-[5%] top-[14%] bottom-[20%] border border-dashed border-warn/70" />
              <div className="absolute inset-x-0 top-0 h-[14%] bg-warn/10" />
              <div className="absolute inset-x-0 bottom-0 h-[20%] bg-warn/10" />
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 font-mono text-[9px] text-warn">
                safe area
              </span>
            </>
          )}
          {/* bounding boxes */}
          {debugBoxes &&
            ids.map((id) => {
              const l = layerOf(template, id) as
                | (Rect & { visible: boolean; rotation?: number; opacity?: number; z?: number })
                | null;
              const r = rectOf(template, id);
              if (!l || !r) return null;
              const on = l.visible;
              return (
                <div
                  key={`dbg-${id}`}
                  className={`absolute border ${on ? "border-primary/70" : "border-muted-foreground/40 border-dashed"}`}
                  style={{
                    left: `${(r.x / W) * 100}%`,
                    top: `${(r.y / H) * 100}%`,
                    width: `${(r.w / W) * 100}%`,
                    height: `${(r.h / H) * 100}%`,
                  }}
                >
                  <span className="absolute -top-[13px] left-0 whitespace-nowrap rounded-sm bg-black/75 px-1 font-mono text-[9px] leading-[13px] text-primary">
                    {labelOf(template, id)} {Math.round(r.x)},{Math.round(r.y)} · {Math.round(r.w)}×
                    {Math.round(r.h)}
                    {l.rotation ? ` · ${Math.round(l.rotation)}°` : ""}
                    {l.opacity !== undefined && l.opacity < 1 ? ` · α${l.opacity.toFixed(2)}` : ""}
                    {l.z !== undefined ? ` · z${l.z}` : ""}
                  </span>
                </div>
              );
            })}
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[9px] text-primary">
            {W}×{H}
          </span>
        </div>
      )}

      {interactive &&
        ids.map((id) => {
          const l = layerOf(template, id);
          const r = rectOf(template, id);
          if (!l || !r || !l.visible) return null;
          const sel = selected === id;
          return (
            <div
              key={id}
              title={labelOf(template, id)}
              onPointerDown={drag(id, "move")}
              className={`absolute cursor-move ${sel ? "border-2 border-primary" : "border border-transparent hover:border-primary/40"}`}
              style={{
                left: `${(r.x / W) * 100}%`,
                top: `${(r.y / H) * 100}%`,
                width: `${(r.w / W) * 100}%`,
                height: `${(r.h / H) * 100}%`,
              }}
            >
              {sel && (
                <>
                  {HANDLES.map((hd) => (
                    <span
                      key={hd.mode}
                      onPointerDown={drag(id, hd.mode)}
                      style={{ ...hd.style, cursor: hd.cursor }}
                      className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-background shadow-sm transition-transform hover:scale-125"
                    />
                  ))}
                  {live && live.id === id && (
                    <span className="pointer-events-none absolute left-1/2 -bottom-6 -translate-x-1/2 whitespace-nowrap rounded bg-foreground/90 px-1.5 py-0.5 font-mono text-[9px] text-background">
                      {Math.round(live.r.w)} × {Math.round(live.r.h)}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      {guides.map((g, i) => (
        <div
          key={i}
          className="pointer-events-none absolute bg-warn/90"
          style={
            g.axis === "x"
              ? { left: `${(g.pos / W) * 100}%`, top: 0, bottom: 0, width: 1 }
              : { top: `${(g.pos / H) * 100}%`, left: 0, right: 0, height: 1 }
          }
        />
      ))}
    </div>
  );
}

export { ORDER as LAYER_ORDER, layerOf, LAYER_LABELS, isExtra };
