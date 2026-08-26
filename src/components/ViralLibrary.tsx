import { useMemo, useState } from "react";
import { Library, Search, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NICHES,
  libraryTotal,
  searchPatterns,
  type ViralPattern,
} from "@/lib/viral-library";

interface Props {
  /** nicho ativo que dá contexto ao score dos cortes */
  nicheId: string | null;
  onNiche: (id: string | null) => void;
  /** aplica a duração recomendada do padrão escolhido */
  onUsePattern: (p: ViralPattern) => void;
}

const PAGE = 12;

export function ViralLibrary({ nicheId, onNiche, onUsePattern }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const total = useMemo(() => libraryTotal(), []);
  const results = useMemo(
    () => searchPatterns({ nicheId, search, limit: PAGE, offset: page * PAGE }),
    [nicheId, search, page],
  );

  const active = NICHES.find((n) => n.id === nicheId) ?? null;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mono-label">Biblioteca viral</p>
          <p className="text-lg font-semibold">Contexto de melhores momentos</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {total.toLocaleString("pt-BR")} padrões de lives, podcasts, resumos de filmes e mais —
            usados para pontuar o que costuma viralizar em cada formato
          </p>
        </div>
        <Button variant="outline" onClick={() => setOpen((v) => !v)}>
          <Library className="size-4" /> {open ? "Fechar" : "Explorar"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mono-label mr-1">nicho do vídeo</span>
        <button
          onClick={() => {
            onNiche(null);
            setPage(0);
          }}
          className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${
            !nicheId
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"
          }`}
        >
          automático
        </button>
        {NICHES.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              onNiche(n.id);
              setPage(0);
            }}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] transition ${
              nicheId === n.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>

      {active && (
        <p className="mt-3 rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] text-muted-foreground">
          <Sparkles className="mr-1 inline size-3 text-primary" />
          {active.blurb} · duração ideal {active.minLen}–{active.maxLen}s ·{" "}
          {active.hashtags.join(" ")}
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="buscar padrão: reviravolta, treta, primeiro fracasso…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((p) => (
              <article
                key={p.id}
                className="rounded-xl border border-border bg-surface-2 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono-label">{p.nicheLabel}</span>
                  <span className="font-mono text-[11px] text-primary">score {p.score}</span>
                </div>
                <p className="mt-1 font-medium leading-snug">{p.hook}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {p.topic} — {p.payoff}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ~{p.seconds}s · {p.hashtags.slice(0, 3).join(" ")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onNiche(p.nicheId);
                      onUsePattern(p);
                    }}
                  >
                    <Wand2 className="size-3.5" /> usar
                  </Button>
                </div>
              </article>
            ))}
            {!results.length && (
              <p className="font-mono text-[11px] text-muted-foreground">
                nenhum padrão para essa busca.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              anterior
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">página {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={results.length < PAGE}
              onClick={() => setPage((p) => p + 1)}
            >
              próxima
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
