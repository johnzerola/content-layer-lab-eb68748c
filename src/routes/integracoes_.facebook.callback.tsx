import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Facebook, Instagram, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { facebookCallbackSearch } from "@/lib/facebook-callback";
import { RECONNECT_GUIDE_STEPS } from "@/lib/meta-reconnect-guide";
import {
  applyMetaAccountSelection,
  beginFacebookOAuth,
  completeFacebookOAuth,
} from "@/lib/facebook-oauth.functions";

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

type DiscoveredAccount = {
  key: string;
  platform: "facebook" | "instagram";
  providerAccountId: string;
  username: string;
  displayName: string;
  linkedPageName: string | null;
};

type UnavailablePage = { pageId: string; name: string };

type CallbackResult = {
  ok: boolean;
  message: string;
  facebook?: string[];
  instagram?: string[];
  warning?: string | null;
  discovered?: DiscoveredAccount[];
  selectionToken?: string;
  unavailablePages?: UnavailablePage[];
};


function unavailablePagesWarning(count: number): string | null {
  return count > 0
    ? `${count} página(s) foram selecionadas no consentimento do Facebook, mas a Meta não liberou o token de publicação. Isso acontece quando você não é administrador da página, o app não foi adicionado às configurações avançadas da página, ou a página está em um Business Manager onde você não tem controle total. Veja abaixo como resolver.`
    : null;
}

