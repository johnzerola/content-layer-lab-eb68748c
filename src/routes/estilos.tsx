/**
 * ESTILOS REUTILIZÁVEIS: galeria de estilos completos (cores, tipografia,
 * animação e transição) prontos e salvos pelo usuário. Aplicar marca o estilo
 * para entrar no próximo projeto aberto no editor profissional.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { CAPTION_PRESETS } from "@/lib/editor/caption-styles";
import { STYLE_TEMPLATES } from "@/lib/editor/style-templates";
import { STYLE_FONTS, STYLE_PALETTES } from "@/components/editor/StylesPanel";
import { READY_TEMPLATES } from "@/lib/editor/template-presets";
import { DEFAULT_ANIM_IDENTITY, loadAnimIdentity, saveAnimIdentity, type AnimIdentity } from "@/lib/editor/animation-library";
import { DEFAULT_BRAND_KIT, loadBrandKit, type BrandKit } from "@/lib/brand-kit";
import {
  deleteStylePreset,
  setPendingLayout,
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
  component: () => (
    <RequireAuth title="Estilos" description="Entre na sua conta para salvar e reutilizar estilos.">
      <EstilosPage />
    </RequireAuth>
  ),
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
  const [tab, setTab] = useState<"layouts" | "prontos" | "meus" | "paletas" | "tipografia">("layouts");
  const [identity, setIdentity] = useState<AnimIdentity>(DEFAULT_ANIM_IDENTITY);
  const [brand, setBrand] = useState<BrandKit>(DEFAULT_BRAND_KIT);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setMine(listStylePresets());
    setIdentity(loadAnimIdentity());
    setBrand(loadBrandKit());
  }, []);

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
    <>
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
          {(["layouts", "prontos", "meus", "paletas", "tipografia"] as const).map((t) => (
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
          {tab === "layouts" && (
          <div className="space-y-4">
            <div className="glass grid gap-3 rounded-2xl border border-border/60 p-4 sm:grid-cols-3">
              <label className="space-y-1 text-xs">
                <span className="mono-label">@ do perfil</span>
                <input
                  value={identity.handle}
                  onChange={(e) => {
                    const next = { ...identity, handle: e.target.value.replace(/^@/, "") };
                    setIdentity(next);
                    saveAnimIdentity(next);
                  }}
                  className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2"
                  placeholder="seucanal"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="mono-label">Nome</span>
                <input
                  value={identity.name}
                  onChange={(e) => {
                    const next = { ...identity, name: e.target.value };
                    setIdentity(next);
                    saveAnimIdentity(next);
                  }}
                  className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="mono-label">Cargo / marca</span>
                <input
                  value={identity.role}
                  onChange={(e) => {
                    const next = { ...identity, role: e.target.value };
                    setIdentity(next);
                    saveAnimIdentity(next);
                  }}
                  className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2"
                />
              </label>
              <p className="text-[11px] text-muted-foreground sm:col-span-3">
                Os layouts já saem com estes dados e com as cores/fontes do seu Brand Kit
                ({brand.primary} · {brand.headingFont.split(",")[0]}).
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {READY_TEMPLATES.map((t) => (
                <article key={t.id} className="glass overflow-hidden rounded-2xl border border-border/60">
                  <div
                    className="relative flex h-28 items-center justify-center px-3 text-center"
                    style={{ background: t.swatch[0], color: t.swatch[1] }}
                  >
                    <span className="text-sm font-black uppercase leading-tight">{t.label}</span>
                    <span className="absolute bottom-1 right-2 text-[10px] opacity-80">@{identity.handle}</span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="text-[11px] text-muted-foreground">{t.hint}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingLayout(t.id);
                        toast.success(`Layout “${t.label}” pronto — abra um projeto no editor.`);
                      }}
                      className="interactive w-full rounded-lg bg-primary/20 px-2 py-1.5 text-xs"
                    >
                      Aplicar no editor
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "prontos" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar estilo"
              className="ml-auto rounded-lg border border-border/60 bg-transparent px-3 py-1.5 text-xs"
            />
          )}
        </div>

        {tab === "layouts" && (
          <div className="space-y-4">
            <div className="glass grid gap-3 rounded-2xl border border-border/60 p-4 sm:grid-cols-3">
              <label className="space-y-1 text-xs">
                <span className="mono-label">@ do perfil</span>
                <input
                  value={identity.handle}
                  onChange={(e) => {
                    const next = { ...identity, handle: e.target.value.replace(/^@/, "") };
                    setIdentity(next);
                    saveAnimIdentity(next);
                  }}
                  className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2"
                  placeholder="seucanal"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="mono-label">Nome</span>
                <input
                  value={identity.name}
                  onChange={(e) => {
                    const next = { ...identity, name: e.target.value };
                    setIdentity(next);
                    saveAnimIdentity(next);
                  }}
                  className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="mono-label">Cargo / marca</span>
                <input
                  value={identity.role}
                  onChange={(e) => {
                    const next = { ...identity, role: e.target.value };
                    setIdentity(next);
                    saveAnimIdentity(next);
                  }}
                  className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2"
                />
              </label>
              <p className="text-[11px] text-muted-foreground sm:col-span-3">
                Os layouts já saem com estes dados e com as cores/fontes do seu Brand Kit
                ({brand.primary} · {brand.headingFont.split(",")[0]}).
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {READY_TEMPLATES.map((t) => (
                <article key={t.id} className="glass overflow-hidden rounded-2xl border border-border/60">
                  <div
                    className="relative flex h-28 items-center justify-center px-3 text-center"
                    style={{ background: t.swatch[0], color: t.swatch[1] }}
                  >
                    <span className="text-sm font-black uppercase leading-tight">{t.label}</span>
                    <span className="absolute bottom-1 right-2 text-[10px] opacity-80">@{identity.handle}</span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="text-[11px] text-muted-foreground">{t.hint}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingLayout(t.id);
                        toast.success(`Layout “${t.label}” pronto — abra um projeto no editor.`);
                      }}
                      className="interactive w-full rounded-lg bg-primary/20 px-2 py-1.5 text-xs"
                    >
                      Aplicar no editor
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

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
    </>
  );
}
