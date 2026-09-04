/**
 * Painel de EFEITOS de clipe (glitch, zoom burst, flash, VHS…).
 *
 * O efeito vale por um intervalo de tempo do vídeo e é aplicado no quadro
 * inteiro, tanto na prévia quanto na exportação.
 */
import { Button } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import { EFFECTS, createClipEffect, type ClipEffect, type EffectId } from "@/lib/editor/effects";
import { Trash2 } from "lucide-react";

const fmt = (s: number) => `${s.toFixed(2)}s`;

export function EffectsPanel({
  effects,
  currentTime,
  duration,
  onChange,
}: {
  effects: ClipEffect[];
  currentTime: number;
  duration: number;
  onChange: (next: ClipEffect[]) => void;
}) {
  const add = (id: EffectId, suggested: number) => {
    const start = Math.max(0, Math.min(currentTime, Math.max(0, duration - 0.2)));
    const end = suggested > 0 ? Math.min(duration || start + suggested, start + suggested) : duration || start + 5;
    onChange([...effects, createClipEffect(id, start, end)]);
  };

  const patch = (id: string, p: Partial<ClipEffect>) =>
    onChange(effects.map((e) => (e.id === id ? { ...e, ...p } : e)));

  return (
    <div className="space-y-4">
      <div>
        <Label>Efeitos</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          O efeito começa na agulha da timeline. Ajuste o intervalo e a força depois de adicionar.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {EFFECTS.map((fx) => (
          <button
            key={fx.id}
            type="button"
            title={fx.hint}
            onClick={() => add(fx.id, fx.suggested)}
            className="interactive rounded-xl border border-border/60 bg-background/40 p-3 text-left hover:border-primary/60"
          >
            <span className="block text-sm font-medium">{fx.label}</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">{fx.hint}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Aplicados ({effects.length})</Label>
        {effects.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum efeito ainda.</p>
        ) : (
          effects.map((e) => {
            const def = EFFECTS.find((d) => d.id === e.effect);
            return (
              <div key={e.id} className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{def?.label ?? e.effect}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onChange(effects.filter((x) => x.id !== e.id))}
                    aria-label="Remover efeito"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <label className="space-y-1">
                    <span>Início {fmt(e.start)}</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, duration)}
                      step={0.05}
                      value={e.start}
                      onChange={(ev) => patch(e.id, { start: Math.min(Number(ev.target.value), e.end - 0.05) })}
                      className="w-full"
                    />
                  </label>
                  <label className="space-y-1">
                    <span>Fim {fmt(e.end)}</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, duration)}
                      step={0.05}
                      value={e.end}
                      onChange={(ev) => patch(e.id, { end: Math.max(Number(ev.target.value), e.start + 0.05) })}
                      className="w-full"
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-[11px] text-muted-foreground">
                  <span>Força {Math.round(e.intensity * 100)}%</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={e.intensity}
                    onChange={(ev) => patch(e.id, { intensity: Number(ev.target.value) })}
                    className="w-full"
                  />
                </label>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
