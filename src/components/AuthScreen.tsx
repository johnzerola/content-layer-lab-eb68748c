import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  KwaiIcon,
  TikTokIcon,
  YouTubeIcon,
} from "@/components/brand-icons";
import { PrizeCounter } from "@/components/auth/PrizeCounter";
import { PrizeStream } from "@/components/auth/PrizeStream";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable/index";
import { resetPassword, signIn, signUp } from "@/lib/cloud";

/** Marca oficial do Google (multicolor) para o botão de acesso. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3.1 0 5.9 1.2 7.9 3.1l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 40.2 44 35 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
import { toast } from "sonner";

/** Prêmio em destaque: carrega uma vez e permanece no valor final. */
const PRIZES = [246000];


const HIGHLIGHTS = [
  { label: "Cortes virais gerados", value: 128, suffix: "K", tone: "primary" as const },
  { label: "Vídeos publicados por dia", value: 3.4, suffix: "K", tone: "accent" as const },
];

const FEATURES = [
  "Editor visual 9:16 com camadas, keyframes e efeitos",
  "Legendas, vozes e branding aplicados em lote",
  "Publicação direta em TikTok, Reels e Shorts",
];

const SOCIAL_ICONS = [
  { label: "Instagram", Icon: InstagramIcon, className: "auth-social-instagram" },
  { label: "TikTok", Icon: TikTokIcon, className: "auth-social-tiktok" },
  { label: "Kwai", Icon: KwaiIcon, className: "auth-social-kwai" },
  { label: "YouTube", Icon: YouTubeIcon, className: "auth-social-youtube" },
  { label: "Facebook", Icon: FacebookIcon, className: "auth-social-facebook" },
] as const;

function AnimatedNumber({ value, suffix, delay = 0 }: { value: number; suffix: string; delay?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    const duration = value >= 100 ? 4200 : 3600;
    const startedAt = performance.now() + delay;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
      const eased = progress < 0.08 ? 0 : 1 - Math.pow(1 - (progress - 0.08) / 0.92, 3);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, value]);

  const formatted = value % 1 === 0 ? Math.round(display).toString() : display.toFixed(1).replace(".", ",");
  return <span className="auth-counter" aria-label={`${value.toString().replace(".", ",")}${suffix}`}>{formatted}{suffix}</span>;
}

/**
 * Tela de acesso em split-screen: vitrine à esquerda (glow + motion),
 * formulário à direita. Apresentação apenas — a lógica de sessão continua
 * em @/lib/cloud.
 */
