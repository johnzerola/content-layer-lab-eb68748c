import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentUser, onAuth, resetPassword, signIn, signUp, type CloudUser } from "@/lib/cloud";
import { toast } from "sonner";


/**
 * Ferramentas que gravam no banco (CleanerIA) exigem sessão — sem ela o
 * servidor responde "Unauthorized: No authorization header provided".
 */
export function AuthGate({
  children,
  title = "Entre para usar o CleanerIA",
  description = "Os jobs de limpeza ficam salvos na sua conta com histórico e link de download.",
  fallbackExtra,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  fallbackExtra?: ReactNode;
}) {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");


  useEffect(() => {
    const off = onAuth((u) => {
      setUser(u);
      setReady(true);
    });
    currentUser()
      .then((u) => setUser(u))
      .finally(() => setReady(true));
    return off;
  }, []);

  const submit = async (mode: "in" | "up") => {
    if (!email || password.length < 6) {
      toast.error("Informe e-mail e senha com pelo menos 6 caracteres.");
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

  if (!ready) {
    return (
      <div className="grid min-h-60 place-items-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (user) return <>{children}</>;

  return (
    <div className="mx-auto w-full max-w-md">
      {/* card com Aurora: a borda se acende quando o usuário está preenchendo */}
      <div
        className={`aurora rise-in rounded-2xl border bg-surface p-6 transition-[border-color,transform] duration-[var(--dur-panel)] ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-within:aurora-on focus-within:scale-[1.005] focus-within:border-transparent ${
          busy ? "aurora-on aurora-boost border-transparent" : "border-border"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--primary-subtle)] text-primary">
            <LogIn className="size-4" />
          </span>
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>

        {/* tabs com indicador que desliza fisicamente */}
        <div
          role="tablist"
          aria-label="Entrar ou criar conta"
          className="relative mt-5 grid grid-cols-2 rounded-xl border border-border bg-surface-2 p-1"
        >
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-surface-3 transition-transform duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
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
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(mode);
          }}
        >
          <Input
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            aria-label="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            placeholder="senha (mínimo 6 caracteres)"
            aria-label="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* button morph: mesma geometria em todos os estados */}
          <Button type="submit" className="min-h-11 w-full" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                {mode === "in" ? "Entrando…" : "Criando conta…"}
              </>
            ) : (
              <>
                {mode === "in" ? <Check className="mr-1.5 size-4" /> : <Sparkles className="mr-1.5 size-4" />}
                {mode === "in" ? "Entrar no estúdio" : "Criar minha conta"}
              </>
            )}
          </Button>
        </form>

        <button
          type="button"
          disabled={busy}
          onClick={recover}
          className="mt-3 min-h-9 w-full rounded-lg text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Esqueci minha senha
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-2">{fallbackExtra}</div>
    </div>
  );

}
