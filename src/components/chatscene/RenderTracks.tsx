/**
 * Trilhas da tela de render: fundo, mensagens e vozes na mesma régua de tempo.
 * Só apresentação — lê o ChatSceneProject e o plano do relógio, sem criar
 * estado paralelo. O cursor é um componente separado para que o movimento em
 * tempo real não precise redesenhar as trilhas a cada quadro.
 */
import { memo, useCallback, useRef } from "react";
import type { ConversationPlan } from "@/lib/chatscene/clock";
import { voiceSchedule } from "@/lib/chatscene/audio-mix";
import { backgroundLabel, timeLabel } from "@/lib/chatscene/rhythm";
import { DEFAULT_MOTION, MOTION_LIMITS, type ChatSceneMotion, type ChatSceneProject } from "@/lib/chatscene/types";
import type { VoiceClip } from "@/lib/chatscene/voice-cast";

interface Props {
  project: ChatSceneProject;
  plan: ConversationPlan;
  clips: Map<string, VoiceClip>;
  frame: number;
  /** trilha de fundo carregada (música) */
  hasMusic?: boolean;
  onSeek: (frame: number) => void;
  /** ajusta duração/intensidade dos efeitos pelas alças da trilha */
  onMotion?: (patch: Partial<ChatSceneMotion>) => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Alça arrastável: converte o movimento horizontal do ponteiro em um valor. */
function Handle({
  label,
  value,
  min,
  max,
  step,
  pxPerUnit,
  side,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** quantos pixels de arraste valem uma unidade */
  pxPerUnit: number;
  side: "left" | "right";
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const start = useRef<{ x: number; v: number } | null>(null);
  return (
    <button
      type="button"
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={format(value)}
      title={`${label}: ${format(value)}`}
      className={`absolute inset-y-1 z-10 w-3 cursor-ew-resize rounded bg-primary/80 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary ${
        side === "left" ? "left-0" : "right-0"
      }`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, v: value };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = (e.clientX - s.x) * (side === "left" ? -1 : 1);
        onChange(clamp(Math.round((s.v + dx / pxPerUnit) / step) * step, min, max));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(clamp(value + step, min, max));
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(clamp(value - step, min, max));
      }}
    />
  );
}

