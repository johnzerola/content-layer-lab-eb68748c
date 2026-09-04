/** Galeria de estilos de legenda com preview real e ajustes finos. */
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  CAPTION_ANIMATIONS,
  CAPTION_CATEGORIES,
  filterCaptionPresets,
  findCaptionPreset,
  type CaptionCategory,
  type CaptionAnimation,
  type CaptionPreset,
} from "@/lib/editor/caption-styles";
import type { CaptionLayerStyle } from "@/lib/video-template/types";

interface Props {
  presetId: string;
  style: CaptionLayerStyle;
  onApplyPreset: (preset: CaptionPreset) => void;
  onStyleChange: (patch: Partial<CaptionLayerStyle>) => void;
}

function PreviewLine({ style, animation }: { style: CaptionLayerStyle; animation?: CaptionAnimation }) {
  const words = ["SEU", "VÍDEO", "VIRAL"];
  const anim = animation && animation !== "none" ? `cap-anim-${animation}` : "";
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1 rounded-lg px-2 py-3"
      style={{ background: style.background ?? "transparent" }}
    >
      {words.map((w, i) => (
        <span
          key={w}
          className={i === 1 ? anim : undefined}
          style={{
            display: "inline-block",
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            fontSize: 18,
            color: i === 1 && style.highlight === "color" ? style.highlightColor : style.color,
            textTransform: style.uppercase ? "uppercase" : "none",
            WebkitTextStroke: style.strokeWidth ? `${style.strokeWidth / 8}px ${style.strokeColor}` : undefined,
            textShadow: style.shadow ? "0 2px 10px rgba(0,0,0,.7)" : undefined,
            transform: i === 1 && style.highlight === "scale" ? "scale(1.14)" : undefined,
            textDecoration: i === 1 && style.highlight === "underline" ? "underline" : undefined,
            background: i === 1 && style.highlight === "box" ? style.highlightColor : undefined,
            borderRadius: 6,
            padding: i === 1 && style.highlight === "box" ? "0 4px" : undefined,
          }}
        >
          {w}
        </span>
      ))}
    </div>
  );
}

export function CaptionStylePanel({ presetId, style, onApplyPreset, onStyleChange }: Props) {
  const [category, setCategory] = useState<CaptionCategory>("populares");
  const [query, setQuery] = useState("");
  const presets = useMemo(() => filterCaptionPresets(category, query), [category, query]);
  const current = findCaptionPreset(presetId);
  const [animation, setAnimation] = useState<CaptionAnimation>(current.animation);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar estilos de legenda"
          aria-label="Buscar estilo de legenda"
          className="h-10 w-full rounded-xl border border-border/60 bg-card/60 pl-9 pr-3 text-sm outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <label className="space-y-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Categorias</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CaptionCategory)}
          aria-label="Categoria dos estilos"
          className="h-10 w-full rounded-xl border border-border/60 bg-card/60 px-3 text-xs font-semibold outline-none transition focus:border-primary/70"
        >
          {CAPTION_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>

      <div className="flex items-center justify-between px-0.5 text-[10px] text-muted-foreground">
        <span>{presets.length} estilos</span>
        <span>Clique para aplicar</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setAnimation(p.animation);
              onApplyPreset(p);
            }}
            aria-pressed={p.id === presetId}
            className={`group relative min-w-0 overflow-hidden rounded-2xl border bg-card/40 p-2 text-left transition duration-200 ${
              p.id === presetId ? "border-primary ring-2 ring-primary/20" : "border-border/60 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-xl"
            }`}
          >
            {p.id === presetId && (
              <span className="absolute right-2 top-2 z-10 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                <Check className="size-3" />
              </span>
            )}
            <div className="overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 py-5 transition group-hover:brightness-110">
              <PreviewLine style={p.style} animation={p.animation} />
            </div>
            <div className="flex items-start justify-between gap-3 px-1 pb-1 pt-2.5">
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{p.name}</span>
                <span className="mt-0.5 block line-clamp-1 text-[10px] text-muted-foreground">{p.description}</span>
              </span>
              <span className="shrink-0 rounded-md bg-background/70 px-1.5 py-1 font-mono text-[8px] uppercase text-muted-foreground">{p.animation}</span>
            </div>
          </button>
        ))}
        </div>
        {!presets.length && (
          <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
            Nenhum estilo encontrado.
          </div>
        )}
      </div>

      <details className="group shrink-0 rounded-xl border border-border/50 bg-card/50 text-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 font-medium">
          <span>Personalizar estilo</span>
          <span className="text-[10px] text-muted-foreground group-open:hidden">Abrir ajustes</span>
          <span className="hidden text-[10px] text-muted-foreground group-open:inline">Fechar</span>
        </summary>
        <div className="max-h-64 space-y-2 overflow-y-auto border-t border-border/50 p-3">
        <p className="font-medium">Ajustes de “{current.name}”</p>
        <label className="flex items-center justify-between gap-2">
          Animação
          <select
            value={animation}
            onChange={(e) => setAnimation(e.target.value as CaptionAnimation)}
            className="rounded-md border border-border/60 bg-card/60 px-2 py-1"
            aria-label="Animação da legenda"
          >
            {CAPTION_ANIMATIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg bg-black/40 p-1">
          <PreviewLine style={style} animation={animation} />
        </div>
        <label className="flex items-center justify-between gap-2">
          Tamanho
          <input
            type="range"
            min={32}
            max={130}
            value={style.fontSize}
            onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          Contorno
          <input
            type="range"
            min={0}
            max={20}
            value={style.strokeWidth}
            onChange={(e) => onStyleChange({ strokeWidth: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          Palavras por bloco
          <input
            type="range"
            min={1}
            max={8}
            value={style.maxWords}
            onChange={(e) => onStyleChange({ maxWords: Number(e.target.value) })}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1">
            Cor
            <input
              type="color"
              value={style.color}
              onChange={(e) => onStyleChange({ color: e.target.value })}
              aria-label="Cor do texto"
            />
          </label>
          <label className="flex items-center gap-1">
            Destaque
            <input
              type="color"
              value={style.highlightColor}
              onChange={(e) => onStyleChange({ highlightColor: e.target.value })}
              aria-label="Cor de destaque"
            />
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={style.uppercase}
              onChange={(e) => onStyleChange({ uppercase: e.target.checked })}
            />
            Caixa alta
          </label>
        </div>
        <label className="flex items-center justify-between gap-2">
          Modo
          <select
            value={style.mode}
            onChange={(e) => onStyleChange({ mode: e.target.value as CaptionLayerStyle["mode"] })}
            className="rounded-md border border-border/60 bg-card px-2 py-1"
          >
            <option value="line">Frase inteira</option>
            <option value="word">Palavra por palavra</option>
            <option value="karaoke">Karaokê</option>
          </select>
        </label>
        </div>
      </details>
    </div>
  );
}
