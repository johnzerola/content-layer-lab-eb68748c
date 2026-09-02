/** Galeria de estilos de legenda com preview real e ajustes finos. */
import { useMemo, useState } from "react";
import {
  CAPTION_CATEGORIES,
  filterCaptionPresets,
  findCaptionPreset,
  type CaptionCategory,
  type CaptionPreset,
} from "@/lib/editor/caption-styles";
import type { CaptionLayerStyle } from "@/lib/video-template/types";

interface Props {
  presetId: string;
  style: CaptionLayerStyle;
  onApplyPreset: (preset: CaptionPreset) => void;
  onStyleChange: (patch: Partial<CaptionLayerStyle>) => void;
}

function PreviewLine({ style }: { style: CaptionLayerStyle }) {
  const words = ["SEU", "VÍDEO", "VIRAL"];
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1 rounded-lg px-2 py-3"
      style={{ background: style.background ?? "transparent" }}
    >
      {words.map((w, i) => (
        <span
          key={w}
          style={{
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
  const [category, setCategory] = useState<CaptionCategory>("todos");
  const [query, setQuery] = useState("");
  const presets = useMemo(() => filterCaptionPresets(category, query), [category, query]);
  const current = findCaptionPreset(presetId);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar estilo..."
        aria-label="Buscar estilo de legenda"
        className="rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-1">
        {CAPTION_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              category === c.id ? "border-primary bg-primary/20" : "border-border/60"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onApplyPreset(p)}
            className={`w-full rounded-xl border bg-black/40 p-2 text-left transition-colors ${
              p.id === presetId ? "border-primary" : "border-border/50 hover:border-primary/50"
            }`}
          >
            <PreviewLine style={p.style} />
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{p.name}</span>
              <span className="text-[11px] text-muted-foreground">{p.animation}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{p.description}</p>
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-border/50 bg-card/40 p-3 text-xs">
        <p className="font-medium">Ajustes de “{current.name}”</p>
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
    </div>
  );
}
