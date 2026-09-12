/** Prévia 9:16 da conversa, com transporte (reproduzir, pausar, linha do tempo). */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/base";
import type { ConversationPlan } from "@/lib/chatscene/clock";
import { CanvasConversationRenderer, paintPreview } from "@/lib/chatscene/renderer";
import type { ChatSceneProject } from "@/lib/chatscene/types";
import { renderSize } from "@/lib/chatscene/types";

interface Props {
  project: ChatSceneProject;
  plan: ConversationPlan;
  frame: number;
  playing: boolean;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
}

export function ChatScenePreview({ project, plan, frame, playing, onFrame, onPlaying }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const renderer = useMemo(
    () => new CanvasConversationRenderer({ safeZones: project.render.safeZones }),
    [project.render.safeZones],
  );

  // recarrega imagens/fontes quando o conteúdo muda
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

  // pinta o quadro atual
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    paintPreview(canvas, renderer, project, plan, frame);
  }, [renderer, project, plan, frame, ready]);

  // relógio da reprodução: sempre derivado do tempo real, nunca acumulado
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const startFrame = frame >= plan.totalFrames - 1 ? 0 : frame;
    let raf = 0;
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const next = startFrame + Math.round(elapsed * plan.fps);
      if (next >= plan.totalFrames - 1) {
        onFrame(plan.totalFrames - 1);
        onPlaying(false);
        return;
      }
      onFrame(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `frame` fora das dependências de propósito: ele muda a cada quadro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, plan, onFrame, onPlaying]);

  const { width, height } = renderSize(project.render);
  const seconds = (frame / plan.fps).toFixed(1);
  const total = (plan.totalFrames / plan.fps).toFixed(1);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="glass relative mx-auto w-full overflow-hidden rounded-2xl border border-border"
        style={{ aspectRatio: `${width} / ${height}`, maxWidth: "min(100%, 380px)" }}
      >
        <canvas ref={canvasRef} className="h-full w-full" aria-label="Prévia da conversa" />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-background/60 text-xs text-muted-foreground">
            preparando…
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[380px] items-center gap-2">
        <Button
          size="sm"
          variant={playing ? "secondary" : "default"}
          onClick={() => onPlaying(!playing)}
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onPlaying(false);
            onFrame(0);
          }}
          aria-label="Voltar ao início"
        >
          <RotateCcw className="size-4" />
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(1, plan.totalFrames - 1)}
          value={Math.min(frame, plan.totalFrames - 1)}
          onChange={(e) => {
            onPlaying(false);
            onFrame(Number(e.target.value));
          }}
          className="h-1.5 flex-1 accent-primary"
          aria-label="Linha do tempo da conversa"
        />
        <span className="mono-label shrink-0 text-[11px] text-muted-foreground">
          {seconds}s / {total}s
        </span>
      </div>
    </div>
  );
}