export function AuthScreen({
  title = "Acesse sua conta",
  description = "Entre ou crie sua conta para começar",
  footer,
}: {
  title?: string;
  description?: string;
  footer?: ReactNode;
}) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const canSubmit = useMemo(
    () => /.+@.+\..+/.test(email) && password.length >= 6 && !busy,
    [email, password, busy],
  );

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Informe um e-mail válido e senha com pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "in") {
        await signIn(email, password);
      } else {
        const active = await signUp(email, password);
        toast.success(active ? "Conta criada." : "Conta criada — confirme o e-mail para entrar.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Não foi possível entrar com o Google. Tente de novo.");
        return;
      }
      if (result.redirected) return;
    } catch {
      toast.error("Não foi possível entrar com o Google. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (!/.+@.+\..+/.test(email)) {
      toast.error("Digite seu e-mail para receber o link de recuperação.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email);
      toast.success("Enviamos o link de recuperação para seu e-mail.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen auth-enter grid max-h-[94vh] w-full overflow-y-auto rounded-3xl border border-border bg-surface md:max-h-[90vh] md:grid-cols-[0.94fr_1fr] md:overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- vitrine ---------- */}
      <aside className="auth-stage relative hidden flex-col justify-between overflow-hidden p-6 md:flex lg:p-9">
        <span aria-hidden className="auth-beam auth-beam-a" />
        <span aria-hidden className="auth-beam auth-beam-b" />
        <span aria-hidden className="auth-grid" />
        <PrizeStream />
        <span aria-hidden className="auth-glass-sheen" />

        <div className="relative">
          <span className="auth-pill inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="auth-live size-1.5 rounded-full bg-primary" />
            ao vivo
          </span>

          <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            prêmio acumulado da semana
          </p>
          <p className="mt-2 font-display text-[clamp(2.6rem,4.6vw,4.2rem)] font-extrabold leading-none tracking-[-0.04em]">
            <PrizeCounter values={PRIZES} />
          </p>

          <h1 className="mt-6 max-w-sm font-display text-[clamp(1.35rem,2vw,1.8rem)] font-extrabold leading-[1.05] tracking-tight">
            <span className="auth-shine">Seus cortes valem dinheiro de verdade.</span>
          </h1>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Publique nos campeonatos e receba por cada visualização. Pagamento direto no PIX.
          </p>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3">
          {HIGHLIGHTS.map((h, i) => (
            <div
              key={h.label}
              className="auth-card auth-glass auth-glass-lift rounded-xl border border-border p-3.5 lg:p-4"
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <p
                className={`font-display text-2xl font-extrabold tracking-tight ${
                  h.tone === "primary" ? "text-gradient" : "text-foreground"
                }`}
              >
                <AnimatedNumber value={h.value} suffix={h.suffix} delay={1100 + i * 280} />
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{h.label}</p>
            </div>
          ))}
        </div>

        <ul className="relative mt-5 space-y-2">
          {FEATURES.map((f, i) => (
            <li
              key={f}
              className="auth-card flex items-start gap-2.5 text-[13px] text-muted-foreground"
              style={{ animationDelay: `${280 + i * 80}ms` }}
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-[var(--primary-subtle)] text-primary">
                <Check className="size-3" />
              </span>
              {f}
            </li>
          ))}
        </ul>

        <div className="relative mt-6 flex items-center gap-2 text-muted-foreground">
          {SOCIAL_ICONS.map(({ label, Icon, className }) => (
            <span
              key={label}
              className={`auth-pill grid size-8 place-items-center rounded-lg ${className}`}
              title={label}
            >
              <Icon aria-label={label} />
            </span>
          ))}
        </div>
      </aside>

      {/* ---------- topo compacto (mobile) ---------- */}
      <div className="auth-stage relative flex items-center gap-3 overflow-hidden px-5 py-4 md:hidden">
        <PrizeStream />
        <span aria-hidden className="auth-beam auth-beam-a" />
        <span className="auth-pill relative inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="auth-live size-1.5 rounded-full bg-primary" />
          ao vivo
        </span>
        <p className="relative font-display text-xl font-extrabold tracking-tight">
          <PrizeCounter values={PRIZES} />
        </p>
      </div>

      {/* ---------- formulário ---------- */}
      <section className="auth-panel-glass relative flex flex-col justify-center p-6 sm:p-9">
        <div className={`mx-auto w-full max-w-sm ${mounted ? "rise-in" : "opacity-0"}`}>
          <div className="flex flex-col items-center text-center">
            <span className="auth-logo grid size-12 place-items-center rounded-2xl text-primary-foreground">
              <Zap className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-[-0.02em]">{title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          </div>

          <div
            role="tablist"
            aria-label="Entrar ou criar conta"
            className="auth-glass relative mt-6 grid grid-cols-2 rounded-xl border border-border p-1"
          >
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-surface-3 shadow-[0_0_0_1px_var(--primary-subtle)] transition-transform duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ transform: mode === "up" ? "translateX(100%)" : "none" }}
            />
            {(
              [
                ["in", "Entrar"],
                ["up", "Criar conta"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={`relative z-10 min-h-10 rounded-lg text-[13px] font-medium transition-colors ${
                  mode === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            key={mode}
            className="auth-swap mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="studio-label mb-1.5 block text-[12px] text-muted-foreground">E-mail</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-field min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[14px] outline-none"
              />
            </label>

            <label className="block">
              <span className="studio-label mb-1.5 block text-[12px] text-muted-foreground">Senha</span>
              <span className="relative block">
                <input
                  type={show ? "text" : "password"}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  placeholder="mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-field min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 pr-11 text-[14px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>

            {mode === "in" ? (
              <button
                type="button"
                onClick={() => void recover()}
                disabled={busy}
                className="-mt-1 block text-[12px] text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                Esqueceu sua senha?
              </button>
            ) : (
              <p className="-mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Ao criar a conta você aceita os termos de uso e a política de privacidade do VaiViral.
              </p>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              className="auth-cta min-h-12 w-full rounded-xl text-[14px] font-semibold"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {mode === "in" ? "Entrando…" : "Criando conta…"}
                </>
              ) : (
                <>
                  {mode === "in" ? <ArrowRight className="mr-2 size-4" /> : <Sparkles className="mr-2 size-4" />}
                  {mode === "in" ? "Entrar" : "Criar minha conta"}
                </>
              )}
            </Button>
          </form>

          <div className="auth-divider mt-6">
            <span className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              ou continue com
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void google()}
            className="auth-glass auth-glass-lift mt-4 min-h-12 w-full rounded-xl text-[13px] font-medium"
          >
            <GoogleMark className="mr-2 size-4" />
            Continuar com Google
          </Button>

          <div className="auth-divider mt-6">
            <span className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {mode === "in" ? "ainda não tem conta" : "já tem conta"}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="auth-glass auth-glass-lift mt-4 min-h-11 w-full rounded-xl text-[13px] font-medium"
          >
            {mode === "in" ? "Criar minha conta grátis" : "Entrar na minha conta"}
          </Button>

          {footer ? <div className="mt-5 flex flex-col items-center gap-2">{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}
