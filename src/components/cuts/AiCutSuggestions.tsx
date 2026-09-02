/** Sugestões de cortes por IA, agrupadas por categoria (trending, viral, notícias, gaming…). */
import { useMemo, useState } from "react";
import { Copy, Flame, Gamepad2, Newspaper, Search, Sparkles, TrendingUp, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { NICHES, searchPatterns, type ViralPattern } from "@/lib/viral-library";
import { cn } from "@/lib/utils";

export interface SuggestionCategory {
  id: string;
  label: string;
  blurb: string;
  /** nichos da biblioteca viral que alimentam a categoria */
  niches: string[];
  icon: typeof Flame;
}

export const CUT_CATEGORIES: SuggestionCategory[] = [
  {
    id: "trending",
    label: "Trending",
    blurb: "O que está rendendo agora em qualquer formato — mistura os melhores padrões da base.",
    niches: [],
    icon: TrendingUp,
  },
  {
    id: "viral",
    label: "Viral",
    blurb: "Reação crua, humor e treta: os padrões com maior potencial de compartilhamento.",
    niches: ["live", "humor"],
    icon: Flame,
  },
  {
    id: "noticias",
    label: "Notícias",
    blurb: "Fato, reação e posicionamento — fala clara e desfecho seco.",
    niches: ["noticia", "podcast"],
    icon: Newspaper,
  },
  {
    id: "gaming",
    label: "Gaming",
    blurb: "Clutch, falha épica e jogada impossível: pico de energia manda no corte.",
    niches: ["gameplay"],
    icon: Gamepad2,
  },
  {
    id: "historias",
    label: "Histórias",
    blurb: "Resumos de filmes, séries e narrativas com gancho no conflito.",
    niches: ["filme"],
    icon: Sparkles,
  },
  {
    id: "educativo",
    label: "Educativo",
    blurb: "Promessa clara, passo a passo enxuto e resultado no fim.",
    niches: ["educativo"],
    icon: Wand2,
  },
];

function collect(category: SuggestionCategory, search: string, seed: number): ViralPattern[] {
  const perNiche = category.niches.length ? Math.ceil(18 / category.niches.length) : 18;
  const pool = category.niches.length
    ? category.niches.flatMap((nicheId) =>
        searchPatterns({ nicheId, search, limit: perNiche, offset: seed * perNiche }),
      )
    : NICHES.flatMap((n) => searchPatterns({ nicheId: n.id, search, limit: 3, offset: seed * 3 }));
  return pool.sort((a, b) => b.score - a.score).slice(0, 18);
}

function scriptOf(p: ViralPattern) {
  return `${p.hook} — ${p.topic}. ${p.payoff}\n\n${p.hashtags.slice(0, 6).join(" ")}`;
}

interface Props {
  /** aplica o nicho sugerido no gerador de cortes */
  onUseNiche?: (nicheId: string) => void;
  /** usa o roteiro sugerido (ex.: legenda/narração) */
  onUseScript?: (pattern: ViralPattern) => void;
}

export function AiCutSuggestions({ onUseNiche, onUseScript }: Props) {
  const [categoryId, setCategoryId] = useState(CUT_CATEGORIES[0]!.id);
  const [search, setSearch] = useState("");
  const [seed, setSeed] = useState(0);

  const category = CUT_CATEGORIES.find((c) => c.id === categoryId) ?? CUT_CATEGORIES[0]!;
  const items = useMemo(() => collect(category, search, seed), [category, search, seed]);

  const copy = async (p: ViralPattern) => {
    try {
      await navigator.clipboard.writeText(scriptOf(p));
      toast.success("Roteiro copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {CUT_CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = c.id === categoryId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategoryId(c.id);
                setSeed(0);
              }}
              aria-pressed={active}
              className={cn(
                "interactive inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              <Icon className="size-3.5" aria-hidden /> {c.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-52">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSeed(0);
            }}
            placeholder="Buscar tema, gancho ou palavra-chave…"
            aria-label="Buscar sugestões"
            className="w-full rounded-xl border border-border/60 bg-card/50 py-2 pl-8 pr-3 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="rounded-xl border border-border/60 px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          Novas sugestões
        </button>
      </div>

      <p className="text-sm text-muted-foreground">{category.blurb}</p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <article key={p.id} className="glass rise-in flex flex-col gap-2 rounded-2xl border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="mono-label">{p.nicheLabel}</span>
              <span className="rounded-full border border-primary/40 px-2 py-0.5 font-mono text-[11px] text-primary">
                {p.score}
              </span>
            </div>
            <h3 className="text-sm font-semibold leading-snug">{p.hook}</h3>
            <p className="text-xs text-muted-foreground">
              {p.topic}. <span className="text-foreground/80">{p.payoff}</span>
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              ~{p.seconds}s · {p.hashtags.slice(0, 3).join(" ")}
            </p>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => void copy(p)}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                <Copy className="size-3" aria-hidden /> Copiar roteiro
              </button>
              {onUseScript && (
                <button
                  type="button"
                  onClick={() => onUseScript(p)}
                  className="rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  Usar roteiro
                </button>
              )}
              {onUseNiche && (
                <button
                  type="button"
                  onClick={() => onUseNiche(p.nicheId)}
                  className="rounded-lg bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                >
                  Cortar com este estilo
                </button>
              )}
            </div>
          </article>
        ))}
        {!items.length && (
          <p className="text-sm text-muted-foreground">Nenhuma sugestão para essa busca.</p>
        )}
      </div>
    </section>
  );
}
