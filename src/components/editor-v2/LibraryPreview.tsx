import { useEffect, useMemo, useState } from "react";
import { transitionFrame } from "@/lib/editor-v2/library";
import { captionWordMotionFrame } from "@/lib/editor-v2/caption-motion";
import type { CaptionPresetDefinition, LibraryItem, TemplateDefinition } from "@/lib/editor-v2/library";
import type { StickerDefinition } from "@/lib/editor-v2/library";
import { StickerVisualV2 } from "./StickerVisualV2";

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
  if (item.preview.kind === "filter") return <EffectPreview item={item} />;
  if (item.preview.kind === "template") return <TemplatePreview item={item} />;
  if (item.preview.kind === "caption") return <CaptionPreview item={item} progress={progress} />;
  if (item.preview.kind === "animation") return <AnimationPreview item={item} progress={progress} />;
  if (item.preview.kind === "shape") return <ShapePreview item={item} />;
  if (item.preview.kind === "sticker") return <StickerPreview item={item} progress={progress} />;
  if (item.preview.kind === "audio") return <AudioPreview item={item} />;
  return <TextPreview item={item} />;
}

function AudioPreview({ item }: { item: LibraryItem }) {
  const color = item.preview.colors?.[0] ?? "#8d73ff";
  const bars = [18, 42, 70, 34, 84, 54, 27, 65, 91, 48, 74, 30, 58, 22];
  return <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#222c45,#0a0d15_72%)] px-4">
    <span className="flex h-12 w-full items-center justify-center gap-1 rounded-xl border border-white/8 bg-black/20 px-3" aria-hidden>{bars.map((height, index) => <i key={index} className="w-1 rounded-full opacity-90" style={{ height: `${height}%`, background: color, boxShadow: `0 0 9px ${color}66` }} />)}</span>
    <span className="absolute bottom-2 right-2 rounded-md border border-white/10 bg-black/55 px-1.5 py-0.5 text-[7px] font-semibold text-white">SFX {item.duration?.toFixed(2)}s</span>
  </span>;
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
  const definition = item.definition as TemplateDefinition;
  const document = definition.document;
  const background = document.canvas.background.kind === "color" ? document.canvas.background.color : document.canvas.background.kind === "gradient" ? `linear-gradient(${document.canvas.background.angle}deg,${document.canvas.background.from},${document.canvas.background.to})` : "#090b12";
  return (
    <span data-template-preview={definition.id} className="relative block max-h-48 overflow-hidden" style={{ background, aspectRatio: `${document.canvas.width}/${document.canvas.height}` }}>
      {document.layers.filter((layer) => layer.visible).map((layer) => {
        const style: React.CSSProperties = { position: "absolute", left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, opacity: layer.opacity, transform: `translate(-50%,-50%) rotate(${layer.rotation}deg)`, zIndex: layer.zIndex };
        if (layer.type === "shape") return <span key={layer.id} style={{ ...style, background: layer.fill, borderRadius: layer.shape === "circle" ? "999px" : `${Math.min(layer.radius, 12)}px` }} />;
        if (layer.type === "text") return <span key={layer.id} style={{ ...style, display: "flex", alignItems: "center", color: layer.color, background: layer.background ?? undefined, fontWeight: layer.fontWeight, fontSize: `${Math.max(5, layer.fontSize / 5)}px`, lineHeight: layer.lineHeight, textAlign: layer.align, borderRadius: `${Math.min(layer.radius, 8)}px`, padding: "2px" }}>{layer.text}</span>;
        return null;
      })}
      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[7px] font-semibold text-white/90">{document.aspectRatio}</span>
    </span>
  );
}

function CaptionPreview({ item, progress }: { item: LibraryItem; progress: number }) {
  const preset = item.definition as CaptionPresetDefinition;
  const words = (item.preview.sampleText ?? "LEGENDA EM TEMPO REAL").split(" ");
  const active = Math.min(words.length - 1, Math.floor(progress * words.length));
  return (
    <span className="relative flex aspect-video items-end justify-center overflow-hidden bg-[linear-gradient(145deg,#20283a,#0d1119)] p-3">
      <span className="max-w-[90%] rounded px-2 py-1 text-center text-[10px] font-black leading-tight" style={{ color: preset.style.color, background: preset.style.backgroundColor }}>
        {words.map((word, index) => {
          if (preset.mode === "line") return <span key={`${word}-${index}`}>{word}{" "}</span>;
          const isActive = index === active;
          const frame = captionWordMotionFrame(preset.motion, progress, index / words.length, (index + 1) / words.length, index, isActive);
          const boxed = isActive && preset.style.highlight === "box";
          return <span key={`${word}-${index}`} style={{ color: isActive && !boxed ? preset.activeWordColor : preset.style.color, opacity: (isActive ? 1 : preset.inactiveWordOpacity) * frame.opacity, display: "inline-block", transform: `translate(${frame.translateX}em, ${frame.translateY}em) scale(${frame.scale})`, filter: frame.glow ? `drop-shadow(0 0 ${Math.round(3 + frame.glow * 5)}px ${preset.activeWordColor})` : undefined, background: boxed ? preset.activeWordColor : undefined, borderRadius: boxed ? 3 : undefined, padding: boxed ? "0 3px" : undefined, textDecoration: isActive && preset.style.highlight === "underline" ? "underline" : undefined, textDecorationColor: preset.activeWordColor }}>{word}{" "}</span>;
        })}
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

function StickerPreview({ item, progress }: { item: LibraryItem; progress: number }) {
  const definition = item.definition as StickerDefinition;
  return <span className="grid aspect-video place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_45%,#28233c,#0c1018_70%)] p-3"><StickerVisualV2 sticker={{ stickerId: definition.id, text: definition.text, color: definition.color, accent: definition.accent, speed: definition.speed }} time={progress * 2.4} className="h-12 w-full" /></span>;
}
