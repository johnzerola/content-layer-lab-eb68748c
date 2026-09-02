import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Scissors, Type, Palette, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { aiSuggest } from "@/lib/ai-suggest.functions";
import { LOOKS, LOOK_BY_ID } from "@/lib/looks";
import type { CaptionCue } from "@/lib/captions";

type Suggestion = {
  headlines: string[];
  hashtags: string[];
  cuts: { start: number; end: number; title: string; reason: string; score: number }[];
  look: { id: string; reason: string } | null;
  captionTip: string;
};

interface Props {
  /** transcrição já gerada do vídeo selecionado (opcional) */
  captions?: CaptionCue[] | undefined;
  duration: number;
  platform?: string | undefined;
  /** aplica uma headline sugerida ao vídeo selecionado */
  onHeadline: (text: string) => void;
  /** joga todas as headlines no banco do lote */
  onHeadlineBank: (lines: string[]) => void;
  /** aplica um corte sugerido (segundos) */
  onCut: (cut: { start: number; end: number; title: string; reason: string }) => void;
  /** aplica o estilo de edição sugerido */
  onLook: (lookId: string) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function AISuggestPanel({
  captions,
  duration,
  platform,
  onHeadline,
  onHeadlineBank,
  onCut,
  onLook,
}: Props) {
  const run = useServerFn(aiSuggest);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Suggestion | null>(null);

  const transcript = (captions ?? [])
    .map((c) => `[${fmt(c.start)}] ${c.words.map((w) => w.text).join(" ")}`)
    .join("\n")
    .slice(0, 20000);

  async function generate() {
    if (!transcript.trim()) {
      toast.error("Gere a transcrição do vídeo primeiro para a IA analisar as falas.");
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
        },
      })) as Suggestion;
      setData(out);
      toast.success("Sugestões da IA prontas.");
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
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Assistente de IA</p>
            <p className="text-[11px] text-muted-foreground">
              legendas, cortes e estilo sugeridos a partir das falas do vídeo
            </p>
          </div>
        </div>
        <button className="btn-primary interactive h-9 px-3 text-xs" onClick={generate} disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> analisando…
            </span>
          ) : (
            "gerar sugestões"
          )}
        </button>
      </div>

      {!transcript.trim() && (
        <p className="rounded-lg border border-border bg-surface-2 p-3 text-[12px] text-muted-foreground">
          Sem transcrição ainda — gere as legendas do vídeo e a IA passa a analisar o conteúdo real.
        </p>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="mono-label flex items-center gap-1.5">
              <Type className="size-3.5" /> Headlines
            </p>
            {data.headlines.map((h) => (
              <button
                key={h}
                className="btn-ghost w-full justify-start text-left text-xs"
                onClick={() => {
                  onHeadline(h);
                  toast.success("Headline aplicada.");
                }}
              >
                {h}
              </button>
            ))}
            {data.headlines.length > 1 && (
              <button
                className="text-[11px] text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  onHeadlineBank(data.headlines);
                  toast.success("Banco de headlines do lote preenchido.");
                }}
              >
                usar todas no banco do lote
              </button>
            )}
            {data.hashtags.length > 0 && (
              <p className="text-[11px] text-muted-foreground">{data.hashtags.join(" ")}</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="mono-label flex items-center gap-1.5">
              <Scissors className="size-3.5" /> Cortes
            </p>
            {data.cuts.length === 0 && (
              <p className="text-[11px] text-muted-foreground">nenhum corte sugerido</p>
            )}
            {data.cuts.map((c) => (
              <button
                key={`${c.start}-${c.end}`}
                className="w-full rounded-lg border border-border bg-surface-2 p-2 text-left transition hover:border-primary/50"
                onClick={() => {
                  onCut(c);
                  toast.success("Corte aplicado ao vídeo.");
                }}
              >
                <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-mono">
                    {fmt(c.start)} → {fmt(c.end)}
                  </span>
                  <span className="text-primary">{Math.round(c.score)}</span>
                </span>
                <span className="block text-xs font-medium">{c.title || "trecho forte"}</span>
                <span className="block text-[11px] text-muted-foreground">{c.reason}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <p className="mono-label flex items-center gap-1.5">
              <Palette className="size-3.5" /> Estilo & legenda
            </p>
            {data.look ? (
              <button
                className="w-full rounded-lg border border-border bg-surface-2 p-2 text-left transition hover:border-primary/50"
                onClick={() => {
                  onLook(data.look!.id);
                  toast.success("Estilo aplicado.");
                }}
              >
                <span className="block text-xs font-medium">
                  {LOOK_BY_ID.get(data.look.id)?.label ?? data.look.id}
                </span>
                <span className="block text-[11px] text-muted-foreground">{data.look.reason}</span>
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground">sem estilo sugerido</p>
            )}
            {data.captionTip && (
              <p className="rounded-lg border border-border bg-surface-2 p-2 text-[11px] text-muted-foreground">
                {data.captionTip}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
