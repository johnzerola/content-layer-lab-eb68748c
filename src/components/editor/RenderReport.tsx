/**
 * RENDERIZAÇÃO EM TELA REAL: mostra exatamente o que sai no MP4 — duração de
 * cada corte, de cada keyframe e das transições, além da resolução final.
 * Só leitura/apresentação: nada aqui altera a edição.
 */
import { useMemo } from "react";
import type { PreEdit } from "@/lib/preedit";
import { EXPORT_QUALITIES, loadExportQuality } from "@/lib/editor/export-quality";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

export function RenderReport({
  preedit,
  duration,
  currentTime,
  onSeek,
}: {
  preedit: PreEdit;
  duration: number;
  currentTime: number;
  onSeek: (t: number) => void;
}) {
  const quality = loadExportQuality();
  const q = EXPORT_QUALITIES.find((e) => e.id === quality);
  const segments = useMemo(
    () => (preedit.segments?.length ? preedit.segments : [{ start: 0, end: duration }]),
    [preedit.segments, duration],
  );
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
  const keys = useMemo(() => [...(preedit.keys ?? [])].sort((a, b) => a.t - b.t), [preedit.keys]);
  const transitions = preedit.transitions ?? [];

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl border border-border/60 p-3">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Saída real</p>
        <p className="text-lg font-semibold">{fmt(total)}</p>
        <p className="text-xs text-muted-foreground">
          {segments.length} corte{segments.length > 1 ? "s" : ""} · {Math.round(1080 * (q?.scale ?? 1))}×
          {Math.round(1920 * (q?.scale ?? 1))} · {q?.label ?? "Full HD"} · MP4 H.264 vertical
        </p>
      </div>

      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Cortes</p>
        {segments.map((s, i) => {
          const active = currentTime >= s.start && currentTime <= s.end;
          const t = transitions[i];
          return (
            <button
              key={`${s.start}-${s.end}-${i}`}
              type="button"
              onClick={() => onSeek(s.start)}
              className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-xs ${
                active ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50"
              }`}
            >
              <span>Corte {i + 1}</span>
              <span className="font-mono text-muted-foreground">
                {fmt(s.start)} → {fmt(s.end)} · {(s.end - s.start).toFixed(2)}s
                {t?.kind && t.kind !== "none" ? ` · ${t.kind} ${t.dur?.toFixed(2)}s` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">Keyframes</p>
        {!keys.length && <p className="text-xs text-muted-foreground">Nenhum keyframe — enquadramento fixo.</p>}
        {keys.map((k, i) => {
          const next = keys[i + 1];
          const zoom = (1 / Math.max(0.05, k.crop.w)).toFixed(2);
          return (
            <button
              key={`${k.t}-${i}`}
              type="button"
              onClick={() => onSeek(k.t)}
              className="flex w-full items-center justify-between rounded-lg border border-border/60 px-2 py-1.5 text-xs hover:border-primary/50"
            >
              <span>#{i + 1} · zoom {zoom}x</span>
              <span className="font-mono text-muted-foreground">
                {fmt(k.t)}
                {next ? ` · ${(next.t - k.t).toFixed(2)}s até o próximo` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
        Entrada: {preedit.transIn?.kind ?? "none"} {preedit.transIn?.dur?.toFixed(2) ?? "0.00"}s · Saída:{" "}
        {preedit.transOut?.kind ?? "none"} {preedit.transOut?.dur?.toFixed(2) ?? "0.00"}s
      </div>
    </div>
  );
}
