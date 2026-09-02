/**
 * Aba ESTILOS: galeria de templates de estilo completo (cores + tipografia +
 * animação + transição), paletas e tipografia. Só apresentação — reaproveita
 * os presets de legenda e de transição que já existem.
 */
import { useState } from "react";
import { CaptionStylePanel } from "@/components/editor/CaptionStylePanel";
import { CAPTION_PRESETS, type CaptionPreset } from "@/lib/editor/caption-styles";
import { STYLE_TEMPLATES, type StyleTemplate } from "@/lib/editor/style-templates";
import type { TransitionKind } from "@/lib/preedit";
import type { CaptionLayerStyle } from "@/lib/video-template/types";

export interface StylePalette {
  id: string;
  label: string;
  /** [texto, destaque, fundo] */
  colors: [string, string, string];
}


export const STYLE_PALETTES: StylePalette[] = [
  { id: "viral", label: "Viral", colors: ["#ffffff", "#7c5cff", "#0b0b12"] },
  { id: "tiktok", label: "TikTok", colors: ["#ffffff", "#25f4ee", "#fe2c55"] },
  { id: "ouro", label: "Ouro", colors: ["#fff7e0", "#ffcf4d", "#1a1405"] },
  { id: "neon", label: "Neon", colors: ["#eaffff", "#39ff14", "#04120a"] },
  { id: "coral", label: "Coral", colors: ["#fff5f2", "#ff5a5f", "#1b0d0e"] },
  { id: "gelo", label: "Gelo", colors: ["#f4faff", "#4cc9f0", "#081018"] },
  { id: "mono", label: "Mono", colors: ["#ffffff", "#c9c9c9", "#000000"] },
  { id: "retro", label: "Retrô", colors: ["#fdf0d5", "#ef476f", "#20123a"] },
];

export const STYLE_FONTS: { id: string; label: string; family: string; weight: number }[] = [
  { id: "outfit", label: "Outfit", family: "Outfit, sans-serif", weight: 800 },
  { id: "figtree", label: "Figtree", family: "Figtree, sans-serif", weight: 700 },
  { id: "impact", label: "Impacto", family: "Impact, sans-serif", weight: 900 },
  { id: "mono", label: "Mono", family: "JetBrains Mono, monospace", weight: 700 },
  { id: "serif", label: "Editorial", family: "Instrument Serif, Georgia, serif", weight: 600 },
  { id: "arial", label: "Clássica", family: "Arial Black, sans-serif", weight: 900 },
];

interface Props {
  presetId: string;
  style: CaptionLayerStyle;
  onApplyPreset: (preset: CaptionPreset) => void;
  onStyleChange: (patch: Partial<CaptionLayerStyle>) => void;
  /** aplica também a transição do template completo */
  onApplyTransition?: ((kind: TransitionKind) => void) | undefined;
}

