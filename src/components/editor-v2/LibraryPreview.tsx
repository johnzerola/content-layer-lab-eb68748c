import { useEffect, useMemo, useState } from "react";
import { transitionFrame } from "@/lib/editor-v2/library";
import type { LibraryItem } from "@/lib/editor-v2/library";

export function LibraryPreview({ item, active = false }: { item: LibraryItem; active?: boolean }) {
  const [progress, setProgress] = useState(0.42);
  useEffect(() => {
    if (!active || typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(0.42);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const draw = (now: number) => {
      setProgress(((now - started) % 1600) / 1600);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  if (item.preview.kind === "transition") return <TransitionPreview item={item} progress={progress} />;
  if (item.preview.kind === "effect") return <EffectPreview item={item} />;
  if (item.preview.kind === "template") return <TemplatePreview item={item} />;
  if (item.preview.kind === "caption") return <CaptionPreview item={item} progress={progress} />;
  if (item.preview.kind === "animation") return <AnimationPreview item={item} progress={progress} />;
  if (item.preview.kind === "shape") return <ShapePreview item={item} />;
  return <TextPreview item={item} />;
}

function TransitionPreview({ item, progress }: { item: LibraryItem; progress: number }) {
  const state = transitionFrame(item.preview.rendererId, progress);
  const style = (value: typeof state.incoming): React.CSSProperties => ({
    opacity: value.opacity,
    transform: `translate(${value.x * 100}%, ${value.y * 100}%) scale(${value.scale})`,
    filter: `blur(${value.blur}px)`,
    clipPath: `inset(0 ${(1 - value.clip) * 100}% 0 0)`,
  });
  return (
    <span className="relative block aspect-video overflow-hidden bg-[#080b12]">
      {state.overlay && <span className="absolute inset-0" style={{ background: state.overlay }} />}
      <span className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#32236f,#7257ff)]" style={style(state.outgoing)}><Scene label="A" /></span>
      <span className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#087b69,#27d4a8)]" style={style(state.incoming)}><Scene label="B" /></span>
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" aria-hidden />
    </span>
  );
}

function Scene({ label }: { label: string }) {
  return <span className="grid h-12 w-16 place-items-center rounded-lg border border-white/30 bg-black/20 text-xl font-semibold text-white shadow-xl">{label}</span>;
}

function EffectPreview({ item }: { item: LibraryItem }) {
  const filter = useMemo(() => {
    const id = item.preview.rendererId;
    if (id === "brightness") return "brightness(1.35)";
    if (id === "contrast") return "contrast(1.45)";
    if (id === "saturation") return "saturate(1.65)";
    if (id === "temperature") return "sepia(.25) saturate(1.3)";
    if (id === "tint") return "hue-rotate(22deg)";
    if (id === "opacity") return "opacity(.65)";
    if (id === "blur") return "blur(2px)";
    if (id === "sharpen") return "contrast(1.15) saturate(1.08)";
    return "brightness(.78)";
  }, [item.preview.rendererId]);
  return (
    <span className="relative block aspect-video overflow-hidden bg-[#0a0d14]">
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_65%_30%,#f1bd65_0_9%,transparent_10%),linear-gradient(135deg,#23344b,#6a4bd2_58%,#ef8b65)]" style={{ filter }} />
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/80" />
      <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[8px] text-white">antes</span>
      <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[8px] text-white">depois</span>
    </span>
  );
}

function TemplatePreview({ item }: { item: LibraryItem }) {
  const colors = item.preview.colors ?? ["#7257ff", "#0b0e15", "#fff"];
  return (
    <span className="relative block aspect-video overflow-hidden" style={{ background: colors[1] }}>
      <span className="absolute -right-5 top-2 size-20 rounded-full opacity-70 blur-xl" style={{ background: colors[0] }} />
      <span className="absolute inset-y-3 left-3 w-[38%] rounded-lg border border-white/15 bg-[linear-gradient(145deg,#283149,#111621)]" />
      <span className="absolute bottom-4 left-[46%] right-3 text-[10px] font-black leading-tight text-white">{item.preview.sampleText}</span>
      <span className="absolute left-[46%] top-4 h-1 w-8 rounded-full" style={{ background: colors[0] }} />
    </span>
  );
}

function CaptionPreview({ item, progress }: { item: LibraryItem; progress: number }) {
  const words = (item.preview.sampleText ?? "LEGENDA EM TEMPO REAL").split(" ");
  const active = Math.min(words.length - 1, Math.floor(progress * words.length));
  return (
    <span className="relative flex aspect-video items-end justify-center overflow-hidden bg-[linear-gradient(145deg,#20283a,#0d1119)] p-3">
      <span className={`max-w-[90%] text-center text-[10px] font-black leading-tight text-white ${item.preview.rendererId.includes("box") ? "rounded bg-black/75 px-2 py-1" : ""}`}>
        {words.map((word, index) => <span key={`${word}-${index}`} className={index === active ? "text-[#a990ff]" : ""}>{word}{" "}</span>)}
      </span>
    </span>
  );
}

function AnimationPreview({ item, progress }: { item: LibraryItem; progress: number }) {
  const id = item.preview.rendererId;
  const loop = id.startsWith("loop-");
  const p = loop ? progress : id.startsWith("out-") ? 1 - progress : progress;
  const transform = id.includes("slide") ? `translateY(${(1 - p) * 16}px)` : id.includes("zoom") || id.includes("pop") ? `scale(${0.72 + p * 0.28})` : id.includes("float") ? `translateY(${Math.sin(progress * Math.PI * 2) * 5}px)` : id.includes("pulse") ? `scale(${0.94 + Math.sin(progress * Math.PI * 2) * 0.06})` : "none";
  return <span className="grid aspect-video place-items-center overflow-hidden bg-[#0c1018]"><span className="text-[10px] font-black tracking-[.14em] text-white" style={{ opacity: id.includes("fade") ? p : 1, transform }}>{item.preview.sampleText}</span></span>;
}

function TextPreview({ item }: { item: LibraryItem }) {
  const id = item.preview.rendererId;
  return <span className="flex aspect-video items-center justify-center overflow-hidden bg-[linear-gradient(140deg,#111725,#090c12)] p-3"><span className={`text-center text-white ${id === "bold" ? "text-sm font-black" : id === "minimal" ? "text-[9px] font-medium tracking-widest" : "text-[11px] font-bold"}`}>{item.preview.sampleText}</span></span>;
}

function ShapePreview({ item }: { item: LibraryItem }) {
  const circle = item.preview.rendererId === "circle";
  const line = item.preview.rendererId === "line";
  return <span className="grid aspect-video place-items-center bg-[#0c1018]"><span className={`${circle ? "size-12 rounded-full" : line ? "h-1 w-16 rounded-full" : "h-10 w-16 rounded-lg"} bg-[linear-gradient(135deg,#8d73ff,#43d6b2)] shadow-lg shadow-violet-500/20`} /></span>;
}

