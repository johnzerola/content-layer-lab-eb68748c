/** Planos do SaaS (pagamento ainda simulado — nenhuma cobrança real acontece). */

export type PlanId = "trial" | "starter" | "creator" | "studio";

export type PlanDef = {
  id: PlanId;
  name: string;
  /** preço mensal em reais (0 = teste grátis) */
  price: number;
  tag: string;
  /** créditos de processamento liberados no período (null = ilimitado) */
  credits: number | null;
  /** duração do período em dias */
  days: number;
  items: string[];
};

export const PLANS: Record<PlanId, PlanDef> = {
  trial: {
    id: "trial",
    name: "Teste grátis",
    price: 0,
    tag: "7 dias",
    credits: 10,
    days: 7,
    items: ["10 exportações", "1 template salvo", "Legendas automáticas"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 47,
    tag: "Testar a esteira",
    credits: 60,
    days: 30,
    items: ["60 exportações/mês", "3 templates salvos", "Legendas automáticas", "Cortes por score"],
  },
  creator: {
    id: "creator",
    name: "Creator",
    price: 97,
    tag: "Mais escolhido",
    credits: null,
    days: 30,
    items: [
      "Exportações ilimitadas",
      "Templates ilimitados + versões",
      "Remoção de legenda e marca d'água",
      "Até 5 variações por vídeo",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    price: 247,
    tag: "Para operação em rede",
    credits: null,
    days: 30,
    items: ["Tudo do Creator", "Biblioteca compartilhada", "Histórico de lotes", "Suporte prioritário"],
  },
};

export const PAID_PLANS: PlanDef[] = [PLANS.starter, PLANS.creator, PLANS.studio];

export function planFromId(id: string | null | undefined): PlanDef {
  return (id && (PLANS as Record<string, PlanDef>)[id]) || PLANS.trial;
}

/** E-mails que sempre enxergam o painel administrativo. */
export const ADMIN_EMAILS = ["admin@vaiviral.com", "johnszerola@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase().replace(/\./g, "");
  return ADMIN_EMAILS.map((e) => e.replace(/\./g, "")).includes(normalized);
}
