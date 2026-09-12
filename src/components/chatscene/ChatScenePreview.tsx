/** Prévia 9:16 da conversa, com transporte (reproduzir, pausar, linha do tempo). */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/base";
import type { ConversationPlan } from "@/lib/chatscene/clock";
import { CanvasConversationRenderer, paintPreview } from "@/lib/chatscene/renderer";
import type { ChatSceneProject } from "@/lib/chatscene/types";
import { renderSize } from "@/lib/chatscene/types";
import { voiceSchedule } from "@/lib/chatscene/audio-mix";
import type { VoiceClip } from "@/lib/chatscene/voice-cast";

interface Props {
  project: ChatSceneProject;
  plan: ConversationPlan;
  frame: number;
  playing: boolean;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  /** falas já geradas, para ouvir a conversa na própria prévia */
  clips?: Map<string, VoiceClip>;
}

export function ChatScenePreview({ project, plan, frame, playing, onFrame, onPlaying, clips }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const frameRef = useRef(frame);
  frameRef.current = frame;
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

  // relógio da reprodução: o quadro vem sempre do tempo real decorrido, nunca
  // de um contador acumulado — assim a prévia não "escorrega" do vídeo final
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const startFrame = frameRef.current >= plan.totalFrames - 1 ? 0 : frameRef.current;
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
  }, [playing, plan, onFrame, onPlaying]);

  // som da prévia: as falas tocam no mesmo instante em que a bolha aparece
  useEffect(() => {
    if (!playing || !clips?.size) return;
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    void ctx.resume().catch(() => {});
    const fromSec = frameRef.current / plan.fps;
    const sources: AudioBufferSourceNode[] = [];
    for (const item of voiceSchedule(project, plan, clips)) {
      const delay = item.startSec - fromSec;
      if (delay + item.durationSec <= 0) continue;
      const source = ctx.createBufferSource();
      source.buffer = item.clip.buffer;
      source.playbackRate.value = item.rate;
      const gain = ctx.createGain();
      gain.gain.value = item.gain;
      source.connect(gain).connect(ctx.destination);
      if (delay >= 0) source.start(ctx.currentTime + delay);
      else source.start(ctx.currentTime, -delay * item.rate);
      sources.push(source);
    }
    return () => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* já parou */
        }
      }
      void ctx.close().catch(() => {});
    };
    // a lista de falas só muda quando o documento ou o plano muda
  }, [playing, clips, project, plan]);




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

      {/* mini linha do tempo: cada traço é uma mensagem; clicar salta até ela */}
      <div className="mx-auto flex w-full max-w-[380px] gap-px overflow-hidden rounded-md border border-border">
        {plan.entries.map((entry, i) => {
          const next = plan.entries[i + 1]?.appearFrame ?? plan.totalFrames;
          const span = Math.max(1, next - entry.appearFrame);
          const active = frame >= entry.appearFrame && frame < next;
          return (
            <button
              key={entry.messageId}
              type="button"
              style={{ flexGrow: span }}
              onClick={() => {
                onPlaying(false);
                onFrame(entry.appearFrame);
              }}
              title={`Mensagem ${i + 1} — ${(entry.appearFrame / plan.fps).toFixed(1)}s`}
              aria-label={`Ir para a mensagem ${i + 1}`}
              className={`h-3 min-w-[3px] transition ${
                active ? "bg-primary" : "bg-muted hover:bg-primary/40"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

