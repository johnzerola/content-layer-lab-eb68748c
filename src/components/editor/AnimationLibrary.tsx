/** Biblioteca visual de animações prontas, personalizáveis com o @ e o nome do usuário. */
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  ANIM_CATEGORIES,
  ANIM_TOTAL,
  DEFAULT_ANIM_IDENTITY,
  loadAnimIdentity,
  saveAnimIdentity,
  searchAnimPresets,
  type AnimCategory,
  type AnimIdentity,
  type AnimPreset,
} from "@/lib/editor/animation-library";
import type { TemplateLayer } from "@/lib/video-template/types";
import { cn } from "@/lib/utils";

interface Props {
  layers: TemplateLayer[];
  onAddLayers: (layers: TemplateLayer[], label: string) => void;
}

function PresetPreview({ preset, identity }: { preset: AnimPreset; identity: AnimIdentity }) {
  const { preview } = preset;
  const style = { animation: `${preview.anim} 1.6s ease-out infinite` } as const;
  return (
    <div className="relative flex h-20 items-center justify-center overflow-hidden rounded-lg bg-[#0d0d14]">
      {preview.shape === "pill" && (
        <span
          className="tp-anim rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ ...style, background: preview.bg, color: preview.fg }}
        >
          @{identity.handle}
        </span>
      )}
      {preview.shape === "lower" && (
        <span
          className="tp-anim rounded-md px-3 py-1.5 text-left"
          style={{ ...style, background: preview.bg, color: preview.fg }}
        >
          <span className="block text-[11px] font-bold leading-tight">{identity.name}</span>
          <span className="block text-[9px] opacity-80" style={{ color: preview.accent ?? preview.fg }}>
            {identity.role}
          </span>
        </span>
      )}
      {preview.shape === "cta" && (
        <span
          className="tp-anim rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-wide"
          style={{ ...style, background: preview.bg, color: preview.fg }}
        >
          {preset.label}
        </span>
      )}
      {preview.shape === "text" && (
        <span
          className="tp-anim text-[13px] font-black uppercase tracking-tight"
          style={{ ...style, color: preview.fg }}
        >
          {preset.label}
        </span>
      )}
      {preview.shape === "block" && (
        <span className="tp-anim h-6 w-24 rounded" style={{ ...style, background: preview.bg }} />
      )}
    </div>
  );
}

export function AnimationLibrary({ layers, onAddLayers }: Props) {
  const [identity, setIdentity] = useState<AnimIdentity>(DEFAULT_ANIM_IDENTITY);
  const [category, setCategory] = useState<AnimCategory | "Todos">("Todos");
  const [query, setQuery] = useState("");

  useEffect(() => setIdentity(loadAnimIdentity()), []);

  const items = useMemo(() => searchAnimPresets(category, query), [category, query]);

  const patchIdentity = (patch: Partial<AnimIdentity>) => {
    const next = { ...identity, ...patch };
    setIdentity(next);
    saveAnimIdentity(next);
  };

  const add = (preset: AnimPreset) => {
    onAddLayers(preset.build(layers, identity), `animacao:${preset.id}`);
    toast.success(`${preset.label} adicionado ao palco.`);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Animações</p>
        <p className="text-xs text-muted-foreground">
          {ANIM_TOTAL} animações · personalizadas com seu perfil
        </p>
      </div>

      <details className="group rounded-xl border border-border/60 bg-card/40">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium">
          <span className="flex items-center gap-2"><UserRound className="size-3.5" /> Personalizar com meu perfil</span>
          <span className="text-[10px] text-muted-foreground group-open:hidden">@{identity.handle}</span>
        </summary>
        <div className="grid gap-2 border-t border-border/60 p-2 sm:grid-cols-3">
        <label className="text-[11px] text-muted-foreground">
          @ do perfil
          <input
            value={identity.handle}
            onChange={(e) => patchIdentity({ handle: e.target.value.replace(/^@/, "") })}
            className="mt-1 w-full rounded-lg border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
            placeholder="seucanal"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Nome
          <input
            value={identity.name}
            onChange={(e) => patchIdentity({ name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Cargo / empresa
          <input
            value={identity.role}
            onChange={(e) => patchIdentity({ role: e.target.value })}
            className="mt-1 w-full rounded-lg border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
        </div>
      </details>

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {(["Todos", ...ANIM_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c as AnimCategory | "Todos")}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition",
              category === c
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/50",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar animação…"
          aria-label="Buscar animação"
          className="w-full rounded-lg border border-border/60 bg-background py-1.5 pl-7 pr-2 text-xs"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => add(p)}
            className="interactive group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-1.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg"
          >
            <PresetPreview preset={p} identity={identity} />
            <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow transition group-hover:opacity-100">
              <Plus className="size-3.5" />
            </span>
            <div className="px-1 pb-1">
              <p className="mt-1.5 truncate text-[12px] font-semibold leading-tight">{p.label}</p>
              <p className="truncate text-[10px] text-muted-foreground">{p.desc}</p>
            </div>
          </button>
        ))}
        {!items.length && <p className="text-xs text-muted-foreground">Nenhuma animação encontrada.</p>}
      </div>
    </div>
  );
}
