import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { completeFacebookOAuth } from "@/lib/facebook-oauth.functions";

const callbackSearch = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  error_reason: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/integracoes_/facebook/callback")({
  validateSearch: callbackSearch,
  component: FacebookOAuthCallback,
  head: () => ({
    meta: [
      { title: "Conectando Facebook — VaiViral" },
      { name: "description", content: "Conclusão da autorização das Páginas do Facebook." },
    ],
  }),
});

function FacebookOAuthCallback() {
  const search = Route.useSearch();
  const completeOAuth = useServerFn(completeFacebookOAuth);
  const started = useRef(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

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
        setResult(
          response.ok
            ? {
                ok: true,
                message: `${response.accounts.length} conta(s) conectada(s): ${response.accounts
                  .map((account) => `${account.platform === "facebook" ? "" : "@"}${account.username}`)
                  .join(", ")}.`,
              }
            : { ok: false, message: response.error },
        );
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

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
        {!result ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-xl font-semibold">Conectando Facebook…</h1>
          </>
        ) : (
          <>
            {result.ok ? (
              <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
            ) : (
              <TriangleAlert className="mx-auto size-8 text-amber-400" />
            )}
            <h1 className="mt-4 font-display text-xl font-semibold">
              {result.ok ? "Facebook conectado" : "Conexão não concluída"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
            <Link
              to="/integracoes"
              className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Voltar para Minhas contas
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
