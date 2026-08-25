/** Assinatura do usuário: período/créditos por plano. Pagamento é simulado. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentUser, onAuth } from "@/lib/cloud";
import { isAdminEmail, planFromId, type PlanId } from "@/lib/plan";

export type Subscription = {
  user_id: string;
  plan: string;
  status: string;
  credits: number;
  period_end: string;
  simulated: boolean;
};

export function isActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (new Date(sub.period_end).getTime() < Date.now()) return false;
  return sub.status === "trial" || sub.status === "ativo";
}

/** Busca a assinatura; cria o teste grátis automaticamente no primeiro acesso. */
export async function getOrCreateSubscription(): Promise<Subscription | null> {
  const user = await currentUser();
  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select("user_id,plan,status,credits,period_end,simulated")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data) return data as Subscription;

  const trial = planFromId("trial");
  const row = {
    user_id: user.id,
    plan: "trial",
    status: "trial",
    credits: trial.credits ?? 0,
    period_end: new Date(Date.now() + trial.days * 86_400_000).toISOString(),
    simulated: true,
  };
  const { data: created, error } = await supabase
    .from("subscriptions")
    .insert(row)
    .select("user_id,plan,status,credits,period_end,simulated")
    .maybeSingle();
  if (error) return row as Subscription;
  return (created ?? row) as Subscription;
}

/** Ativa o plano após o "pagamento" simulado. */
export async function activatePlan(planId: PlanId): Promise<Subscription> {
  const user = await currentUser();
  if (!user) throw new Error("Entre na sua conta para concluir a assinatura.");
  const plan = planFromId(planId);
  const row = {
    user_id: user.id,
    plan: plan.id,
    status: "ativo",
    credits: plan.credits ?? 999_999,
    period_end: new Date(Date.now() + plan.days * 86_400_000).toISOString(),
    simulated: true,
  };
  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id,plan,status,credits,period_end,simulated")
    .maybeSingle();
  if (error) throw error;
  return (data ?? row) as Subscription;
}

/** Consome créditos (planos ilimitados ignoram). Silencioso quando não há sessão. */
export async function consumeCredits(amount = 1): Promise<void> {
  if (amount <= 0) return;
  const sub = await getOrCreateSubscription();
  if (!sub) return;
  if (planFromId(sub.plan).credits === null) return;
  const next = Math.max(0, sub.credits - amount);
  await supabase.from("subscriptions").update({ credits: next }).eq("user_id", sub.user_id);
}

export type AccessState = {
  ready: boolean;
  signedIn: boolean;
  sub: Subscription | null;
  active: boolean;
  isAdmin: boolean;
  refresh: () => void;
};

/** Estado de acesso do usuário logado (plano + permissão de admin). */
export function useAccess(): AccessState {
  const [state, setState] = useState<Omit<AccessState, "refresh">>({
    ready: false,
    signedIn: false,
    sub: null,
    active: false,
    isAdmin: false,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const user = await currentUser();
      if (!alive) return;
      if (!user) {
        setState({ ready: true, signedIn: false, sub: null, active: false, isAdmin: false });
        return;
      }
      const [sub, roles] = await Promise.all([
        getOrCreateSubscription(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      if (!alive) return;
      const admin =
        isAdminEmail(user.email) || (roles.data ?? []).some((r) => r.role === "admin");
      setState({ ready: true, signedIn: true, sub, active: isActive(sub), isAdmin: admin });
    };

    void load();
    const off = onAuth(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, [tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
