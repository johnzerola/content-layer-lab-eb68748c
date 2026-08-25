import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";
import { drawCaptions } from "@/lib/draw";

import {
  CAPTION_TEMPLATES,
  CATEGORY_LABEL,
  applyCaptionTemplate,
  templatesByCategory,
  type CaptionTemplate,
  type CaptionTemplateCategory,
} from "@/lib/caption-templates";
import type { CaptionStyle } from "@/lib/template";
import type { CaptionCue } from "@/lib/captions";

interface Props {
  style: CaptionStyle;
  onChange: (patch: Partial<CaptionStyle>) => void;
  cues?: CaptionCue[] | undefined;
}

const DEMO = "esse detalhe muda tudo no seu vídeo";

function previewCues(cues?: CaptionCue[]): CaptionCue[] {
  if (cues?.length) return [cues[0]!];
  const words = DEMO.split(" ");
  const step = 0.4;
  return [
    {
      start: 0,
      end: words.length * step,
      words: words.map((text, i) => ({ text, start: i * step, end: (i + 1) * step - 0.02 })),
    },
  ];
}

function TemplateCard({
  tpl,
  base,
  cues,
  active,
  onPick,
}: {
  tpl: CaptionTemplate;
  base: CaptionStyle;
  cues: CaptionCue[];
  active: boolean;
  onPick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const visible = useInView(ref);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || !visible) return;
    const style = { ...base, ...tpl.style, visible: true } as CaptionStyle;
    const start = cues[0]?.start ?? 0;
    const end = cues[0]?.end ?? 3;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const span = Math.max(0.6, end - start);
      const t = start + (((now - t0) / 1000) % span);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0e0f0c";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      const scale = cv.width / 1080;
      ctx.scale(scale, scale);
      drawCaptions(ctx, style, cues, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tpl, base, cues, visible]);


  return (
    <button
      onClick={onPick}
      title={tpl.hint}
      aria-label={`aplicar template ${tpl.label}`}
      className={`group relative overflow-hidden rounded-xl border text-left transition ${
        active ? "border-primary" : "border-border hover:border-primary/60"
      }`}
    >
      <canvas ref={ref} width={200} height={356} className="w-full" />
      {active && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-background">
          <Check className="size-3" />
        </span>
      )}
      <span className="block border-t border-border bg-surface-2 px-2 py-1 font-mono text-[10px]">
        {tpl.label}
      </span>
    </button>
  );
}

/** Galeria de legendas prontas (estilo ALCaptions/GetCaptions): escolhe e já encaixa. */
export function CaptionTemplateGallery({ style, onChange, cues }: Props) {
  const [cat, setCat] = useState<CaptionTemplateCategory | "all">("all");
  const [picked, setPicked] = useState<string | null>(null);
  const preview = useMemo(() => previewCues(cues), [cues]);
  const list = useMemo(() => templatesByCategory(cat), [cat]);
  const cats = useMemo(
    () => Array.from(new Set(CAPTION_TEMPLATES.map((t) => t.category))),
    [],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mono-label flex items-center gap-1 pr-1">
          <Sparkles className="size-3 text-primary" /> Legendas prontas
        </span>
        {(["all", ...cats] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${
              cat === c ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {c === "all" ? "todos" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {list.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            tpl={tpl}
            base={style}
            cues={preview}
            active={picked === tpl.id}
            onPick={() => {
              const patch = applyCaptionTemplate(tpl.id);
              if (patch) {
                setPicked(tpl.id);
                onChange(patch);
              }
            }}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">
        {picked
          ? CAPTION_TEMPLATES.find((t) => t.id === picked)?.hint
          : "clique em um card para aplicar posição, quebra de linha, animação e destaque de uma vez"}
      </p>
    </div>
  );
}
