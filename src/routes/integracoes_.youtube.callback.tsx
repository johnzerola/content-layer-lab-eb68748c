import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { beginYoutubeOAuth, completeYoutubeOAuth } from "@/lib/youtube-oauth.functions";

const callbackSearch = z.object({
  code: z.coerce.string().optional(),
  state: z.coerce.string().optional(),
  error: z.coerce.string().optional(),
  error_description: z.coerce.string().optional(),
});

export const Route = createFileRoute("/integracoes_/youtube/callback")({
  validateSearch: callbackSearch,
  component: YoutubeOAuthCallback,
  head: () => ({
    meta: [
      { title: "Conectando YouTube — VaiViral" },
      {
        name: "description",
        content: "Conclusão da autorização do canal do YouTube para publicação automática.",
      },
      { property: "og:title", content: "Conectando YouTube — VaiViral" },
      { property: "og:description", content: "Conclusão da autorização do canal do YouTube." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function YoutubeOAuthCallback() {
  const search = Route.useSearch();
  const startOAuth = useServerFn(beginYoutubeOAuth);
  const completeOAuth = useServerFn(completeYoutubeOAuth);
  const started = useRef(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (search.error || !search.code || !search.state) {
      setResult({
        ok: false,
        message:
          search.error === "access_denied"
            ? "A autorização do YouTube foi cancelada. É preciso aprovar o acesso ao canal para publicar."
            : search.error_description || "A autorização do YouTube foi cancelada.",
      });
      return;
    }
    void completeOAuth({ data: { code: search.code, state: search.state } })
      .then((response) => {
        setResult(
          response.ok
            ? {
                ok: true,
                message: `${response.accounts.length === 1 ? "Canal conectado" : "Canais conectados"}: ${response.accounts
                  .map((account) => account.display_name || `@${account.username}`)
                  .join(
                    ", ",
                  )}. Para adicionar outro canal ou Conta de marca, volte e escolha Adicionar outro canal.`,
              }
            : { ok: false, message: response.error },
        );
      })
      .catch(() => setResult({ ok: false, message: "Não foi possível concluir a conexão." }));
  }, [completeOAuth, search.code, search.error, search.error_description, search.state]);

  const reconnect = async () => {
    setReconnecting(true);
    try {
      const response = await startOAuth();
      if (!response.ok) {
        setResult({ ok: false, message: response.error });
        return;
      }
      window.location.href = response.authorizationUrl;
    } catch {
      setResult({ ok: false, message: "NÃ£o foi possÃ­vel reiniciar a autorizaÃ§Ã£o." });
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
        {!result ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-xl font-semibold">Conectando YouTube…</h1>
          </>
        ) : (
          <>
            {result.ok ? (
              <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
            ) : (
              <TriangleAlert className="mx-auto size-8 text-amber-400" />
            )}
            <h1 className="mt-4 font-display text-xl font-semibold">
              {result.ok ? "YouTube conectado" : "Conexão não concluída"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
            <Link
              to="/integracoes"
              className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Voltar para Minhas contas
            </Link>
            <button
              type="button"
              onClick={() => void reconnect()}
              disabled={reconnecting}
              className="ml-2 mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
            >
              {reconnecting && <Loader2 className="size-4 animate-spin" />}
              {result.ok ? "Adicionar outro canal" : "Reconectar conta"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
