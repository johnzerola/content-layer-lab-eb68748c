/**
 * Tela de COMPARAÇÃO lado a lado de dois layouts do editor profissional
 * (templates prontos + os meus templates salvos), mostrando paleta,
 * tipografia e transição antes de aplicar. Só apresentação: reaproveita os
 * mesmos presets e o mesmo contrato de aplicação pendente do editor.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { RouteShell } from "@/components/RouteShell";
import { RequireAuth } from "@/components/RequireAuth";
import { READY_TEMPLATES, type ReadyTemplate } from "@/lib/editor/template-presets";
import { setPendingLayout, setPendingTemplate, setPendingTransition } from "@/lib/editor/style-presets";
import { loadAnimIdentity } from "@/lib/editor/animation-library";
import { DEFAULT_BRAND_KIT, loadBrandKit, type BrandKit } from "@/lib/brand-kit";
import { listMyTemplates } from "@/lib/video-template/service";
import type { VideoTemplateRecord } from "@/lib/video-template/types";
import type { TemplateLayer } from "@/lib/video-template/types";

export const Route = createFileRoute("/comparar")({
  head: () => ({
    meta: [
      { title: "Comparar layouts — VaiViral" },
      {
        name: "description",
        content:
          "Compare dois layouts verticais lado a lado com paleta, tipografia e transição antes de aplicar no editor profissional.",
      },
      { property: "og:title", content: "Comparar layouts — VaiViral" },
      {
        property: "og:description",
        content: "Veja dois templates 9:16 lado a lado e escolha o melhor antes de exportar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RouteShell>
      <RequireAuth title="Comparar layouts" description="Entre para comparar e aplicar layouts nos seus cortes.">
        <CompararPage />
      </RequireAuth>
    </RouteShell>
  ),
});

const TRANSITION_PREVIEW: Record<string, string> = {
  fade: "tp-fade",
  flash: "tp-flash",
  zoom: "tp-zoom",
  "zoom-out": "tp-zoomout",
  punch: "tp-punch",
  "slide-up": "tp-up",
  "slide-down": "tp-down",
  "slide-left": "tp-left",
  "slide-right": "tp-right",
  whip: "tp-whip",
  "whip-vertical": "tp-whipv",
  drift: "tp-drift",
  swing: "tp-swing",
};

const CANVAS_W = 1080;
const CANVAS_H = 1920;

/** Miniatura 9:16 das camadas do layout (mesmas coordenadas do canvas). */
function LayoutThumb({ layers, background }: { layers: TemplateLayer[]; background: string }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border/60"
      style={{ aspectRatio: "9 / 16", background, containerType: "size" } as React.CSSProperties}
    >
      {layers.map((l) => {
        const anyL = l as TemplateLayer & Record<string, unknown>;
        const common: React.CSSProperties = {
          position: "absolute",
          left: `${l.x}%`,
          top: `${l.y}%`,
          width: `${l.width}%`,
          height: `${l.height}%`,
        };
        if (l.type === "text" || l.type === "caption") {
          const size = Number(anyL["fontSize"] ?? 40) / CANVAS_H;
          return (
            <span
              key={l.id}
              style={{
                ...common,
                display: "flex",
                alignItems: "center",
                justifyContent:
                  anyL["align"] === "left" ? "flex-start" : anyL["align"] === "right" ? "flex-end" : "center",
                color: String(anyL["color"] ?? "#fff"),
                fontFamily: String(anyL["fontFamily"] ?? "Figtree"),
                fontWeight: Number(anyL["fontWeight"] ?? 700),
                textTransform: anyL["uppercase"] ? "uppercase" : "none",
                fontSize: `${size * 100}cqh`,
                lineHeight: 1.05,
                overflow: "hidden",
              }}
            >
              {String(anyL["text"] ?? "")}
            </span>
          );
        }
        return (
          <span
            key={l.id}
            style={{
              ...common,
              background: String(anyL["fill"] ?? "#ffffff22"),
              borderRadius: `${Number(anyL["radius"] ?? 0) / CANVAS_W * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

type Option =
  | { kind: "ready"; id: string; label: string; hint: string; ready: ReadyTemplate }
  | { kind: "mine"; id: string; label: string; hint: string; record: VideoTemplateRecord };

function Side({
  title,
  options,
  value,
  onValue,
  brand,
}: {
  title: string;
  options: Option[];
  value: string;
  onValue: (id: string) => void;
  brand: BrandKit;
}) {
  const navigate = useNavigate();
  const opt = options.find((o) => o.id === value) ?? options[0];
  const identity = useMemo(() => loadAnimIdentity(), []);

  const layers = useMemo<TemplateLayer[]>(() => {
    if (!opt) return [];
    if (opt.kind === "ready") {
      const kit = { ...brand, ...(opt.ready.palette ?? {}) } as BrandKit;
      try {
        return opt.ready.build([], { handle: identity.handle, name: identity.name, role: identity.role }, kit);
      } catch {
        return [];
      }
    }
    return (opt.record.template_data?.composition?.layers ?? []) as TemplateLayer[];
  }, [opt, brand, identity]);

  const kit = opt?.kind === "ready" ? ({ ...brand, ...(opt.ready.palette ?? {}) } as BrandKit) : brand;
  const transition = opt?.kind === "ready" ? opt.ready.transition : undefined;

  const apply = () => {
    if (!opt) return;
    if (opt.kind === "ready") {
      setPendingLayout(opt.id);
      if (transition) setPendingTransition({ kind: transition.kind, dur: transition.dur, applyAll: false });
    } else {
      setPendingTemplate(opt.id);
    }
    toast.success(`“${opt.label}” será aplicado ao abrir o editor.`);
    void navigate({ to: "/editor" });
  };

  return (
    <section className="glass space-y-3 rounded-2xl border border-border/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="mono-label">{title}</p>
        <select
          aria-label={`Layout ${title}`}
          value={opt?.id ?? ""}
          onChange={(e) => onValue(e.target.value)}
          className="max-w-[60%] rounded-lg border border-border/60 bg-transparent px-2 py-1.5 text-xs"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.kind === "mine" ? `Meu · ${o.label}` : o.label}
            </option>
          ))}
        </select>
      </div>

      <LayoutThumb layers={layers} background={kit.background} />

      <div>
        <p className="text-sm font-medium">{opt?.label ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{opt?.hint ?? ""}</p>
      </div>

      <div className="space-y-2 rounded-xl border border-border/60 p-3">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Paleta</p>
        <div className="flex gap-1">
          {[kit.primary, kit.secondary, kit.text, kit.background].map((c, i) => (
            <span key={`${c}-${i}`} className="h-6 flex-1 rounded" style={{ background: c }} />
          ))}
        </div>
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Tipografia</p>
        <p className="text-base" style={{ fontFamily: kit.headingFont }}>
          {kit.headingFont} — título
        </p>
        <p className="text-sm text-muted-foreground" style={{ fontFamily: kit.bodyFont }}>
          {kit.bodyFont} — texto de apoio
        </p>
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Transição</p>
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-16 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-primary/25 to-fuchsia-500/15">
            <span
              className="h-5 w-5 rounded bg-primary/80"
              style={
                transition && TRANSITION_PREVIEW[transition.kind]
                  ? { animation: `${TRANSITION_PREVIEW[transition.kind]} 1.6s ease-in-out infinite` }
                  : undefined
              }
            />
          </span>
          <span className="text-xs text-muted-foreground">
            {transition ? `${transition.kind} · ${transition.dur.toFixed(2)}s` : "sem transição própria"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={apply}
        className="interactive w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        Aplicar este layout
      </button>
    </section>
  );
}

function CompararPage() {
  const [mine, setMine] = useState<VideoTemplateRecord[]>([]);
  const brand = useMemo(() => loadBrandKit() ?? DEFAULT_BRAND_KIT, []);

  useEffect(() => {
    void listMyTemplates()
      .then(setMine)
      .catch(() => setMine([]));
  }, []);

  const options = useMemo<Option[]>(
    () => [
      ...READY_TEMPLATES.map<Option>((t) => ({ kind: "ready", id: t.id, label: t.label, hint: t.hint, ready: t })),
      ...mine.map<Option>((r) => ({
        kind: "mine",
        id: r.id,
        label: r.name,
        hint: "template salvo no seu acervo",
        record: r,
      })),
    ],
    [mine],
  );

  const [a, setA] = useState(READY_TEMPLATES[0]?.id ?? "");
  const [b, setB] = useState(READY_TEMPLATES[1]?.id ?? READY_TEMPLATES[0]?.id ?? "");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header>
        <p className="mono-label">Comparar</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dois layouts, lado a lado</h1>
        <p className="text-sm text-muted-foreground">
          Veja paleta, tipografia e transição de cada layout — prontos e os seus templates salvos — antes de aplicar no
          editor profissional.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Side title="Opção A" options={options} value={a} onValue={setA} brand={brand} />
        <Side title="Opção B" options={options} value={b} onValue={setB} brand={brand} />
      </div>
    </div>
  );
}
