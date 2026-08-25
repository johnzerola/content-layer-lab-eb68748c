import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequireAuth } from "@/components/RequireAuth";
import { PAID_PLANS, planFromId, type PlanId } from "@/lib/plan";
import { activatePlan } from "@/lib/subscription";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  validateSearch: (s: Record<string, unknown>) => ({
    plano: typeof s['plano'] === "string" ? (s['plano'] as string) : "creator",
  }),
  head: () => ({
    meta: [
      { title: "Checkout — assine o VaiViral" },
      {
        name: "description",
        content: "Escolha seu plano do VaiViral e libere o acesso à esteira de vídeos em lote, cortes e legendas.",
      },
      { property: "og:title", content: "Checkout — assine o VaiViral" },
      { property: "og:description", content: "Escolha o plano e comece a produzir vídeos em massa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function CheckoutPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link to="/vendas" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar para os planos
      </Link>
      <RequireAuth
        title="Crie sua conta para assinar"
        description="O cadastro leva 10 segundos. Depois você escolhe o plano e entra no sistema."
      >
        <CheckoutForm />
      </RequireAuth>
    </main>
  );
}

function CheckoutForm() {
  const { plano } = Route.useSearch();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<PlanId>((planFromId(plano).id as PlanId) ?? "creator");
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState({ name: "", number: "", exp: "", cvv: "" });

  const plan = planFromId(selected);

  const pay = async () => {
    if (!card.name.trim() || card.number.replace(/\D/g, "").length < 12) {
      toast.error("Preencha os dados do cartão (simulação, nenhum dado é enviado).");
      return;
    }
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await activatePlan(selected);
      toast.success(`Pagamento simulado aprovado — plano ${plan.name} ativo.`);
      void navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ativar o plano.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Escolha seu plano</h1>
        {PAID_PLANS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={`w-full rounded-2xl border p-5 text-left transition ${
              selected === p.id
                ? "border-primary/50 bg-accent shadow-[var(--shadow-glow)]"
                : "border-border bg-surface/50 hover:bg-surface-2"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold">{p.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{p.tag}</p>
              </div>
              <p className="font-display text-2xl font-semibold">
                R$ {p.price}
                <span className="ml-1 text-xs font-normal text-muted-foreground">/mês</span>
              </p>
            </div>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {p.items.map((i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" /> {i}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[10px] text-muted-foreground">
              {p.credits === null ? "créditos ilimitados" : `${p.credits} créditos de processamento`} · {p.days} dias
            </p>
          </button>
        ))}
      </section>

      <aside className="h-fit rounded-2xl border border-border bg-surface/60 p-5">
        <p className="mono-label flex items-center gap-2 text-primary">
          <CreditCard className="size-3.5" /> pagamento simulado
        </p>
        <h2 className="mt-2 font-display text-lg font-bold">Finalizar assinatura</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ambiente de demonstração: nenhum cartão é cobrado e nada é armazenado.
        </p>

        <div className="mt-4 space-y-3">
          <Input
            placeholder="Nome no cartão"
            value={card.name}
            onChange={(e) => setCard({ ...card, name: e.target.value })}
          />
          <Input
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            value={card.number}
            onChange={(e) => setCard({ ...card, number: e.target.value })}
          />
          <div className="flex gap-3">
            <Input
              placeholder="MM/AA"
              value={card.exp}
              onChange={(e) => setCard({ ...card, exp: e.target.value })}
            />
            <Input
              placeholder="CVV"
              value={card.cvv}
              onChange={(e) => setCard({ ...card, cvv: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Total hoje</span>
          <span className="font-display text-xl font-semibold">R$ {plan.price}</span>
        </div>

        <Button className="mt-4 w-full" disabled={busy} onClick={pay}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          Pagar e entrar no sistema
        </Button>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" /> Integração de pagamento real ainda não conectada.
        </p>
      </aside>
    </div>
  );
}
