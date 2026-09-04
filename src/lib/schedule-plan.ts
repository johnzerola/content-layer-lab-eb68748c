/** Motor puro de distribuição de agendamentos (posts por dia + horários). */

export type SlotMode = "fixed" | "auto";

export type SchedulePlanConfig = {
  /** Data/hora inicial (só a data é usada como primeiro dia elegível). */
  start: Date;
  /** Quantidade de publicações por dia. */
  perDay: number;
  mode: SlotMode;
  /** Horários fixos "HH:MM" (modo fixed). */
  times?: string[];
  /** Janela do modo automático. */
  windowStart?: string;
  windowEnd?: string;
  /** Dias da semana permitidos (0 = domingo). Vazio = todos. */
  weekdays?: number[];
  /** Não agendar antes de "agora" (padrão: true). */
  skipPast?: boolean;
  now?: Date;
};

export function parseTime(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

export function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Horários automáticos espalhados uniformemente dentro da janela. */
export function autoSlots(perDay: number, windowStart = "08:00", windowEnd = "22:00"): string[] {
  const from = parseTime(windowStart) ?? { h: 8, m: 0 };
  const to = parseTime(windowEnd) ?? { h: 22, m: 0 };
  const startMin = from.h * 60 + from.m;
  const endMin = Math.max(to.h * 60 + to.m, startMin);
  const count = Math.max(1, Math.floor(perDay));
  if (count === 1) return [formatTime(from.h, from.m)];
  const step = (endMin - startMin) / (count - 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = Math.round(startMin + step * i);
    out.push(formatTime(Math.floor(total / 60) % 24, total % 60));
  }
  return out;
}

/** Horários do dia, já ordenados e ajustados à quantidade por dia. */
export function daySlots(config: SchedulePlanConfig): string[] {
  const perDay = Math.max(1, Math.floor(config.perDay));
  if (config.mode === "auto") return autoSlots(perDay, config.windowStart, config.windowEnd);
  const parsed = (config.times ?? [])
    .map((t) => parseTime(t))
    .filter((t): t is { h: number; m: number } => Boolean(t))
    .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))
    .map((t) => formatTime(t.h, t.m));
  if (parsed.length === 0) return autoSlots(perDay, config.windowStart, config.windowEnd);
  // Repete/corta a lista até bater com a quantidade por dia.
  const out: string[] = [];
  for (let i = 0; i < perDay; i++) out.push(parsed[i % parsed.length] as string);
  return out.slice(0, perDay);
}

function atTime(day: Date, time: string): Date {
  const parsed = parseTime(time) ?? { h: 9, m: 0 };
  const d = new Date(day);
  d.setHours(parsed.h, parsed.m, 0, 0);
  return d;
}

function allowedWeekday(day: Date, weekdays: number[] | undefined): boolean {
  if (!weekdays || weekdays.length === 0) return true;
  return weekdays.includes(day.getDay());
}

/**
 * Gera `count` datas distribuídas em dias consecutivos elegíveis,
 * respeitando posts/dia, horários e dias da semana permitidos.
 */
export function buildSchedulePlan(count: number, config: SchedulePlanConfig): Date[] {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return [];
  const slots = daySlots(config);
  const now = config.now ?? new Date();
  const skipPast = config.skipPast !== false;

  const out: Date[] = [];
  const day = new Date(config.start);
  day.setHours(0, 0, 0, 0);

  let guard = 0;
  while (out.length < total && guard < 3650) {
    guard++;
    if (allowedWeekday(day, config.weekdays)) {
      for (const slot of slots) {
        if (out.length >= total) break;
        const when = atTime(day, slot);
        if (skipPast && when.getTime() <= now.getTime()) continue;
        out.push(when);
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return out;
}

/** Agrupa o plano por dia para a pré-visualização. */
export function groupPlanByDay(dates: Date[]): { key: string; label: string; items: Date[] }[] {
  const map = new Map<string, Date[]>();
  for (const d of dates) {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = map.get(key);
    if (list) list.push(d);
    else map.set(key, [d]);
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: (items[0] as Date).toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }),
    items,
  }));
}

/** Ordena arquivos por nome (A-Z), numericamente quando possível. */
export function sortByName<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" }));
}

export type MediaType = "video" | "image";

export function mediaTypeOf(file: { type?: string; name: string }): MediaType {
  if (file.type?.startsWith("image/")) return "image";
  if (file.type?.startsWith("video/")) return "video";
  return /\.(jpe?g|png|webp|heic|gif)$/i.test(file.name) ? "image" : "video";
}
