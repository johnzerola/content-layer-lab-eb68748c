/** Sincronização automática periódica dos canais conectados (YouTube). */
import { supabase } from "@/integrations/supabase/client";
import { currentUser } from "@/lib/cloud";

export type SyncSchedule = {
  id: string;
  social_account_id: string;
  enabled: boolean;
  interval_minutes: number;
  next_run_at: string;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
};

export const SYNC_INTERVAL_OPTIONS = [
  { value: 0, label: "Desligado" },
  { value: 360, label: "A cada 6 horas" },
  { value: 720, label: "A cada 12 horas" },
  { value: 1440, label: "Uma vez por dia" },
  { value: 10080, label: "Uma vez por semana" },
] as const;

const SELECT =
  "id,social_account_id,enabled,interval_minutes,next_run_at,last_run_at,last_status,last_error";

export async function listSyncSchedules(): Promise<Record<string, SyncSchedule>> {
  const { data, error } = await supabase.from("social_sync_schedules").select(SELECT);
  if (error) throw error;
  const map: Record<string, SyncSchedule> = {};
  for (const row of (data ?? []) as SyncSchedule[]) map[row.social_account_id] = row;
  return map;
}

/** Liga (com intervalo em minutos) ou desliga (0) a sincronização automática do canal. */
export async function setSyncSchedule(accountId: string, intervalMinutes: number) {
  const user = await currentUser();
  if (!user) throw new Error("Faça login para agendar a sincronização.");
  const enabled = intervalMinutes > 0;
  const interval = enabled ? intervalMinutes : 720;
  const nextRun = new Date(Date.now() + interval * 60_000).toISOString();
  const { error } = await supabase.from("social_sync_schedules").upsert(
    {
      user_id: user.id,
      social_account_id: accountId,
      provider: "youtube",
      enabled,
      interval_minutes: interval,
      next_run_at: nextRun,
    },
    { onConflict: "social_account_id" },
  );
  if (error) throw error;
}

export function describeSchedule(schedule?: SyncSchedule): string {
  if (!schedule?.enabled) return "Sincronização automática desligada";
  const label =
    SYNC_INTERVAL_OPTIONS.find((option) => option.value === schedule.interval_minutes)?.label ??
    `A cada ${Math.round(schedule.interval_minutes / 60)}h`;
  const next = new Date(schedule.next_run_at);
  const when = Number.isNaN(next.getTime())
    ? ""
    : ` · próxima ${next.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
  const failure = schedule.last_status === "erro" ? " · última tentativa falhou" : "";
  return `${label}${when}${failure}`;
}
