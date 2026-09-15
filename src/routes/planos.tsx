import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Check, CreditCard, Info, QrCode, ShieldCheck, Sparkles } from "lucide-react";

import { LandingShell } from "@/components/landing/LandingShell";
import { Reveal } from "@/components/landing/Reveal";
import { PAID_PLANS, PLANS } from "@/lib/plan";

export const Route = createFileRoute("/planos")({
  component: PlansPage,
  head: () => ({
    meta: [
      { title: "Planos e preços — VaiViral" },
      {
        name: "description",
        content:
          "Compare os planos do VaiViral: exportações, templates, remoção de marca d'água e publicação. Assine em minutos e comece a gerar clipes com IA.",
      },
      { property: "og:title", content: "Planos e preços — VaiViral" },
      {
        property: "og:description",
        content: "Starter, Creator e Studio: escolha o plano, entre na sua conta e libere o estúdio de vídeos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const PAYMENTS = [
  { icon: CreditCard, t: "Cartão de crédito", d: "Assinatura mensal ou anual, renovação automática." },
  { icon: QrCode, t: "Pix", d: "Pagamento à vista do plano anual, liberação no mesmo dia." },
  { icon: ShieldCheck, t: "Sem fidelidade", d: "Cancele quando quiser, direto na sua conta." },
];

const INCLUDED = [
  "Cortes automáticos por score",
  "Legendas karaokê queimadas",
  "Reenquadramento 9:16, 4:5 e 1:1",
  "Editor visual com timeline",
  "Exportação MP4 1080×1920",
  "Publicação nas redes conectadas",
];

function PlansPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <LandingShell>
      {/* hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-14 text-center md:pt-20">
        <Reveal>
          <span className="lp-glass mono-label inline-flex items-center gap-2 rounded-full px-3 py-1.5">
            <span className="auth-live size-1.5 rounded-full bg-primary" />
            planos e pagamento
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-[clamp(2.2rem,4.6vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
            Escolha o plano e comece a{" "}
            <span className="bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">
              gerar clipes hoje
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Sem contrato, sem taxa de instalação. Você entra na sua conta, escolhe o plano e o estúdio libera na
            hora.
          </p>
        </Reveal>

        <Reveal delay={90}>
          <div
            role="tablist"
            aria-label="Periodicidade"
            className="lp-glass relative mx-auto mt-8 grid w-[16rem] grid-cols-2 rounded-xl p-1"
          >
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-primary transition-transform duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ transform: annual ? "translateX(100%)" : "none" }}
            />
            {[
              { l: "Mensal", v: false },
              { l: "Anual −20%", v: true },
            ].map((o) => (
              <button
                key={o.l}
                role="tab"
                aria-selected={annual === o.v}
                onClick={() => setAnnual(o.v)}
                className={`relative z-10 min-h-10 rounded-lg px-4 text-xs font-medium transition-colors ${
                  annual === o.v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </Reveal>
      </section>

      {/* planos */}
      <section className="mx-auto max-w-6xl px-5 pb-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {PAID_PLANS.map((p, i) => {
            const monthly = annual ? Math.round(p.price * 0.8) : p.price;
            const featured = p.id === "creator";
            return (
              <Reveal key={p.id} delay={i * 80}>
                <article
                  className={`lp-glass lp-hover relative flex h-full flex-col rounded-2xl p-6 ${
                    featured ? "lp-ring lg:-mt-4 lg:pb-8" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-bold">{p.name}</h2>
                    <span className={`mono-label !text-[0.62rem] ${featured ? "!text-[color:var(--primary)]" : ""}`}>
                      {p.tag}
                    </span>
                  </div>

                  <p className="mt-5 flex items-end gap-1.5">
                    <span key={monthly} className="pop-in lp-stat font-display text-4xl font-extrabold tracking-tight">
                      R$ {monthly}
                    </span>
                    <span className="pb-1.5 text-xs text-muted-foreground">/mês</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {annual
                      ? `R$ ${monthly * 12} por ano, à vista no Pix ou em 12x no cartão`
                      : "cobrança mensal no cartão, cancele quando quiser"}
                  </p>

                  <ul className="mt-6 space-y-2.5">
                    {p.items.map((it) => (
                      <li key={it} className="flex gap-2.5 text-sm text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {it}
                      </li>
                    ))}
                    <li className="flex gap-2.5 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {p.credits === null ? "Créditos de processamento ilimitados" : `${p.credits} créditos por mês`}
                    </li>
                  </ul>

                  <Link
                    to="/checkout"
                    search={{ plano: p.id }}
                    className={`mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-transform duration-200 hover:-translate-y-px ${
                      featured
                        ? "lp-cta-glow bg-primary text-primary-foreground"
                        : "border border-border text-foreground hover:bg-surface"
                    }`}
                  >
                    Entrar e assinar <ArrowRight className="size-4" />
                  </Link>
                </article>
              </Reveal>
            );
          })}
        </div>

        {/* teste grátis */}
        <Reveal delay={120}>
          <div className="lp-glass mt-4 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center">
            <span className="lp-chip3d lp-spin3d shrink-0">
              <Sparkles />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold">
                {PLANS.trial.name} · {PLANS.trial.tag}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {PLANS.trial.items.join(" · ")}. Sem cartão para começar.
              </p>
            </div>
            <Link
              to="/checkout"
              search={{ plano: "trial" }}
              className="lp-glass lp-hover ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-semibold"
            >
              Testar grátis <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
      </section>

      {/* pagamento */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <Reveal>
          <div className="max-w-2xl">
            <span className="mono-label">forma de pagamento</span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em]">
              Pague do jeito que preferir.
            </h2>
          </div>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PAYMENTS.map((p, i) => (
            <Reveal key={p.t} delay={i * 80}>
              <div className="lp-glass lp-hover h-full rounded-2xl p-5">
                <span className="lp-chip3d !size-11 !rounded-xl">
                  <p.icon />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-bold">{p.t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={100}>
          <p className="lp-glass mt-4 flex items-start gap-3 rounded-2xl p-4 text-[13px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            A cobrança automática ainda está em ativação. Por enquanto, ao concluir o cadastro o acesso é liberado
            para uso e nenhuma cobrança é feita no seu cartão.
          </p>
        </Reveal>
      </section>

      {/* incluído em todos */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal>
          <div className="lp-glass lp-ring relative overflow-hidden rounded-3xl p-6 md:p-10">
            <span aria-hidden className="lp-orb absolute -right-16 -top-20 size-56 opacity-60" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_1fr]">
              <div>
                <span className="mono-label">em todos os planos</span>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-[-0.03em] md:text-[2rem]">
                  O estúdio completo, sem recurso escondido atrás de upgrade.
                </h2>
                <Link
                  to="/editor-demo"
                  className="lp-glass lp-hover mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold"
                >
                  Ver o editor funcionando <ArrowRight className="size-4" />
                </Link>
              </div>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {INCLUDED.map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[14px] text-muted-foreground">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
    </LandingShell>
  );
}
