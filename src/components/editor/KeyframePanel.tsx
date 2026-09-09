/**
 * Keyframes de enquadramento (zoom e posição) do vídeo — estilo editor profissional.
 * Grava o recorte atual em um instante; o motor interpola entre os keyframes
 * (`cropAt` em preedit.ts), então o efeito vale no preview e na exportação.
 */
import { useMemo } from "react";
import { cropAt, type PreCrop, type PreEdit } from "@/lib/preedit";
import type { TemplateLayer } from "@/lib/video-template/types";
import { upsertLayerKeyframe } from "@/lib/video-template/layer-keyframes";

interface Props {
  preedit: PreEdit;
  onChange: (patch: Partial<PreEdit>, label?: string) => void;
  duration: number;
  currentTime: number;
  onSeek: (t: number) => void;
  layer?: TemplateLayer | null;
  onUpdateLayer?: (patch: Partial<TemplateLayer>) => void;
}

const FULL: PreCrop = { x: 0, y: 0, w: 1, h: 1 };

function cropFrom(zoom: number, px: number, py: number): PreCrop {
  const w = Math.min(1, 1 / Math.max(1, zoom));
  const h = w;
  return { x: (1 - w) * px, y: (1 - h) * py, w, h };
}

function fmt(t: number): string {
  return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;
}

export function KeyframePanel({ preedit, onChange, duration, currentTime, onSeek, layer, onUpdateLayer }: Props) {
  const keys = useMemo(() => [...(preedit.keys ?? [])].sort((a, b) => a.t - b.t), [preedit.keys]);
  const current = cropAt(preedit, currentTime) ?? preedit.crop ?? FULL;
  const zoom = Number((1 / Math.max(0.05, current.w)).toFixed(2));
  const px = current.w >= 1 ? 0.5 : current.x / (1 - current.w);
  const py = current.h >= 1 ? 0.5 : current.y / (1 - current.h);

  const setCrop = (crop: PreCrop, label: string) => {
    if (keys.length) {
      // com keyframes ativos, editar mexe no keyframe mais próximo do playhead
      const nearest = keys.reduce((a, b) => (Math.abs(b.t - currentTime) < Math.abs(a.t - currentTime) ? b : a));
      onChange({ keys: keys.map((k) => (k.t === nearest.t ? { ...k, crop } : k)) }, label);
    } else {
      onChange({ crop }, label);
    }
  };

  const addKey = () => {
    const next = keys.filter((k) => Math.abs(k.t - currentTime) > 0.05);
    next.push({ t: Number(currentTime.toFixed(2)), crop: current });
    onChange({ keys: next.sort((a, b) => a.t - b.t) }, "keyframe");
  };

  const preset = (from: number, to: number, label: string) => {
    onChange(
      {
        keys: [
          { t: 0, crop: cropFrom(from, 0.5, 0.5) },
          { t: Math.max(1, duration || 5), crop: cropFrom(to, 0.5, 0.5) },
        ],
      },
      label,
    );
  };

  const addLayerKeyframe = () => {
    if (!layer || !onUpdateLayer) return;
    onUpdateLayer({ keyframes: upsertLayerKeyframe(layer, currentTime, { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, opacity: layer.opacity }) });
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Grave o zoom e a posição do quadro em pontos do tempo. Entre dois keyframes o movimento é suave — igual a um
        editor profissional.
      </p>

      <div className="space-y-2 rounded-xl border border-border/60 p-3">
        <label className="flex items-center justify-between text-xs">
          <span>Zoom</span>
          <span className="font-mono">{zoom.toFixed(2)}x</span>
        </label>
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onChange={(e) => setCrop(cropFrom(Number(e.target.value), px, py), "zoom-quadro")}
          className="w-full"
          aria-label="Zoom do quadro"
        />
        <label className="flex items-center justify-between text-xs">
          <span>Posição horizontal</span>
          <span className="font-mono">{Math.round(px * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={px}
          onChange={(e) => setCrop(cropFrom(zoom, Number(e.target.value), py), "pan-x")}
          className="w-full"
          aria-label="Posição horizontal do quadro"
        />
        <label className="flex items-center justify-between text-xs">
          <span>Posição vertical</span>
          <span className="font-mono">{Math.round(py * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={py}
          onChange={(e) => setCrop(cropFrom(zoom, px, Number(e.target.value)), "pan-y")}
          className="w-full"
          aria-label="Posição vertical do quadro"
        />
        <button
          type="button"
          onClick={addKey}
          className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
          ◆ Adicionar keyframe em {fmt(currentTime)}
        </button>
      </div>

      {layer && onUpdateLayer && <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">Propriedades da camada</p>
          <span className="font-mono text-[10px] text-primary">{layer.keyframes?.length ?? 0} pontos</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Anime posição, tamanho, rotação e opacidade no tempo atual.</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label>X <input aria-label="Posição X" type="number" value={layer.x} onChange={(e) => onUpdateLayer({ x: Number(e.target.value) })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1" /></label>
          <label>Y <input aria-label="Posição Y" type="number" value={layer.y} onChange={(e) => onUpdateLayer({ y: Number(e.target.value) })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1" /></label>
          <label>Escala X <input aria-label="Largura" type="number" value={layer.width} onChange={(e) => onUpdateLayer({ width: Number(e.target.value) })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1" /></label>
          <label>Opacidade <input aria-label="Opacidade" type="number" min="0" max="1" step="0.05" value={layer.opacity} onChange={(e) => onUpdateLayer({ opacity: Number(e.target.value) })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1" /></label>
        </div>
        <button type="button" onClick={addLayerKeyframe} className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">◆ Gravar propriedades em {fmt(currentTime)}</button>
        {!!layer.keyframes?.length && <div className="space-y-1 border-t border-border/50 pt-2">{layer.keyframes.map((key) => <button type="button" key={key.id} onClick={() => onSeek(key.time)} className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] hover:bg-primary/10"><span className="font-mono text-primary">{fmt(key.time)}</span><span className="text-muted-foreground">X {Math.round(key.values.x ?? 0)} · Y {Math.round(key.values.y ?? 0)}</span></button>)}</div>}
      </div>}

      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Movimentos prontos</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button type="button" onClick={() => preset(1, 1.4, "zoom-in")} className="rounded-lg border border-border/60 px-2 py-1.5">
            Zoom in lento
          </button>
          <button type="button" onClick={() => preset(1.4, 1, "zoom-out")} className="rounded-lg border border-border/60 px-2 py-1.5">
            Zoom out lento
          </button>
          <button type="button" onClick={() => preset(1.25, 1.25, "estatico")} className="rounded-lg border border-border/60 px-2 py-1.5">
            Close fixo
          </button>
          <button
            type="button"
            onClick={() => onChange({ keys: [], crop: null }, "limpar-keys")}
            className="rounded-lg border border-border/60 px-2 py-1.5"
          >
            Limpar tudo
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {keys.length} keyframes
        </p>
        {keys.map((k) => (
          <div key={k.t} className="flex items-center gap-2 rounded-lg border border-border/50 px-2 py-1 text-xs">
            <button type="button" onClick={() => onSeek(k.t)} className="font-mono text-primary">
              {fmt(k.t)}
            </button>
            <span className="text-muted-foreground">{(1 / Math.max(0.05, k.crop.w)).toFixed(2)}x</span>
            <button
              type="button"
              onClick={() => onChange({ keys: keys.filter((x) => x.t !== k.t) }, "remover-keyframe")}
              className="ml-auto text-muted-foreground hover:text-destructive"
              aria-label={`Remover keyframe ${fmt(k.t)}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