function FacebookOAuthCallback() {
  const search = Route.useSearch();
  const startOAuth = useServerFn(beginFacebookOAuth);
  const completeOAuth = useServerFn(completeFacebookOAuth);
  const applySelection = useServerFn(applyMetaAccountSelection);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
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
          const unavailablePages =
            "unavailablePages" in response && Array.isArray(response.unavailablePages)
              ? response.unavailablePages
              : [];
          setResult({
            ok: false,
            message: response.error,
            unavailablePages,
            warning: unavailablePagesWarning(unavailablePages.length),
          });
          return;
        }
        const facebook = response.summary.facebook;
        const instagram = response.summary.instagram;
        const unavailablePages = response.summary.unavailablePages ?? [];
        const unavailable = unavailablePages.length;
        const discovered = response.candidates;
        setSelected(discovered.map((account) => account.key));
        setResult({
          ok: true,
          facebook,
          instagram,
          discovered,
          selectionToken: response.selectionToken,
          unavailablePages,
          message: `${facebook.length} Página(s) e ${instagram.length} Instagram encontrado(s). Revise e salve os canais que devem aparecer no VaiViral.`,
          warning: unavailablePagesWarning(unavailable),
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
    if (!confirmed) return;
    const timer = window.setTimeout(() => {
      window.location.replace("/integracoes");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [confirmed]);

  const confirmSelection = async () => {
    const discovered = result?.discovered ?? [];
    if (discovered.length === 0 || !result?.selectionToken || selected.length === 0) return;
    setSaving(true);
    try {
      const response = await applySelection({
        data: { selectionToken: result.selectionToken, keep: selected },
      });
      if (!response.ok) {
        setResult((current) => (current ? { ...current, warning: response.error } : current));
        return;
      }
      setResult((current) =>
        current
          ? {
              ...current,
              message: `${response.summary.facebook} Página(s) e ${response.summary.instagram} Instagram salvos como conexões separadas.`,
            }
          : current,
      );
      setConfirmed(true);
    } catch {
      setResult((current) =>
        current ? { ...current, warning: "Não foi possível salvar a seleção." } : current,
      );
    } finally {
      setSaving(false);
    }
  };

  const reconnect = async (mode: "classic" | "business" = "classic") => {
    setReconnecting(true);
    try {
      const response = await startOAuth({
        data: {
          forceClassic: mode === "classic",
          forceBusiness: mode === "business",
        },
      });
      if (!response.ok) {
        setResult((current) =>
          current ? { ...current, warning: response.error } : { ok: false, message: response.error },
        );
        return;
      }
      window.location.href = response.authorizationUrl;
    } catch {
      setResult((current) =>
        current
          ? { ...current, warning: "NÃ£o foi possÃ­vel reiniciar a autorizaÃ§Ã£o." }
          : { ok: false, message: "NÃ£o foi possÃ­vel reiniciar a autorizaÃ§Ã£o." },
      );
    } finally {
      setReconnecting(false);
    }
  };

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

            {result.ok && !confirmed && (
              <div className="mt-5 grid gap-3 text-left sm:grid-cols-2">
                <AccountSummary label="Facebook" names={result.facebook ?? []} />
                <AccountSummary
                  label="Instagram profissional"
                  names={(result.instagram ?? []).map((name) => `@${name}`)}
                />
              </div>
            )}

            {result.ok && !confirmed && (result.discovered?.length ?? 0) > 0 && (
              <div className="mt-5 border border-border bg-surface-2 p-4 text-left">
                <p className="text-sm font-medium">Escolha os canais para publicar</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cada item selecionado será salvo como uma conexão independente. Você pode conectar
                  outros perfis da Meta depois sem perder estes canais.
                </p>
                <div className="mt-4 max-h-80 space-y-4 overflow-y-auto pr-1">
                  <CandidateGroup
                    platform="facebook"
                    candidates={(result.discovered ?? []).filter(
                      (account) => account.platform === "facebook",
                    )}
                    selected={selected}
                    onSelected={setSelected}
                  />
                  <CandidateGroup
                    platform="instagram"
                    candidates={(result.discovered ?? []).filter(
                      (account) => account.platform === "instagram",
                    )}
                    selected={selected}
                    onSelected={setSelected}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void confirmSelection()}
                    disabled={saving || selected.length === 0}
                    className="inline-flex min-h-10 items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Salvar {selected.length} canal(is)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((result.discovered ?? []).map((account) => account.key))
                    }
                    className="min-h-10 border border-border px-4 py-2 text-sm"
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="min-h-10 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Limpar
                  </button>
                </div>
                {selected.length === 0 && (
                  <p className="mt-2 text-xs text-amber-300">
                    Selecione ao menos um canal para concluir.
                  </p>
                )}
              </div>
            )}

            {result.warning && (
              <p className="mt-4 border border-amber-500/30 bg-amber-500/5 p-3 text-left text-xs text-amber-300">
                {result.warning}
              </p>
            )}

            {(result.unavailablePages?.length ?? 0) > 0 && (
              <details className="mt-4 border border-amber-500/30 bg-surface-2 p-3 text-left">
                <summary className="cursor-pointer text-sm font-medium text-amber-300">
                  Páginas que não puderam ser conectadas ({result.unavailablePages?.length})
                </summary>
                <ul className="mt-3 space-y-2">
                  {result.unavailablePages?.map((page) => (
                    <li
                      key={page.pageId}
                      className="flex items-start gap-2 border border-border/60 bg-surface p-2"
                    >
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{page.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          ID {page.pageId}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {(result.unavailablePages?.length ?? 0) > 0 && (
              <div className="mt-4 border border-border bg-surface-2 p-4 text-left">
                <p className="text-sm font-medium">
                  Como resolver e conectar todas as páginas
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  {RECONNECT_GUIDE_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void reconnect("classic")}
                    disabled={reconnecting}
                    className="inline-flex min-h-10 items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {reconnecting && <Loader2 className="size-4 animate-spin" />}
                    Reconectar com permissões completas
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="min-h-10 border border-border px-4 py-2 text-sm"
                  >
                    Já corrigi, tentar novamente
                  </button>
                </div>
              </div>
            )}

            <Link
              to="/integracoes"
              className="mt-5 inline-flex min-h-10 items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {result.ok ? "Ver contas conectadas" : "Voltar e tentar novamente"}
            </Link>
            {!confirmed && !result.ok && (
              <button
                type="button"
                onClick={() => void reconnect("business")}
                disabled={reconnecting}
                className="ml-2 mt-5 inline-flex min-h-10 items-center gap-2 border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-medium text-primary disabled:opacity-60"
                title="Abre o Login para Empresas quando a configuracao Business da Meta estiver publicada"
              >
                {reconnecting && <Loader2 className="size-4 animate-spin" />}
                Tentar Login empresarial
              </button>
            )}
            {!confirmed && (
              <button
                type="button"
                onClick={() => void reconnect("classic")}
                disabled={reconnecting}
                className="ml-2 mt-5 inline-flex min-h-10 items-center gap-2 border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
              >
                {reconnecting && <Loader2 className="size-4 animate-spin" />}
                Reconectar conta
              </button>
            )}
            {confirmed && (
              <p className="mt-3 text-xs text-muted-foreground">
                Seleção salva. Voltando para Minhas contas...
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

function CandidateGroup({
  platform,
  candidates,
  selected,
  onSelected,
}: {
  platform: "facebook" | "instagram";
  candidates: DiscoveredAccount[];
  selected: string[];
  onSelected: Dispatch<SetStateAction<string[]>>;
}) {
  if (candidates.length === 0) return null;
  const Icon = platform === "facebook" ? Facebook : Instagram;
  const label = platform === "facebook" ? "Páginas do Facebook" : "Instagram profissional";
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <span>{label}</span>
        <span className="ml-auto">{candidates.length}</span>
      </div>
      <ul className="space-y-1">
        {candidates.map((account) => (
          <li key={account.key}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 border border-border/60 bg-surface px-3 py-2 text-sm hover:border-primary/40">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-[var(--color-primary)]"
                checked={selected.includes(account.key)}
                onChange={(event) =>
                  onSelected((current) =>
                    event.target.checked
                      ? [...new Set([...current, account.key])]
                      : current.filter((key) => key !== account.key),
                  )
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{account.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {account.linkedPageName
                    ? `Vinculado a ${account.linkedPageName} · ID ${account.providerAccountId}`
                    : `ID ${account.providerAccountId}`}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
