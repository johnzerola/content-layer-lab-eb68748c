/**
 * Conversão de horário local <-> UTC para agendamentos.
 * O usuário escolhe a hora de parede + o fuso; salvamos sempre o instante UTC,
 * assim o horário real de publicação não depende do fuso do servidor.
 */

export const TIMEZONE_OPTIONS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Bahia",
  "America/Recife",
  "America/Noronha",
  "America/Rio_Branco",
  "America/New_York",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Buenos_Aires",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Africa/Luanda",
  "Asia/Tokyo",
  "UTC",
] as const;

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function tzOffsetMs(utc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(utc).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"] === "24" ? "0" : parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return asUtc - utc.getTime();
}

/** Converte "2026-09-05T14:30" (hora de parede) no fuso escolhido para o instante UTC real. */
export function wallTimeToUtc(localInput: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localInput);
  if (!match) return new Date(NaN);
  const [, y, mo, d, h, mi] = match;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  // Duas passagens resolvem corretamente as bordas de horário de verão.
  let utc = naive - tzOffsetMs(new Date(naive), timeZone);
  utc = naive - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** Converte um instante para a string usada em <input type="datetime-local"> no fuso escolhido. */
export function utcToWallTime(date: Date, timeZone: string): string {
  const offset = tzOffsetMs(date, timeZone);
  return new Date(date.getTime() + offset).toISOString().slice(0, 16);
}

export function formatInTimezone(
  value: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "—";
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: tz }).format(date);
}

export function timezoneLabel(timeZone: string): string {
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  const short = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  return short ? `${tz} (${short})` : tz;
}
