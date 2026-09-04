import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Sparkles, Clock } from "lucide-react";
import { useAccess } from "@/lib/subscription";
import { planFromId } from "@/lib/plan";

/** Bloqueia o app quando o usuário logado está sem plano/período ativo. */
export function PlanGate({ children }: { children: ReactNode }) {
  const { ready, signedIn, sub, active } = useAccess();

  if (!signedIn) return <>{children}</>;

  if (!ready) {
    return (
      <div className="grid min-h-60 place-items-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (active) return <>{children}</>;

  const plan = planFromId(sub?.plan);
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface/60 p-8 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-7" />
      </div>
      <h2 className="font-display text-2xl font-bold tracking-tight">Seu acesso terminou</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {sub
          ? `O período do plano ${plan.name} acabou${sub.credits <= 0 ? " e seus créditos zeraram" : ""}. Escolha um plano para continuar produzindo.`
          : "Escolha um plano para liberar a esteira de produção."}
      </p>
      <Link
        to="/checkout"
        search={{ plano: "creator" }}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Ver planos
      </Link>
      <p className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Clock className="size-3.5" /> Pagamento em modo simulado.
      </p>
    </div>
  );
}