export function StylesPanel({ presetId, style, onApplyPreset, onStyleChange, onApplyTransition }: Props) {
  const [section, setSection] = useState<"templates" | "estilos" | "cores" | "tipografia">("templates");
  const [appliedId, setAppliedId] = useState<string | null>(null);

  /** Um clique configura cores, tipografia, animação da legenda e transição. */
  const applyTemplate = (t: StyleTemplate) => {
    const base = CAPTION_PRESETS.find((p) => p.id === t.presetId) ?? CAPTION_PRESETS[0]!;
    const patch: Partial<CaptionLayerStyle> = {
      color: t.colors[0],
      highlightColor: t.colors[1],
      strokeColor: t.colors[2],
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      uppercase: t.uppercase,
    };
    onApplyPreset({ ...base, style: { ...base.style, ...patch }, animation: t.animation });
    onStyleChange(patch);
    onApplyTransition?.(t.transition);
    setAppliedId(t.id);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex rounded-lg border border-border/60 p-0.5 text-[11px]">
        {(["templates", "estilos", "cores", "tipografia", "efeitos"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={`flex-1 rounded-md px-1.5 py-1 capitalize ${section === s ? "bg-primary/20" : "text-muted-foreground"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {section === "efeitos" && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <p className="text-[11px] text-muted-foreground">
            Efeitos de transição do corte — o mesmo efeito é aplicado na entrada e na saída.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TRANSITIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onApplyTransition?.(t.id);
                  setAppliedId(`trans:${t.id}`);
                }}
                className={`group overflow-hidden rounded-xl border text-left ${
                  appliedId === `trans:${t.id}` ? "border-primary" : "border-border/50 hover:border-primary/60"
                }`}
              >
                <span className="flex h-14 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/25 to-fuchsia-500/15">
                  <span
                    className="h-7 w-7 rounded-md bg-primary/80"
                    style={
                      TRANSITION_PREVIEW[t.id]
                        ? { animation: `${TRANSITION_PREVIEW[t.id]} 1.6s ease-in-out infinite` }
                        : undefined
                    }
                  />
                </span>
                <span className="block px-2 py-1.5 text-xs font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}


      {section === "templates" && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <p className="text-[11px] text-muted-foreground">
            Cada template aplica cores, tipografia, animação da legenda e transição do corte de uma vez.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {STYLE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className={`overflow-hidden rounded-xl border text-left ${
                  appliedId === t.id ? "border-primary" : "border-border/50 hover:border-primary/60"
                }`}
              >
                <span
                  className={`flex h-16 items-center justify-center bg-gradient-to-br ${t.gradient}`}
                  style={{ background: t.colors[2] }}
                >
                  <span
                    className="px-1 text-center text-[13px] leading-tight"
                    style={{
                      fontFamily: t.fontFamily,
                      fontWeight: t.fontWeight,
                      color: t.colors[0],
                      textTransform: t.uppercase ? "uppercase" : "none",
                    }}
                  >
                    seu <span style={{ color: t.colors[1] }}>corte</span>
                  </span>
                </span>
                <span className="block px-2 py-1.5">
                  <span className="block text-xs font-medium">{t.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{t.hint}</span>
                  <span className="mt-1 block font-mono text-[9px] uppercase text-muted-foreground">
                    {t.animation} · {t.transition}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {section === "estilos" && (
        <div className="min-h-0 flex-1">
          <CaptionStylePanel
            presetId={presetId}
            style={style}
            onApplyPreset={onApplyPreset}
            onStyleChange={onStyleChange}
          />
        </div>
      )}


      {section === "cores" && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            {STYLE_PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onStyleChange({ color: p.colors[0], highlightColor: p.colors[1], strokeColor: p.colors[2] })
                }
                className="rounded-xl border border-border/50 p-2 text-left hover:border-primary/60"
              >
                <span className="flex gap-1">
                  {p.colors.map((c) => (
                    <span key={c} className="h-6 flex-1 rounded" style={{ background: c }} />
                  ))}
                </span>
                <span className="mt-1 block text-xs">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/50 p-2 text-[11px]">
            <label className="flex flex-col gap-1">
              Texto
              <input
                type="color"
                value={style.color}
                onChange={(e) => onStyleChange({ color: e.target.value })}
                aria-label="Cor do texto"
              />
            </label>
            <label className="flex flex-col gap-1">
              Destaque
              <input
                type="color"
                value={style.highlightColor}
                onChange={(e) => onStyleChange({ highlightColor: e.target.value })}
                aria-label="Cor de destaque"
              />
            </label>
            <label className="flex flex-col gap-1">
              Contorno
              <input
                type="color"
                value={style.strokeColor}
                onChange={(e) => onStyleChange({ strokeColor: e.target.value })}
                aria-label="Cor do contorno"
              />
            </label>
          </div>
        </div>
      )}

      {section === "tipografia" && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {STYLE_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onStyleChange({ fontFamily: f.family, fontWeight: f.weight })}
              className={`w-full rounded-xl border px-3 py-2 text-left ${
                style.fontFamily === f.family ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/50"
              }`}
            >
              <span className="block text-lg" style={{ fontFamily: f.family, fontWeight: f.weight }}>
                Seu vídeo viral
              </span>
              <span className="text-[11px] text-muted-foreground">{f.label}</span>
            </button>
          ))}
          <label className="flex items-center justify-between gap-2 rounded-xl border border-border/50 p-2 text-xs">
            Tamanho
            <input
              type="range"
              min={32}
              max={130}
              value={style.fontSize}
              onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-xl border border-border/50 p-2 text-xs">
            Caixa alta
            <input
              type="checkbox"
              checked={style.uppercase}
              onChange={(e) => onStyleChange({ uppercase: e.target.checked })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
