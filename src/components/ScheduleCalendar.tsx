import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KIND_LABEL, type ScheduledPost } from "@/lib/social";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DOT_TONE: Record<string, string> = {
  agendado: "bg-primary",
  processando: "bg-amber-400",
  publicado: "bg-emerald-400",
  falhou: "bg-red-400",
  cancelado: "bg-muted-foreground",
};

function dayKey(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export type ScheduleCalendarProps = {
  posts: ScheduledPost[];
  /** dia selecionado no formato YYYY-MM-DD, ou null para "todos" */
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
};

/**
 * Calendário mensal de publicações — apenas apresentação/filtro visual.
 * Não altera nenhum dado: recebe a mesma lista já carregada pela agenda.
 */
export function ScheduleCalendar({ posts, selectedDay, onSelectDay }: ScheduleCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of posts) {
      const k = dayKey(p.scheduled_at);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
      );
    }
    return map;
  }, [posts]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const todayKey = dayKey(new Date());

  function shift(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  return (
    <section
      className="rounded-2xl border border-border/70 bg-surface/60 p-4 sm:p-5"
      aria-label="Calendário de publicações"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <h3 className="font-display text-base font-semibold capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Mês anterior"
            className="interactive grid size-11 place-items-center rounded-xl border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              onSelectDay(null);
            }}
            className="interactive inline-flex h-11 items-center rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Próximo mês"
            className="interactive grid size-11 place-items-center rounded-xl border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Dias do mês">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            role="columnheader"
            className="pb-1 text-center text-[11px] font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}

        {cells.map((d) => {
          const k = dayKey(d);
          const list = byDay.get(k) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = k === todayKey;
          const isSelected = selectedDay === k;
          const label = d.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          });

          return (
            <button
              key={k}
              type="button"
              role="gridcell"
              aria-pressed={isSelected}
              aria-label={`${label} — ${list.length} ${list.length === 1 ? "publicação" : "publicações"}`}
              onClick={() => onSelectDay(isSelected ? null : k)}
              className={[
                "interactive flex min-h-11 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-center transition",
                isSelected
                  ? "border-primary bg-primary/15"
                  : "border-transparent hover:border-border hover:bg-surface-2",
                inMonth ? "text-foreground" : "text-muted-foreground/60",
              ].join(" ")}
            >
              <span
                className={[
                  "grid size-6 place-items-center rounded-full text-[12px] tabular-nums",
                  isToday ? "bg-primary text-primary-foreground font-semibold" : "",
                ].join(" ")}
              >
                {d.getDate()}
              </span>
              <span className="flex h-2 items-center gap-0.5" aria-hidden="true">
                {list.slice(0, 4).map((p) => (
                  <span
                    key={p.id}
                    className={`size-1.5 rounded-full ${DOT_TONE[p.status] ?? "bg-muted-foreground"}`}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </p>
            <button
              type="button"
              onClick={() => onSelectDay(null)}
              className="inline-flex h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Ver tudo
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {(byDay.get(selectedDay) ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-[12px]">
                <span className="tabular-nums text-muted-foreground">
                  {new Date(p.scheduled_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="truncate">
                  {KIND_LABEL[p.kind] ?? p.kind} · {p.file_name ?? "vídeo"}
                </span>
              </li>
            ))}
            {!(byDay.get(selectedDay) ?? []).length && (
              <li className="text-[12px] text-muted-foreground">Nenhuma publicação neste dia.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
