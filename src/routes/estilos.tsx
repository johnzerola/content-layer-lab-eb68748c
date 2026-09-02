/**
 * ESTILOS REUTILIZÁVEIS: galeria de estilos completos (cores, tipografia,
 * animação e transição) prontos e salvos pelo usuário. Aplicar marca o estilo
 * para entrar no próximo projeto aberto no editor profissional.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CAPTION_PRESETS } from "@/lib/editor/caption-styles";
import { STYLE_TEMPLATES } from "@/lib/editor/style-templates";
import { STYLE_FONTS, STYLE_PALETTES } from "@/components/editor/StylesPanel";
import {
  deleteStylePreset,
  listStylePresets,
  saveStylePreset,
  setPendingStyle,
  type SavedStylePreset,
} from "@/lib/editor/style-presets";

export const Route = createFileRoute("/estilos")({
  head: () => ({
    meta: [
      { title: "Estilos reutilizáveis — VaiViral" },
      {
        name: "description",
        content:
          "Salve e carregue estilos de legenda, paletas, tipografias e animações prontas para aplicar nos seus cortes verticais.",
      },
      { property: "og:title", content: "Estilos reutilizáveis — VaiViral" },
      {
        property: "og:description",
        content: "Biblioteca de estilos, paletas, tipografias e animações aplicáveis no editor do VaiViral.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EstilosPage,
});

/** Converte um estilo pronto da galeria em preset salvável. */
function fromTemplate(id: string): Omit<SavedStylePreset, "id" | "createdAt"> | null {
  const t = STYLE_TEMPLATES.find((s) => s.id === id);
  if (!t) return null;
  const base = CAPTION_PRESETS.find((p) => p.id === t.presetId) ?? CAPTION_PRESETS[0]!;
  return {
    name: t.label,
    presetId: base.id,
    style: {
      ...base.style,
      color: t.colors[0],
      highlightColor: t.colors[1],
      strokeColor: t.colors[2],
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      uppercase: t.uppercase,
    },
    animation: t.animation,
    transition: t.transition,
  };
}

function EstilosPage() {
  const [mine, setMine] = useState<SavedStylePreset[]>([]);
  const [tab, setTab] = useState<"prontos" | "meus" | "paletas" | "tipografia">("prontos");
  const [query, setQuery] = useState("");

  useEffect(() => setMine(listStylePresets()), []);

  const ready = useMemo(
    () =>
      STYLE_TEMPLATES.filter(
        (t) => !query.trim() || `${t.label} ${t.hint}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query],
  );

  const apply = (preset: Omit<SavedStylePreset, "id" | "createdAt"> | SavedStylePreset) => {
    setPendingStyle({
      id: "pending",
      createdAt: Date.now(),
      ...preset,
    } as SavedStylePreset);
    toast.success("Estilo pronto — abra um projeto no editor para aplicar.");
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
        <header className="space-y-2">
          <p className="mono-label">Biblioteca</p>
          <h1 className="font-display text-3xl">Estilos reutilizáveis</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Cores, tipografia, animação da legenda e transição em um pacote só. Aplique em um clique e continue no{" "}
            <Link to="/editor" className="underline">
              editor profissional
            </Link>
            .
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {(["prontos", "meus", "paletas", "tipografia"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full border px-3 py-1.5 text-xs capitalize ${
                tab === t ? "border-primary bg-primary/15" : "border-border/60 text-muted-foreground"
              }`}
            >
              {t === "meus" ? `Meus estilos (${mine.length})` : t}
            </button>
          ))}
          {tab === "prontos" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar estilo"
              className="ml-auto rounded-lg border border-border/60 bg-transparent px-3 py-1.5 text-xs"
            />
          )}
        </div>

        {tab === "prontos" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ready.map((t) => (
              <article key={t.id} className="glass overflow-hidden rounded-2xl border border-border/60">
                <div
                  className={`flex h-24 items-center justify-center bg-gradient-to-br ${t.gradient}`}
                  style={{ color: t.colors[0] }}
                >
                  <span
                    style={{
                      fontFamily: t.fontFamily,
                      fontWeight: t.fontWeight,
                      textTransform: t.uppercase ? "uppercase" : "none",
                      color: t.colors[1],
                    }}
                    className="text-lg"
                  >
                    {t.label}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.hint} · animação {t.animation} · transição {t.transition}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const p = fromTemplate(t.id);
                        if (p) apply(p);
                      }}
                      className="interactive flex-1 rounded-lg bg-primary/20 px-2 py-1.5 text-xs"
                    >
                      Aplicar no editor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const p = fromTemplate(t.id);
                        if (!p) return;
                        saveStylePreset(p);
                        setMine(listStylePresets());
                        toast.success("Salvo em Meus estilos.");
                      }}
                      className="rounded-lg border border-border/60 px-2 py-1.5 text-xs"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {tab === "meus" && (
          <div className="space-y-2">
            {!mine.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum estilo salvo ainda. Salve um estilo pronto acima ou use “Salvar estilo atual” dentro do editor.
              </p>
            )}
            {mine.map((p) => (
              <div key={p.id} className="glass flex items-center gap-3 rounded-xl border border-border/60 p-3">
                <span
                  className="grid h-12 w-12 place-items-center rounded-lg text-xs font-black"
                  style={{ background: p.style.strokeColor, color: p.style.highlightColor }}
                >
                  Aa
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.style.fontFamily.split(",")[0]} · {p.animation} · {p.transition}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => apply(p)}
                  className="interactive rounded-lg bg-primary/20 px-3 py-1.5 text-xs"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteStylePreset(p.id);
                    setMine(listStylePresets());
                  }}
                  className="rounded-lg border border-border/60 px-2 py-1.5 text-xs text-muted-foreground"
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "paletas" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STYLE_PALETTES.map((p) => (
              <div key={p.id} className="glass rounded-xl border border-border/60 p-3">
                <p className="text-sm font-medium">{p.label}</p>
                <div className="mt-2 flex gap-1">
                  {p.colors.map((c) => (
                    <span key={c} className="h-8 flex-1 rounded" style={{ background: c }} />
                  ))}
                </div>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">{p.colors.join(" · ")}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "tipografia" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STYLE_FONTS.map((f) => (
              <div key={f.id} className="glass rounded-xl border border-border/60 p-4">
                <p style={{ fontFamily: f.family, fontWeight: f.weight }} className="text-2xl">
                  {f.label}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{f.family}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
