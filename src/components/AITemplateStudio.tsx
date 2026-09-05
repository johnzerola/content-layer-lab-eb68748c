import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Wand2, Loader2, Scissors, Layers, Palette } from "lucide-react";
import { toast } from "sonner";
import { aiTemplatePlan, type AiTemplatePlan } from "@/lib/ai-template.functions";
import { LOOKS, LOOK_BY_ID } from "@/lib/looks";
import { CAPTION_PRESETS } from "@/lib/template";
import type { CaptionCue } from "@/lib/captions";

export type AiPlanCut = AiTemplatePlan["cuts"][number];
export type AiPlanVariation = AiTemplatePlan["variations"][number];

interface Props {
  captions?: CaptionCue[] | undefined;
  duration: number;
  platform?: string | undefined;
  /** aplica branding + estilo de legenda + layout no template ativo */
  onBrand: (plan: AiTemplatePlan) => void;
  /** cria um vídeo por corte sugerido (cortes reais, com timestamps) */
  onCuts: (cuts: AiPlanCut[]) => void;
  /** distribui as variações de estilo entre os vídeos do lote */
  onVariations: (variations: AiPlanVariation[]) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function AITemplateStudio({
  captions,
  duration,
  platform,
  onBrand,
  onCuts,
  onVariations,
}: Props) {
  const run = useServerFn(aiTemplatePlan);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<AiTemplatePlan | null>(null);

  const transcript = (captions ?? [])
    .map((c) => `[${fmt(c.start)}] ${c.words.map((w) => w.text).join(" ")}`)
    .join("\n")
    .slice(0, 20000);

  async function generate() {
    if (!transcript.trim()) {
      toast.error("Gere a transcrição do vídeo primeiro — o template é montado a partir das falas.");
      return;
    }
    setLoading(true);
    try {
      const out = (await run({
        data: {
          transcript,
          duration: Math.max(1, duration || 1),
          ...(platform ? { platform } : {}),
          looks: LOOKS.map((l) => l.id),
          captionPresets: CAPTION_PRESETS.map((p) => p.id),
        },
      })) as AiTemplatePlan;
      setPlan(out);
      toast.success("Template gerado pela IA.");
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e).slice(0, 200));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel rise-in space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <Wand2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Template com IA</p>
            <p className="text-[11px] text-muted-foreground">
              branding, legenda, variações de estilo e cortes reais em um clique
            </p>
          </div>
        </div>
        <button className="btn-primary interactive h-9 px-3 text-xs" onClick={generate} disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> montando…
            </span>
          ) : (
            "gerar template"
          )}
        </button>
      </div>

      {!transcript.trim() && (
        <p className="rounded-lg border border-border bg-surface-2 p-3 text-[12px] text-muted-foreground">
          Sem transcrição ainda — gere as legendas do vídeo para a IA montar o template a partir do conteúdo real.
        </p>
      )}

      {plan && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="mono-label flex items-center gap-1.5">
              <Palette className="size-3.5" /> Branding & legenda
            </p>
            <p className="text-sm font-semibold">{plan.brand.headline || "—"}</p>
            <p className="text-[12px] text-muted-foreground">{plan.brand.cta}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {plan.brand.palette.map((c) => (
                <span
                  key={c}
                  className="size-5 rounded-md border border-border"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Legenda {CAPTION_PRESETS.find((p) => p.id === plan.captions.preset)?.label ?? plan.captions.preset} ·{" "}
              {plan.captions.position} · {plan.captions.maxWords} palavras · layout {plan.layout}
            </p>
            {plan.captions.reason && (
              <p className="text-[11px] text-muted-foreground">{plan.captions.reason}</p>
            )}
            <button
              className="btn-primary interactive h-8 w-full text-xs"
              onClick={() => {
                onBrand(plan);
                toast.success("Template aplicado.");
              }}
            >
              aplicar no template
            </button>
          </section>

          <section className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="mono-label flex items-center gap-1.5">
              <Layers className="size-3.5" /> Variações de estilo
            </p>
            {plan.variations.length === 0 && (
              <p className="text-[11px] text-muted-foreground">nenhuma variação sugerida</p>
            )}
            {plan.variations.map((v) => {
              const look = LOOK_BY_ID.get(v.look);
              return (
                <div key={v.look} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="size-4 shrink-0 rounded"
                    style={{ background: `linear-gradient(135deg, ${look?.swatch?.[0] ?? "#333"}, ${look?.swatch?.[1] ?? "#777"})` }}
                  />
                  <span className="font-medium">{v.label || look?.label || v.look}</span>
                  <span className="truncate text-muted-foreground">{v.reason}</span>
                </div>
              );
            })}
            {plan.variations.length > 0 && (
              <button
                className="btn-ghost interactive h-8 w-full text-xs"
                onClick={() => {
                  onVariations(plan.variations);
                  toast.success("Variações distribuídas entre os vídeos.");
                }}
              >
                distribuir nos vídeos do lote
              </button>
            )}
          </section>

          <section className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="mono-label flex items-center gap-1.5">
              <Scissors className="size-3.5" /> Cortes reais
            </p>
            {plan.cuts.length === 0 && (
              <p className="text-[11px] text-muted-foreground">nenhum corte sugerido</p>
            )}
            {plan.cuts.map((c) => (
              <div key={`${c.start}-${c.end}`} className="text-[12px]">
                <span className="mono-label mr-2">
                  {fmt(c.start)}–{fmt(c.end)}
                </span>
                <span className="font-medium">{c.title || "corte"}</span>{" "}
                <span className="text-muted-foreground">· score {Math.round(c.score)}</span>
              </div>
            ))}
            {plan.cuts.length > 0 && (
              <button
                className="btn-ghost interactive h-8 w-full text-xs"
                onClick={() => {
                  onCuts(plan.cuts);
                  toast.success(`${plan.cuts.length} cortes criados.`);
                }}
              >
                criar {plan.cuts.length} vídeos com esses cortes
              </button>
            )}
          </section>

        </div>
      )}
    </div>
  );
}
