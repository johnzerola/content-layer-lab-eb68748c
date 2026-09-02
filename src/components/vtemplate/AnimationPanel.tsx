/** Painel completo de animação da camada: efeito, tempo, velocidade e direção. */
import { useState } from "react";
import { Button, Input } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import { ANIMATION_GROUPS, LAYER_ANIMATIONS, defaultAnimation } from "@/lib/video-template/animations";
import type { AnimationSpec, Easing, TemplateLayer } from "@/lib/video-template/types";

type Slot = "animationIn" | "animationOut" | "animationLoop";

const SLOTS: { id: Slot; label: string }[] = [
  { id: "animationIn", label: "Entrada" },
  { id: "animationOut", label: "Saída" },
  { id: "animationLoop", label: "Contínua" },
];

const EASINGS: { id: Easing; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "easeIn", label: "Acelera" },
  { id: "easeOut", label: "Desacelera" },
  { id: "easeInOut", label: "Suave" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Label className="w-24 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

export function AnimationPanel({
  layer,
  onUpdate,
  onPreview,
}: {
  layer: TemplateLayer;
  onUpdate: (patch: Partial<TemplateLayer>) => void;
  onPreview: (slot: Slot) => void;
}) {
  const [slot, setSlot] = useState<Slot>("animationIn");
  const [group, setGroup] = useState<string>("Todas");
  const spec = (layer[slot] ?? null) as AnimationSpec | null;
  const list = group === "Todas" ? LAYER_ANIMATIONS : LAYER_ANIMATIONS.filter((a) => a.category === group);

  const patch = (next: Partial<AnimationSpec>) => {
    if (!spec) return;
    onUpdate({ [slot]: { ...spec, ...next } } as Partial<TemplateLayer>);
  };

  return (
    <section className="space-y-3 border-t border-border/70 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Animação</h3>
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => onPreview(slot)}>
          Prévia no canvas
        </Button>
      </div>

      <div className="flex gap-1">
        {SLOTS.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={slot === s.id ? "default" : "outline"}
            className="h-7 flex-1 text-[11px]"
            onClick={() => setSlot(s.id)}
          >
            {s.label}
            {layer[s.id] ? " •" : ""}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {["Todas", ...ANIMATION_GROUPS].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            aria-pressed={group === g}
            className={`rounded-full border px-2 py-1 text-[10px] transition ${
              group === g ? "border-primary bg-primary/15 text-primary" : "border-border/70 text-muted-foreground"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Button
          size="sm"
          variant={spec ? "outline" : "default"}
          className="h-8 text-[11px]"
          onClick={() => onUpdate({ [slot]: null } as Partial<TemplateLayer>)}
        >
          Nenhuma
        </Button>
        {list.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={spec?.type === a.id ? "default" : "outline"}
            className="h-8 text-[11px]"
            onClick={() =>
              onUpdate({
                [slot]: { ...(spec ?? defaultAnimation(a.id, slot === "animationLoop")), type: a.id },
              } as Partial<TemplateLayer>)
            }
          >
            {a.label}
          </Button>
        ))}
      </div>

      {spec && (
        <div className="space-y-1 rounded-lg border border-border/70 p-2">
          <Field label="Duração">
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.05}
              value={spec.duration}
              onChange={(e) => patch({ duration: Number(e.target.value) })}
              aria-label="Duração da animação"
              className="min-w-0 flex-1"
            />
            <Input
              type="number"
              step={0.05}
              value={spec.duration}
              onChange={(e) => patch({ duration: Number(e.target.value) })}
              className="h-8 w-20 text-xs"
            />
          </Field>
          <Field label="Início">
            <input
              type="range"
              min={0}
              max={8}
              step={0.05}
              value={spec.delay}
              onChange={(e) => patch({ delay: Number(e.target.value) })}
              aria-label="Início (atraso) da animação"
              className="min-w-0 flex-1"
            />
            <Input
              type="number"
              step={0.05}
              value={spec.delay}
              onChange={(e) => patch({ delay: Number(e.target.value) })}
              className="h-8 w-20 text-xs"
            />
          </Field>
          <Field label="Fim">
            <span className="font-mono text-[11px] text-muted-foreground">
              {(spec.delay + spec.duration / (spec.speed && spec.speed > 0 ? spec.speed : 1)).toFixed(2)}s após o
              início da camada
            </span>
          </Field>
          <Field label="Velocidade">
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={spec.speed ?? 1}
              onChange={(e) => patch({ speed: Number(e.target.value) })}
              aria-label="Velocidade da animação"
              className="min-w-0 flex-1"
            />
            <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">
              {(spec.speed ?? 1).toFixed(2)}x
            </span>
          </Field>
          <Field label="Direção">
            <select
              value={spec.direction ?? "normal"}
              onChange={(e) => patch({ direction: e.target.value as NonNullable<AnimationSpec["direction"]> })}
              aria-label="Direção da animação"
              className="h-8 flex-1 rounded-md border border-border/70 bg-card/60 px-2 text-xs"
            >
              <option value="normal">Normal</option>
              <option value="reverse">Invertida</option>
              <option value="alternate">Vai e volta</option>
            </select>
          </Field>
          <Field label="Curva">
            <select
              value={spec.easing}
              onChange={(e) => patch({ easing: e.target.value as Easing })}
              aria-label="Curva da animação"
              className="h-8 flex-1 rounded-md border border-border/70 bg-card/60 px-2 text-xs"
            >
              {EASINGS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </section>
  );
}
