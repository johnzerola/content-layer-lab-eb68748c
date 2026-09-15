import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  BarChart3,
  Captions,
  Check,
  Eraser,
  FileArchive,
  Gauge,
  Languages,
  Layers,
  Link2,
  Minus,
  Plus,
  Repeat,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wand2,
} from "lucide-react";

import { EditorMockup } from "@/components/landing/EditorMockup";
import { FloatingChips } from "@/components/landing/FloatingChips";
import { Reveal } from "@/components/landing/Reveal";
import { Stat } from "@/components/landing/Stat";

export const Route = createFileRoute("/vendas")({
  component: SalesPage,
  head: () => ({
    meta: [
      { title: "VaiViral — Edite vídeos com IA e gere clipes virais" },
      {
        name: "description",
        content:
          "Transforme vídeos longos em clipes verticais prontos para postar: cortes por IA, legendas automáticas, reenquadramento 9:16, remoção de silêncio e publicação em lote.",
      },
      { property: "og:title", content: "VaiViral — Edite vídeos com IA e gere clipes virais" },
      {
        property: "og:description",
        content:
          "Cortes automáticos, legendas karaokê, reenquadramento inteligente e exportação em lote para Reels, TikTok e Shorts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const NAV = [
  { label: "Como funciona", href: "#fluxo" },
  { label: "Recursos", href: "#recursos" },
  { label: "Números", href: "#numeros" },
  { label: "Planos", href: "/planos" },
  { label: "FAQ", href: "#faq" },
];

const PROOF = [
  "Instagram Reels",
  "TikTok",
  "YouTube Shorts",
  "Kwai",
  "Facebook",
  "Podcasts",
  "Lives",
  "Webinars",
];

const BENEFITS = [
  {
    icon: Scissors,
    t: "Vídeo longo vira clipe curto",
    d: "A IA lê a transcrição, acha os picos de atenção e devolve cortes prontos com nota de potencial.",
  },
  {
    icon: Captions,
    t: "Legendas automáticas",
    d: "Transcrição palavra a palavra com estilos karaokê, pop, typewriter e highlight — queimadas no vídeo.",
  },
  {
    icon: Layers,
    t: "Reenquadramento inteligente",
    d: "De 16:9 para 9:16, 4:5 ou 1:1 mantendo o rosto e a ação sempre no centro do quadro.",
  },
  {
    icon: AudioLines,
    t: "Remoção de silêncio",
    d: "Pausas, respiros e travadas somem automaticamente. O ritmo fica de vídeo curto, não de gravação.",
  },
  {
    icon: Sparkles,
    t: "B-roll e efeitos por IA",
    d: "Sugestões de cobertura, stickers de CTA e efeitos que entram e saem no tempo certo da fala.",
  },
  {
    icon: Wand2,
    t: "Editor visual estilo Canva",
    d: "Camadas livres, keyframes, arrastar e soltar, undo/redo e preview 9:16 em tempo real.",
  },
  {
    icon: Repeat,
    t: "Anti-duplicidade real",
    d: "Cada saída recebe variação própria de enquadramento, velocidade, grão e metadados.",
  },
  {
    icon: FileArchive,
    t: "Lote e publicação",
    d: "Centenas de arquivos numa fila só, com agenda e publicação direta nas redes conectadas.",
  },
];

const FLOW = [
  { n: "01", t: "Envie seu vídeo", d: "Arraste arquivos, uma pasta inteira ou cole o link do YouTube e de lives." },
  { n: "02", t: "A IA analisa", d: "Transcrição, ganchos, picos de emoção e silêncios mapeados automaticamente." },
  { n: "03", t: "Gere os clipes", d: "Cortes, legendas, reenquadramento e seu template aplicados de uma vez." },
  { n: "04", t: "Exporte e publique", d: "MP4 1080×1920 pronto, download em lote ou direto na agenda das suas contas." },
];

const ADVANCED = [
  {
    tag: "clipes",
    t: "Clipagem por score, não por sorte",
    d: "Cada trecho recebe uma nota baseada em gancho, densidade de fala e reação. Você escolhe a duração mínima e máxima e recebe só o que tem chance real de performar.",
    items: ["Ganchos nos primeiros 3 segundos", "Duração ajustável por plataforma", "Preview antes de exportar"],
    icon: Scissors,
  },
  {
    tag: "voz e idiomas",
    t: "Dublagem, vozes e áudio limpo",
    d: "Vozes por personagem em português natural, ajuste de energia e ritmo, separação de faixas e normalização automática do áudio.",
    items: ["Vozes com timbre próprio", "Separação de música e voz", "Volume equilibrado em todas as saídas"],
    icon: Languages,
  },
  {
    tag: "escala",
    t: "Templates, equipe e publicação",
    d: "Monte o template uma vez e aplique em centenas de vídeos. Perfis e canais separados, agenda por horário e métricas de cada publicação.",
    items: ["Templates versionados", "Vários perfis e canais", "Agenda e métricas integradas"],
    icon: Users,
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "R$ 47",
    tag: "Testar a esteira",
    items: ["60 exportações/mês", "3 templates salvos", "Legendas automáticas", "Cortes por score"],
    cta: "Começar",
    featured: false,
  },
  {
    name: "Creator",
    price: "R$ 97",
    tag: "Mais escolhido",
    items: [
      "Exportações ilimitadas",
      "Templates ilimitados + versões",
      "Remoção de legenda e marca d'água",
      "Até 5 variações por vídeo",
      "Presets Reels / TikTok / Shorts",
    ],
    cta: "Assinar o Creator",
    featured: true,
  },
  {
    name: "Studio",
    price: "R$ 247",
    tag: "Para operação em rede",
    items: ["Tudo do Creator", "Biblioteca compartilhada na nuvem", "Histórico de lotes", "Suporte prioritário"],
    cta: "Falar com o time",
    featured: false,
  },
];

const FAQ = [
  {
    q: "Preciso saber editar vídeo?",
    a: "Não. Você envia o vídeo, a IA devolve os clipes prontos com legenda e enquadramento. O editor visual existe para quem quiser ajustar detalhes, não para quem precisa começar do zero.",
  },
  {
    q: "Os vídeos saem realmente diferentes entre si?",
    a: "Sim. Cada saída recebe uma combinação própria de espelhamento, velocidade, pitch, grão, brilho, moldura e metadados. Você vê a diferença no preview antes de processar.",
  },
  {
    q: "A remoção de legenda estraga a imagem?",
    a: "A remoção usa reconstrução de textura em vez de desfoque, então a área limpa acompanha o fundo ao redor. Há comparação lado a lado antes de exportar.",
  },
  {
    q: "Onde o vídeo é renderizado?",
    a: "O lote comum é renderizado no seu navegador. Recursos como limpeza por IA, importação por link e agenda enviam arquivos para o servidor apenas quando você aciona esses fluxos.",
  },
  {
    q: "Serve para qual formato?",
    a: "Reels, TikTok, Shorts e Kwai em 9:16, além de 1:1, 4:5 e 16:9 com enquadramento automático conforme a origem.",
  },
];

function SalesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Ambience />
      <Header />
      <main>
        <Hero />
        <SocialProof />
        <Benefits />
        <Demo />
        <Flow />
        <Advanced />
        <Numbers />
        <Compare />
        <Plans />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/** Luz ambiente, grade e grão de fundo. */
function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0 opacity-[0.6]"
        style={{
          background:
            "radial-gradient(900px 540px at 78% -12%, color-mix(in oklab, var(--primary) 24%, transparent), transparent 70%), radial-gradient(760px 440px at 4% 6%, color-mix(in oklab, var(--cyan) 12%, transparent), transparent 72%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.13]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--foreground) 10%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 10%, transparent) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(80% 60% at 50% 0%, black, transparent 85%)",
        }}
      />
    </div>
  );
}

function Header() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        solid ? "border-b border-border/70 bg-background/75 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link to="/vendas" className="flex min-w-0 items-center gap-2">
          <span className="auth-logo grid size-7 shrink-0 place-items-center rounded-lg text-primary-foreground">
            <span className="font-display text-sm font-bold">V</span>
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">VaiViral</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <Link
          to="/"
          className="lp-cta-glow ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-px md:ml-0"
        >
          Abrir estúdio <ArrowRight className="size-4" />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-14 md:pb-24 md:pt-20">
      <FloatingChips />
      <div className="relative grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr]">
        <Reveal className="min-w-0">
          <span className="lp-glass mono-label inline-flex items-center gap-2 rounded-full px-3 py-1.5">
            <span className="auth-live size-1.5 rounded-full bg-primary" />
            edição de vídeo com IA
          </span>

          <h1 className="mt-6 font-display text-[clamp(2.4rem,5.2vw,4.2rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
            Transforme vídeos longos em
            <span className="block bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">
              clipes virais em minutos.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground md:text-base">
            A IA corta, legenda, reenquadra em 9:16, tira os silêncios e aplica seu branding — em um vídeo
            ou em centenas de uma vez. Você só escolhe o que publicar.
          </p>

          {/* área simulando envio */}
          <div className="lp-glass lp-ring mt-8 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-[13px] text-muted-foreground">
              <Link2 className="size-4 shrink-0 text-primary" />
              <span className="truncate">Cole o link do vídeo ou arraste seus arquivos</span>
            </span>
            <Link
              to="/"
              className="lp-cta-glow inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <Upload className="size-4" /> Gerar meus clipes
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/checkout"
              search={{ plano: "creator" }}
              className="lp-cta-glow group inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5"
            >
              Começar agora
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/editor-demo"
              className="lp-glass lp-hover inline-flex h-12 items-center rounded-xl px-6 text-sm font-medium text-foreground/90"
            >
              Abrir o editor de demonstração
            </Link>
          </div>
          <p className="mono-label mt-5">sem instalar nada · exporta mp4 1080×1920 · reels, tiktok e shorts</p>
        </Reveal>

        <Reveal delay={120} className="lp-scene min-w-0">
          <div className="lp-rotate">
            <EditorMockup />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="relative z-10 border-y border-border/60 bg-surface/30 py-6">
      <div className="mx-auto max-w-6xl px-5 text-center">
        <p className="text-[13px] text-muted-foreground">
          Usado por criadores, agências e equipes que publicam todos os dias
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5">
          {PROOF.map((p) => (
            <span key={p} className="mono-label">
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHead({ tag, title, sub }: { tag: string; title: string; sub?: string }) {
  return (
    <div className="max-w-2xl">
      <span className="mono-label">{tag}</span>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] md:text-[2.6rem] md:leading-[1.08]">
        {title}
      </h2>
      {sub ? <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Benefits() {
  return (
    <section id="recursos" className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Reveal>
        <SectionHead
          tag="benefícios"
          title="Tudo que trava a edição virou um botão."
          sub="Do vídeo bruto ao clipe publicado, sem pular de ferramenta em ferramenta."
        />
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((b, i) => (
          <Reveal key={b.t} delay={(i % 4) * 70}>
            <article className="lp-glass lp-hover h-full rounded-2xl p-5">
              <span className="lp-chip3d !size-11 !rounded-xl">
                <b.icon />
              </span>
              <h3 className="mt-4 font-display text-[15px] font-bold tracking-tight">{b.t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{b.d}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section id="demo" className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-24">
      <Reveal>
        <SectionHead
          tag="por dentro"
          title="O editor faz o trabalho pesado na sua frente."
          sub="Timeline com cortes detectados, legenda sincronizada, clipes pontuados e o preview vertical sempre visível."
        />
      </Reveal>
      <div className="mt-12 grid items-center gap-8 lg:grid-cols-[1.15fr_.85fr]">
        <Reveal>
          <EditorMockup />
        </Reveal>
        <Reveal delay={120}>
          <ul className="space-y-3">
            {[
              ["Timeline inteligente", "Os trechos com maior chance de viralizar já vêm marcados."],
              ["Legenda sincronizada", "Palavra a palavra, no estilo que combina com o seu canal."],
              ["Clipes pontuados", "Uma nota por corte para você publicar primeiro o que rende mais."],
              ["Preview 9:16 real", "O que aparece na tela é exatamente o que sai no arquivo final."],
            ].map(([t, d]) => (
              <li key={t} className="lp-glass lp-hover flex gap-3 rounded-2xl p-4">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--primary-subtle)] text-primary">
                  <Check className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{t}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function Flow() {
  return (
    <section id="fluxo" className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Reveal>
        <SectionHead tag="como funciona" title="Quatro passos entre o arquivo bruto e o post no ar." />
      </Reveal>
      <div className="relative mt-12">
        <span aria-hidden className="lp-line absolute inset-x-8 top-[3.25rem] hidden h-px lg:block" />
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <li className="lp-glass lp-hover relative h-full rounded-2xl p-6">
                <span className="lp-stat font-display text-2xl font-extrabold">{s.n}</span>
                <h3 className="mt-3 font-display text-[16px] font-bold tracking-tight">{s.t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.d}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Advanced() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl space-y-16 px-5 py-20 md:space-y-24 md:py-24">
      {ADVANCED.map((a, i) => (
        <Reveal key={a.t}>
          <div
            className={`grid items-center gap-8 lg:grid-cols-2 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}
          >
            <div>
              <span className="mono-label">{a.tag}</span>
              <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.025em] md:text-[2rem] md:leading-[1.1]">
                {a.t}
              </h3>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">{a.d}</p>
              <ul className="mt-6 space-y-2.5">
                {a.items.map((it) => (
                  <li key={it} className="flex items-start gap-2.5 text-[14px] text-muted-foreground">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-glass lp-ring relative grid min-h-[16rem] place-items-center overflow-hidden rounded-3xl p-8">
              <span aria-hidden className="lp-orb absolute -right-10 -top-10 size-40 opacity-70" />
              <span className="lp-float lp-chip3d lp-spin3d !size-24 !rounded-3xl">
                <a.icon />
              </span>
            </div>
          </div>
        </Reveal>
      ))}
    </section>
  );
}

function Numbers() {
  return (
    <section id="numeros" className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-24">
      <Reveal>
        <SectionHead tag="pelos números" title="Volume que operação manual não alcança." />
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { value: 400, suffix: "+", label: "vídeos processados por lote" },
          { value: 9, suffix: "x", label: "mais rápido que editar à mão" },
          { value: 1080, suffix: "p", label: "exportação vertical em alta" },
          { value: 5, suffix: " redes", label: "destinos de publicação" },
        ].map((s, i) => (
          <Reveal key={s.label} delay={i * 80}>
            <Stat value={s.value} suffix={s.suffix} label={s.label} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Compare() {
  const rows: Array<[string, string, string]> = [
    ["Editar 100 cortes", "~14 h no editor", "1 lote, um clique"],
    ["Legendar", "manual, corte a corte", "transcrição + karaokê automático"],
    ["Reenquadrar para 9:16", "recortar cada vídeo", "enquadramento que segue o rosto"],
    ["Repostar sem duplicar", "gambiarra manual", "variação assinada por arquivo"],
    ["Padronizar identidade", "copiar e colar camadas", "template versionado"],
  ];
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-24">
      <Reveal>
        <SectionHead tag="comparação" title="O mesmo dia de trabalho, outro resultado." />
      </Reveal>
      <Reveal delay={90}>
        <div className="lp-glass mt-10 overflow-hidden rounded-2xl">
          <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-4 border-b border-border px-4 py-4 md:px-6">
            <span className="mono-label">tarefa</span>
            <span className="mono-label">do jeito manual</span>
            <span className="mono-label !text-[color:var(--primary)]">com vaiviral</span>
          </div>
          {rows.map(([a, b, c]) => (
            <div
              key={a}
              className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-4 border-b border-border/50 px-4 py-4 last:border-b-0 md:px-6"
            >
              <span className="text-[13px] font-medium md:text-sm">{a}</span>
              <span className="flex items-start gap-2 text-[13px] text-muted-foreground md:text-sm">
                <Minus className="mt-1 size-3.5 shrink-0" />
                {b}
              </span>
              <span className="flex items-start gap-2 text-[13px] text-foreground md:text-sm">
                <Check className="mt-1 size-3.5 shrink-0 text-primary" />
                {c}
              </span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Plans() {
  const [annual, setAnnual] = useState(false);
  return (
    <section id="planos" className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHead tag="planos" title="Preço fixo, volume livre." />
        <div
          role="tablist"
          aria-label="Periodicidade"
          className="lp-glass relative grid w-[15.5rem] shrink-0 grid-cols-2 self-start rounded-xl p-1"
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
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {PLANS.map((p, i) => {
          const base = Number(p.price.replace(/\D/g, ""));
          const value = annual ? Math.round(base * 0.8) : base;
          return (
            <Reveal key={p.name} delay={i * 80}>
              <article
                className={`lp-glass lp-hover relative flex h-full flex-col rounded-2xl p-6 ${
                  p.featured ? "lp-ring lg:-mt-4 lg:pb-8" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-bold">{p.name}</h3>
                  <span className={`mono-label !text-[0.62rem] ${p.featured ? "!text-[color:var(--primary)]" : ""}`}>
                    {p.tag}
                  </span>
                </div>
                <p className="mt-5 flex items-end gap-1.5">
                  <span key={value} className="pop-in font-display text-4xl font-extrabold tracking-tight">
                    R$ {value}
                  </span>
                  <span className="pb-1.5 text-xs text-muted-foreground">/mês</span>
                </p>
                <ul className="mt-6 space-y-2.5">
                  {p.items.map((it) => (
                    <li key={it} className="flex gap-2.5 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {it}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/checkout"
                  search={{ plano: p.name.toLowerCase() }}
                  className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold transition-transform duration-200 hover:-translate-y-px ${
                    p.featured
                      ? "lp-cta-glow bg-primary text-primary-foreground"
                      : "border border-border text-foreground hover:bg-surface"
                  }`}
                >
                  {p.cta}
                </Link>
              </article>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" /> Transparência sobre quando o servidor é usado
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Gauge className="size-4 text-primary" /> Cancele quando quiser
        </span>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative z-10 mx-auto max-w-3xl px-5 py-20 md:py-24">
      <SectionHead tag="faq" title="Perguntas antes de gerar o primeiro clipe." />
      <div className="mt-10 divide-y divide-border border-y border-border">
        {FAQ.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-6 py-5 text-left"
              >
                <span className="font-display text-[15px] font-medium md:text-base">{f.q}</span>
                {isOpen ? (
                  <Minus className="size-4 shrink-0 text-primary" />
                ) : (
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24">
      <Reveal>
        <div className="lp-glass lp-ring relative overflow-hidden rounded-3xl px-6 py-14 text-center md:px-16 md:py-20">
          <span aria-hidden className="lp-orb absolute -left-16 -top-16 size-56 opacity-60" />
          <span aria-hidden className="lp-orb absolute -bottom-20 -right-10 size-48 opacity-50" />
          <div className="relative">
            <span className="lp-float lp-chip3d lp-spin3d mx-auto !size-16 !rounded-2xl">
              <Sparkles />
            </span>
            <h2 className="mx-auto mt-6 max-w-2xl font-display text-3xl font-extrabold tracking-[-0.03em] md:text-[2.8rem] md:leading-[1.06]">
              Enquanto você edita um clipe, a IA entrega o dia inteiro.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
              Envie o primeiro vídeo e veja os cortes prontos com legenda, enquadramento e seu branding em
              poucos minutos.
            </p>
            <Link
              to="/checkout"
              search={{ plano: "creator" }}
              className="lp-cta-glow mt-9 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5"
            >
              Começar agora <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="auth-logo grid size-6 place-items-center rounded text-primary-foreground">
            <span className="font-display text-xs font-bold">V</span>
          </span>
          <span className="font-display text-sm font-semibold">VaiViral</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link to="/portfolio" className="transition-colors hover:text-foreground">
            Portfólio
          </Link>
          <Link to="/termos" className="transition-colors hover:text-foreground">
            Termos
          </Link>
          <Link to="/privacidade" className="transition-colors hover:text-foreground">
            Privacidade
          </Link>
          <span>© {new Date().getFullYear()} VaiViral. Use apenas conteúdo próprio ou licenciado.</span>
        </div>
      </div>
    </footer>
  );
}
