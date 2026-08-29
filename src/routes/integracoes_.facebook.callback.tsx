import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { facebookCallbackSearch } from "@/lib/facebook-callback";
import { completeFacebookOAuth } from "@/lib/facebook-oauth.functions";

export const Route = createFileRoute("/integracoes_/facebook/callback")({
  validateSearch: facebookCallbackSearch,
  component: FacebookOAuthCallback,
  head: () => ({
    meta: [
      { title: "Conectando Facebook - VaiViral" },
      { name: "description", content: "Conclusão da autorização das Páginas do Facebook." },
    ],
  }),
});

type CallbackResult = {
  ok: boolean;
  message: string;
  facebook?: string[];
  instagram?: string[];
  warning?: string | null;
};

function FacebookOAuthCallback() {
  const search = Route.useSearch();
  const completeOAuth = useServerFn(completeFacebookOAuth);
  const started = useRef(false);
  const [result, setResult] = useState<CallbackResult | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (search.error || !search.code || !search.state) {
      const providerCode = search.error_code ? ` (código ${search.error_code})` : "";
      setResult({
        ok: false,
        message: search.error_description
          ? `A Meta recusou a autorização${providerCode}: ${search.error_description}`
          : search.error_reason
            ? `A Meta recusou a autorização${providerCode}: ${search.error_reason}`
            : "A autorização do Facebook foi cancelada ou não retornou os dados necessários.",
      });
      return;
    }

    void completeOAuth({ data: { code: search.code, state: search.state } })
      .then((response) => {
        if (!response.ok) {
          setResult({ ok: false, message: response.error });
          return;
        }
        const facebook = response.summary.facebook;
        const instagram = response.summary.instagram;
        const unavailable = response.summary.unavailablePageIds.length;
        setResult({
          ok: true,
          facebook,
          instagram,
          message: `${facebook.length} Página(s) e ${instagram.length} Instagram conectado(s).`,
          warning:
            unavailable > 0
              ? `${unavailable} Página(s) selecionada(s) não liberaram token de publicação. Verifique o controle total dessas Páginas.`
              : null,
        });
      })
      .catch(() => setResult({ ok: false, message: "Não foi possível concluir a conexão." }));
  }, [
    completeOAuth,
    search.code,
    search.error,
    search.error_code,
    search.error_description,
    search.error_reason,
    search.state,
  ]);

  useEffect(() => {
    if (!result?.ok) return;
    const timer = window.setTimeout(() => {
      window.location.replace("/integracoes");
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [result]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-8">
      <section
        className="w-full max-w-lg border border-border bg-surface p-6 text-center"
        aria-live="polite"
      >
        {!result ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-xl font-semibold">Sincronizando suas contas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Buscando todas as Páginas e contas profissionais autorizadas.
            </p>
          </>
        ) : (
          <>
            {result.ok ? (
              <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
            ) : (
              <TriangleAlert className="mx-auto size-8 text-amber-400" />
            )}
            <h1 className="mt-4 font-display text-xl font-semibold">
              {result.ok ? "Contas Meta sincronizadas" : "Conexão não concluída"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>

            {result.ok && (
              <div className="mt-5 grid gap-3 text-left sm:grid-cols-2">
                <AccountSummary label="Facebook" names={result.facebook ?? []} />
                <AccountSummary
                  label="Instagram profissional"
                  names={(result.instagram ?? []).map((name) => `@${name}`)}
                />
              </div>
            )}

            {result.warning && (
              <p className="mt-4 border border-amber-500/30 bg-amber-500/5 p-3 text-left text-xs text-amber-300">
                {result.warning}
              </p>
            )}

            <Link
              to="/integracoes"
              className="mt-5 inline-flex min-h-10 items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {result.ok ? "Ver contas conectadas" : "Voltar e tentar novamente"}
            </Link>
            {result.ok && (
              <p className="mt-3 text-xs text-muted-foreground">
                Voltando automaticamente para Minhas contas...
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function AccountSummary({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="border border-border bg-surface-2 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">
        {names.length > 0 ? names.join(", ") : "Nenhuma vinculada"}
      </p>
    </div>
  );
}
