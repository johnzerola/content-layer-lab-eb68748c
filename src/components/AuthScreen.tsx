import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, Eye, EyeOff, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetPassword, signIn, signUp } from "@/lib/cloud";
import { toast } from "sonner";

const HIGHLIGHTS = [
  { label: "Cortes virais gerados", value: "128K", tone: "primary" as const },
  { label: "Vídeos publicados por dia", value: "3,4K", tone: "accent" as const },
];

const FEATURES = [
  "Editor visual 9:16 com camadas, keyframes e efeitos",
  "Legendas, vozes e branding aplicados em lote",
  "Publicação direta em TikTok, Reels e Shorts",
];

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
    <div className="auth-screen auth-enter grid max-h-[94vh] w-full overflow-y-auto rounded-3xl border border-border bg-surface lg:max-h-[88vh] lg:grid-cols-[1.05fr_1fr] lg:overflow-hidden">
      {/* ---------- vitrine ---------- */}
      <aside className="auth-stage relative hidden flex-col justify-between overflow-hidden p-8 lg:flex">
        <span aria-hidden className="auth-orb auth-orb-a" />
        <span aria-hidden className="auth-orb auth-orb-b" />
        <span aria-hidden className="auth-grid" />

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-hover bg-surface-2/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="auth-live size-1.5 rounded-full bg-primary" />
            estúdio em produção
          </span>

          <h1 className="mt-6 font-display text-[clamp(2rem,3.2vw,2.9rem)] font-extrabold leading-[0.95] tracking-tight">
            <span className="auth-shine block">Seus cortes</span>
            <span className="text-gradient block">viram audiência.</span>
          </h1>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Importe centenas de vídeos, aplique seu template e publique em escala — sem sair do VaiViral.
          </p>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3">
          {HIGHLIGHTS.map((h, i) => (
            <div
              key={h.label}
              className="auth-card rounded-2xl border border-border bg-surface-2/60 p-4"
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <p
                className={`font-display text-3xl font-extrabold tracking-tight ${
                  h.tone === "primary" ? "text-gradient" : "text-foreground"
                }`}
              >
                {h.value}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{h.label}</p>
            </div>
          ))}
        </div>

        <ul className="relative mt-6 space-y-2">
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
      </aside>

      {/* ---------- formulário ---------- */}
      <section className="relative flex flex-col justify-center bg-surface-2/40 p-6 sm:p-9">
        <div className={`mx-auto w-full max-w-sm ${mounted ? "rise-in" : "opacity-0"}`}>
          <div className="flex flex-col items-center text-center">
            <span className="auth-logo grid size-12 place-items-center rounded-2xl text-primary-foreground">
              <Zap className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>
          </div>

          <div
            role="tablist"
            aria-label="Entrar ou criar conta"
            className="relative mt-6 grid grid-cols-2 rounded-xl border border-border bg-surface p-1"
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
            className="mt-5 space-y-4"
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

          <p className="mt-6 text-center text-[12px] text-muted-foreground">
            {mode === "in" ? "Não tem uma conta?" : "Já tem uma conta?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {mode === "in" ? "Criar conta" : "Entrar"}
            </button>
          </p>

          {footer ? <div className="mt-5 flex flex-col items-center gap-2">{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}
