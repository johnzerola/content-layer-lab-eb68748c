/** Tela de layouts de criador: escolha o enquadramento vendo a prévia real. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { ConversationPlan } from "@/lib/chatscene/clock";
import { CanvasConversationRenderer, paintPreview } from "@/lib/chatscene/renderer";
import {
  CREATOR_LAYOUTS,
  type ChatLayoutPreset,
  type ChatSceneProject,
} from "@/lib/chatscene/types";

interface Props {
  project: ChatSceneProject;
  plan: ConversationPlan;
  /** quadro mostrado nas miniaturas (usa o da prévia para bater com a cena) */
  frame: number;
  onSelect: (preset: ChatLayoutPreset) => void;
}

/** Miniatura 9:16 de um layout, pintada com a conversa de verdade. */
function LayoutThumb({
  project,
  plan,
  frame,
}: {
  project: ChatSceneProject;
  plan: ConversationPlan;
  frame: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const renderer = useMemo(
    () => new CanvasConversationRenderer({ safeZones: false }),
    [],
  );

  useEffect(() => {
    let alive = true;
    setReady(false);
    void renderer.prepare(project).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [renderer, project]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    paintPreview(canvas, renderer, project, plan, frame);
  }, [renderer, project, plan, frame, ready]);

  return (
    <canvas
      ref={canvasRef}
      className="aspect-[9/16] w-full rounded-lg bg-muted"
      aria-hidden="true"
    />
  );
}

export function CreatorLayouts({ project, plan, frame, onSelect }: Props) {
  const current = project.layout?.preset ?? "full-chat";

  return (
    <section aria-labelledby="creator-layouts-title" className="glass rounded-2xl p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h2 id="creator-layouts-title" className="truncate text-sm font-semibold">
            Layouts de criador
          </h2>
          <p className="text-xs text-muted-foreground">
            Escolha como a conversa aparece no vídeo — a prévia mostra a sua cena.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CREATOR_LAYOUTS.map((option) => {
          const active = current === option.id;
          const preview: ChatSceneProject = {
            ...project,
            layout: { ...option.value, preset: option.id },
          };
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(option.id)}
              className={`interactive rounded-xl border p-2 text-left transition ${
                active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
            >
              <LayoutThumb project={preview} plan={plan} frame={frame} />
              <div className="mt-2 flex items-start gap-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{option.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
                {active && <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
