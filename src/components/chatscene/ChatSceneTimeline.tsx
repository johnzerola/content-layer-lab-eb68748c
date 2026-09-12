/**
 * Linha do tempo da conversa: cada mensagem vira uma barra com início e fim
 * exatos, antes de renderizar. O clique em qualquer ponto move a prévia para
 * aquele instante — a fonte do tempo é sempre o ConversationClock (plan).
 */
import { useCallback, useRef } from "react";
import type { ConversationPlan } from "@/lib/chatscene/clock";
import type { ChatSceneProject } from "@/lib/chatscene/types";

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

export function ChatSceneTimeline({
  project,
  plan,
  frame,
  selected,
  onSeek,
  onSelect,
}: {
  project: ChatSceneProject;
  plan: ConversationPlan;
  frame: number;
  selected: string | null;
  onSeek: (frame: number) => void;
  onSelect: (id: string | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const total = Math.max(1, plan.totalFrames);
  const durationSec = plan.durationMs / 1000;
  const pct = (f: number) => `${Math.min(100, (f / total) * 100)}%`;

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(Math.round(ratio * total));
    },
    [onSeek, total],
  );

  // marcas de tempo: um traço a cada 5s (ou menos em cenas curtas)
  const step = durationSec > 60 ? 10 : durationSec > 25 ? 5 : 2;
  const marks: number[] = [];
  for (let s = 0; s <= durationSec + 0.001; s += step) marks.push(s);

  return (
    <section className="glass rounded-2xl border border-border p-4" aria-label="Linha do tempo">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Linha do tempo</h2>
        <span className="mono-label text-muted-foreground">
          {fmt(frame / plan.fps)} / {fmt(durationSec)}
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Posição da prévia"
        aria-valuemin={0}
        aria-valuemax={plan.totalFrames}
        aria-valuenow={frame}
        aria-valuetext={`${fmt(frame / plan.fps)} de ${fmt(durationSec)}`}
        className="relative cursor-pointer select-none rounded-lg border border-border bg-background/40 px-2 pb-2 pt-5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seekFromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          const jump = Math.round(plan.fps); // 1s
          if (e.key === "ArrowLeft") onSeek(Math.max(0, frame - jump));
          if (e.key === "ArrowRight") onSeek(Math.min(total, frame + jump));
          if (e.key === "Home") onSeek(0);
          if (e.key === "End") onSeek(total);
        }}
      >
        {/* régua de tempo */}
        <div className="pointer-events-none absolute inset-x-2 top-0 h-4">
          {marks.map((s) => (
            <span
              key={s}
              className="absolute top-0 h-full border-l border-border/70 pl-1 text-[9px] text-muted-foreground"
              style={{ left: pct(s * plan.fps) }}
            >
              {fmt(s)}
            </span>
          ))}
        </div>

        {/* uma pista por mensagem */}
        <div className="space-y-1">
          {project.messages.map((message) => {
            const entry = plan.byId[message.id];
            if (!entry) return null;
            const author = project.participants.find((p) => p.id === message.participantId);
            const color = author?.color ?? "#7c5cff";
            const startSec = entry.appearFrame / plan.fps;
            const endSec = entry.endFrame / plan.fps;
            const active = frame >= entry.appearFrame && frame < entry.endFrame;
            const isSelected = selected === message.id;
            return (
              <button
                key={message.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(message.id);
                  onSeek(entry.appearFrame);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`relative block h-6 w-full rounded transition ${
                  isSelected ? "ring-1 ring-primary" : ""
                }`}
                title={`${author?.name ?? "Sistema"} · entra em ${fmt(startSec)} e sai em ${fmt(endSec)}`}
                aria-label={`Mensagem de ${author?.name ?? "sistema"}, de ${fmt(startSec)} a ${fmt(endSec)}`}
              >
                {/* fundo da pista */}
                <span className="absolute inset-0 rounded bg-background/60" />
                {/* trecho "digitando…" */}
                {entry.typingFrame < entry.appearFrame && (
                  <span
                    className="absolute top-1 h-4 rounded-full opacity-35"
                    style={{
                      left: pct(entry.typingFrame),
                      width: pct(entry.appearFrame - entry.typingFrame),
                      background: `repeating-linear-gradient(45deg, ${color}, ${color} 3px, transparent 3px, transparent 6px)`,
                    }}
                  />
                )}
                {/* bolha no ar */}
                <span
                  className={`absolute top-1 h-4 rounded-full ${active ? "shadow-[0_0_10px_rgba(124,92,255,0.6)]" : ""}`}
                  style={{
                    left: pct(entry.appearFrame),
                    width: pct(Math.max(1, entry.endFrame - entry.appearFrame)),
                    background: color,
                    opacity: active ? 1 : 0.75,
                  }}
                />
                <span className="absolute left-1 top-0 z-10 max-w-[40%] truncate text-[10px] leading-6 text-foreground/80">
                  {author?.name ?? "Sistema"}
                </span>
                <span className="absolute right-1 top-0 z-10 text-[9px] leading-6 text-muted-foreground">
                  {fmt(startSec)}–{fmt(endSec)}
                </span>
              </button>
            );
          })}
        </div>

        {/* cursor da prévia */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-primary"
          style={{ left: `calc(0.5rem + (100% - 1rem) * ${Math.min(1, frame / total)})` }}
        />
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Clique em uma barra para pular a prévia para aquela mensagem; o trecho listrado é o
        “digitando…”. Use as setas do teclado para andar de 1 em 1 segundo.
      </p>
    </section>
  );
}