const Playhead = memo(function Playhead({ ratio }: { ratio: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary"
      style={{ left: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
    >
      <span className="absolute -top-1 -left-[3px] size-[7px] rounded-full bg-primary" />
    </div>
  );
});

export const RenderTracks = memo(function RenderTracks({ project, plan, clips, frame, hasMusic, onSeek, onMotion }: Props) {
  const motion: ChatSceneMotion = { ...DEFAULT_MOTION, ...(project.motion ?? {}) };
  const areaRef = useRef<HTMLDivElement | null>(null);
  const durationSec = plan.durationMs / 1000;
  const pct = (sec: number) => `${Math.min(100, Math.max(0, (sec / Math.max(0.001, durationSec)) * 100))}%`;

  const seek = useCallback(
    (clientX: number) => {
      const el = areaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(Math.round(ratio * (plan.totalFrames - 1)));
    },
    [onSeek, plan.totalFrames],
  );

  const step = durationSec > 60 ? 10 : durationSec > 25 ? 5 : 2;
  const marks: number[] = [];
  for (let s = 0; s <= durationSec + 0.001; s += step) marks.push(s);

  const voices = voiceSchedule(project, plan, clips);
  const nameOf = (id: string) => project.participants.find((p) => p.id === id)?.name ?? "";
  const colorOf = (id: string) => project.participants.find((p) => p.id === id)?.color ?? "#7c5cff";

  return (
    <section className="glass rounded-2xl border border-border p-4" aria-label="Linha do tempo do render">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Linha do tempo</h2>
        <p className="mono-label text-[11px] text-muted-foreground">
          {timeLabel(durationSec)} · {plan.fps} qps · {voices.length}/{plan.entries.length} com voz
        </p>
      </div>

      <div className="flex gap-3">
        <div className="mono-label flex w-20 shrink-0 flex-col gap-2 pt-5 text-[10px] text-muted-foreground">
          <span className="flex h-7 items-center">Fundo</span>
          <span className="flex h-9 items-center">Mensagens</span>
          <span className="flex h-9 items-center">Vozes</span>
          <span className="flex h-7 items-center">Trilha</span>
          <span className="flex h-9 items-center">Efeitos</span>
        </div>

        <div
          ref={areaRef}
          className="relative min-w-0 flex-1 cursor-pointer select-none"
          role="slider"
          tabIndex={0}
          aria-label="Percorrer a cena"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationSec)}
          aria-valuenow={Math.round(frame / plan.fps)}
          onPointerDown={(e) => seek(e.clientX)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") onSeek(Math.min(plan.totalFrames - 1, frame + plan.fps));
            if (e.key === "ArrowLeft") onSeek(Math.max(0, frame - plan.fps));
          }}
        >
          {/* régua */}
          <div className="relative h-5 border-b border-border">
            {marks.map((s) => (
              <span
                key={s}
                className="mono-label absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground"
                style={{ left: pct(s) }}
              >
                {timeLabel(s)}
              </span>
            ))}
          </div>

          {/* fundo */}
          <div className="mt-2 h-7 rounded-md border border-border bg-muted/40">
            <div className="flex h-full items-center gap-2 truncate px-2 text-[11px] text-muted-foreground">
              {backgroundLabel(project.background)}
              {project.background?.kind === "video" && project.background.loop ? " · em loop" : ""}
            </div>
          </div>

          {/* mensagens */}
          <div className="relative mt-2 h-9 rounded-md border border-border bg-muted/20">
            {plan.entries.map((entry, i) => {
              const startSec = entry.appearFrame / plan.fps;
              const endSec = Math.max(entry.endFrame, entry.appearFrame + 1) / plan.fps;
              const message = project.messages.find((m) => m.id === entry.messageId);
              return (
                <div
                  key={entry.messageId}
                  className="absolute inset-y-1 min-w-[3px] overflow-hidden rounded px-1 text-[10px] leading-7 text-background/90"
                  style={{
                    left: pct(startSec),
                    width: `calc(${pct(endSec - startSec)} - 1px)`,
                    background: colorOf(message?.participantId ?? ""),
                  }}
                  title={`${i + 1}. ${nameOf(message?.participantId ?? "")} — ${timeLabel(startSec)}`}
                >
                  <span className="truncate">{message?.text ?? ""}</span>
                </div>
              );
            })}
          </div>

          {/* vozes */}
          <div className="relative mt-2 h-9 rounded-md border border-border bg-muted/20">
            {plan.entries.map((entry) => {
              const item = voices.find((v) => v.id === entry.messageId);
              const message = project.messages.find((m) => m.id === entry.messageId);
              const startSec = entry.appearFrame / plan.fps;
              if (!item) {
                return (
                  <div
                    key={entry.messageId}
                    className="absolute inset-y-3 w-[3px] rounded bg-border"
                    style={{ left: pct(startSec) }}
                    title="Sem voz gerada"
                  />
                );
              }
              return (
                <div
                  key={entry.messageId}
                  className="absolute inset-y-1 min-w-[3px] overflow-hidden rounded border px-1 text-[10px] leading-7"
                  style={{
                    left: pct(item.startSec),
                    width: `calc(${pct(item.durationSec)} - 1px)`,
                    borderColor: colorOf(message?.participantId ?? ""),
                    background: `color-mix(in oklab, ${colorOf(message?.participantId ?? "")} 25%, transparent)`,
                  }}
                  title={`${nameOf(message?.participantId ?? "")} — ${item.durationSec.toFixed(1)}s de fala`}
                >
                  <span className="truncate">{item.durationSec.toFixed(1)}s</span>
                </div>
              );
            })}
          </div>

          {/* trilha de fundo */}
          <div className="mt-2 h-7 rounded-md border border-border bg-muted/40">
            <div className="flex h-full items-center px-2 text-[11px] text-muted-foreground">
              {hasMusic ? "Música tocando do início ao fim, em loop" : "Sem trilha de fundo"}
            </div>
          </div>

          {/* efeitos: entrada no começo, saída no fim, com alças de ajuste */}
          <div className="relative mt-2 h-9 rounded-md border border-border bg-muted/20">
            <div
              className="absolute inset-y-1 left-0 overflow-hidden rounded bg-primary/20 pl-4 text-[10px] leading-7 text-foreground"
              style={{ width: `calc(${pct(motion.enterMs / 1000)} + 16px)` }}
              title="Entrada das mensagens"
            >
              <span className="truncate">entrada {Math.round(motion.enterMs)}ms · força {motion.intensity.toFixed(1)}×</span>
              {onMotion ? (
                <Handle
                  label="Duração da entrada"
                  value={motion.enterMs}
                  min={MOTION_LIMITS.enterMs.min}
                  max={MOTION_LIMITS.enterMs.max}
                  step={10}
                  pxPerUnit={0.25}
                  side="right"
                  format={(v) => `${Math.round(v)} ms`}
                  onChange={(v) => onMotion({ enterMs: v })}
                />
              ) : null}
            </div>

            {onMotion ? (
              <div className="absolute inset-y-1 left-1/2 w-24 -translate-x-1/2 rounded bg-muted/60 pl-4 text-[10px] leading-7">
                <span className="truncate">força {motion.intensity.toFixed(1)}×</span>
                <Handle
                  label="Intensidade dos efeitos"
                  value={motion.intensity}
                  min={MOTION_LIMITS.intensity.min}
                  max={MOTION_LIMITS.intensity.max}
                  step={0.1}
                  pxPerUnit={80}
                  side="left"
                  format={(v) => `${v.toFixed(1)}×`}
                  onChange={(v) => onMotion({ intensity: Math.round(v * 10) / 10 })}
                />
              </div>
            ) : null}

            {motion.exit !== "none" && motion.exitMs > 0 ? (
              <div
                className="absolute inset-y-1 right-0 overflow-hidden rounded bg-destructive/25 pl-4 text-[10px] leading-7 text-foreground"
                style={{ width: `calc(${pct(motion.exitMs / 1000)} + 16px)` }}
                title="Saída da cena"
              >
                <span className="truncate">saída {Math.round(motion.exitMs)}ms</span>
                {onMotion ? (
                  <Handle
                    label="Duração da saída"
                    value={motion.exitMs}
                    min={MOTION_LIMITS.exitMs.min}
                    max={MOTION_LIMITS.exitMs.max}
                    step={50}
                    pxPerUnit={0.25}
                    side="left"
                    format={(v) => `${Math.round(v)} ms`}
                    onChange={(v) => onMotion({ exitMs: v })}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          <Playhead ratio={frame / Math.max(1, plan.totalFrames - 1)} />
        </div>
      </div>
    </section>
  );
});
