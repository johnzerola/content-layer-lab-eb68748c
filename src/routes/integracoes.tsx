import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Star,
  Facebook,
  Instagram,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  TriangleAlert,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { currentUser, onAuth, type CloudUser } from "@/lib/cloud";
import { listAccounts, removeAccount, type SocialAccount } from "@/lib/social";

import { beginFacebookOAuth, diagnoseFacebookIntegration } from "@/lib/facebook-oauth.functions";
import { setPrimaryAccount } from "@/lib/social-primary.functions";
import { AppShell, type AppMode } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { listJobs } from "@/lib/jobs";

export const Route = createFileRoute("/integracoes")({
  component: IntegrationsPage,
  head: () => ({
    meta: [
      { title: "Minhas contas sociais — VaiViral" },
      {
        name: "description",
        content: "Conecte quantas contas do Instagram e Páginas do Facebook quiser para publicar em lote.",
      },
      { property: "og:title", content: "Minhas contas sociais — VaiViral" },
      {
        property: "og:description",
        content: "Gerencie as contas conectadas usadas nas publicações automáticas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type PlatformKey = "instagram" | "facebook" | "tiktok" | "youtube";

const PLATFORMS: Array<{
  platform: PlatformKey;
  name: string;
  description: string;
  icon: typeof Instagram;
  available: boolean;
}> = [
  {
    platform: "instagram",
    name: "Instagram",
    description:
      "Reels, Feed e Stories. A autorização é feita pelo Facebook (o Instagram Profissional precisa estar vinculado a uma Página).",
    icon: Instagram,
    available: true,
  },
  {
    platform: "facebook",
    name: "Facebook",
    description: "Páginas com Reels e vídeos no Feed via Facebook Login.",
    icon: Facebook,
    available: true,
  },
  {
    platform: "tiktok",
    name: "TikTok",
    description: "Content Posting API ainda não liberada.",
    icon: Settings2,
    available: false,
  },
  {
    platform: "youtube",
    name: "YouTube",
    description: "Upload de Shorts ainda não configurado.",
    icon: Youtube,
    available: false,
  },
];

function IntegrationsPage() {
  const [mode, setMode] = useState<AppMode>("external");
  const jobs = listJobs();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [busy, setBusy] = useState<PlatformKey | null>(null);

  const startFacebook = useServerFn(beginFacebookOAuth);
  const makePrimary = useServerFn(setPrimaryAccount);

  useEffect(() => {
    void currentUser().then(setUser);
    return onAuth(setUser);
  }, []);

  const reload = useCallback(() => {
    void listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (!user) {
      setAccounts([]);
      return;
    }
    reload();
  }, [reload, user]);

  const connect = useCallback(
    async (platform: PlatformKey) => {
      setBusy(platform);
      try {
        // Instagram Business é autorizado pelo Facebook Login for Business
        // (o login direto do Instagram exige um app do tipo Instagram API).
        const response = await startFacebook();

        if (!response.ok) {
          toast.error(response.error);
          return;
        }
        const authorizationUrl = new URL(response.authorizationUrl);
        const expectedPath = `/${response.diagnostics.graphVersion}/dialog/oauth`;
        const expectedRedirect = `${response.diagnostics.redirectOrigin}${response.diagnostics.redirectPath}`;
        if (authorizationUrl.pathname !== expectedPath) {
          toast.error(
            `Versão do Graph divergente: esperado ${expectedPath}, gerado ${authorizationUrl.pathname}.`,
          );
          return;
        }
        if (authorizationUrl.searchParams.get("redirect_uri") !== expectedRedirect) {
          toast.error(
            `URL de retorno divergente: esperado ${expectedRedirect}, gerado ${authorizationUrl.searchParams.get("redirect_uri") ?? "vazio"}.`,
          );
          return;
        }
        window.location.href = response.authorizationUrl;

      } catch {
        toast.error("Não foi possível iniciar a autorização.");
      } finally {
        setBusy(null);
      }
    },
    [startFacebook],
  );

  const disconnect = useCallback(
    async (account: SocialAccount) => {
      try {
        await removeAccount(account.id);
        toast.success("Conta removida.");
        reload();
      } catch {
        toast.error("Não foi possível remover a conta.");
      }
    },
    [reload],
  );

  const choosePrimary = useCallback(
    async (account: SocialAccount) => {
      try {
        const response = await makePrimary({ data: { accountId: account.id } });
        if (!response.ok) {
          toast.error(response.error);
          return;
        }
        toast.success(`${account.username} agora é a conta ativa.`);
        reload();
      } catch {
        toast.error("Não foi possível definir a conta ativa.");
      }
    },
    [makePrimary, reload],
  );

  return (
    <AppShell mode={mode} onMode={setMode} count={jobs.length} onLibrary={() => {}} onCloud={() => {}}>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <section className="mb-6 rounded-2xl border border-border/70 bg-[var(--gradient-surface)] p-5">
          <p className="mono-label text-primary">Minhas contas</p>
          <h1 className="mt-2 font-display text-2xl font-bold">
            Conecte quantas contas quiser
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Cada conta é vinculada apenas ao seu login e autorizada pelo próprio provedor. Senhas
            nunca são solicitadas: você aprova o acesso na Meta e nós guardamos somente o token
            criptografado.
          </p>
        </section>

        {user && <MetaDiagnosticsPanel />}



        {!user ? (
          <div className="rounded-2xl border border-border bg-surface/60 p-6 text-center text-sm text-muted-foreground">
            Faça login na Nuvem para conectar suas contas.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              const rows = accounts.filter((account) => account.platform === platform.platform);
              return (
                <article
                  key={platform.platform}
                  className="rounded-2xl border border-border/70 bg-surface/60 p-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/35 bg-primary/12 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg font-semibold">{platform.name}</h2>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {platform.description}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-4 space-y-2">
                    {rows.length === 0 && (
                      <li className="rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                        Nenhuma conta conectada.
                      </li>
                    )}
                    {rows.map((account) => {
                      const connected = account.status === "conectado" && account.provider !== "pending";
                      return (
                        <li
                          key={account.id}
                          className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3"
                        >
                          {connected ? (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                          ) : (
                            <TriangleAlert className="size-4 shrink-0 text-amber-400" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {platform.platform === "facebook" ? "" : "@"}
                              {account.username}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {account.is_primary
                                ? "Conta ativa desta rede"
                                : connected
                                  ? "Pronta para publicar"
                                  : "Precisa reautorizar"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!connected || account.is_primary}
                            onClick={() => void choosePrimary(account)}
                            aria-label={`Definir ${account.username} como conta ativa`}
                            title={
                              account.is_primary
                                ? "Conta ativa"
                                : "Usar esta Página/conta por padrão nas publicações"
                            }
                            className={`border border-border ${
                              account.is_primary ? "text-amber-400" : "text-muted-foreground"
                            }`}
                          >
                            <Star
                              className={`size-4 ${account.is_primary ? "fill-current" : ""}`}
                            />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => void disconnect(account)}
                            aria-label={`Remover ${account.username}`}
                            className="border border-border text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>

                  <Button
                    type="button"
                    disabled={!platform.available || busy === platform.platform}
                    onClick={() => void connect(platform.platform)}
                    className="mt-4 w-full"
                  >
                    {busy === platform.platform ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {platform.available ? "Adicionar conta" : "Em preparação"}
                  </Button>
                </article>
              );
            })}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-border/70 bg-surface/60 p-5 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            Apareceu “Recurso indisponível” ou “estamos atualizando detalhes” na tela do Facebook?
          </p>
          <p className="mt-2">
            Esse aviso vem da Meta, não do VaiViral: o app precisa estar ativo, com a configuração do Login for
            Business publicada e com política de privacidade, exclusão de dados, ícone, categoria e e-mail de contato
            preenchidos. Se você é o administrador do app, revise essas informações no painel da Meta e tente de novo.
          </p>
          <p className="mt-2">
            Não guardamos senhas: só o token que a Meta emite, criptografado. Remova a conta aqui a qualquer momento —
            veja a{" "}
            <a href="/privacidade" className="underline hover:text-foreground">
              política de privacidade
            </a>{" "}
            e a{" "}
            <a href="/exclusao-de-dados" className="underline hover:text-foreground">
              exclusão de dados
            </a>
            .
          </p>
        </section>
      </main>

    </AppShell>
  );
}

type MetaCheck = {
  graphVersion: string;
  appId: string | null;
  configId: string | null;
  mode: "classic" | "business";
  effectiveScopes: string[];
  redirectUri: string | null;
  siteUrl: string | null;
  authorizationUrl: string | null;
  issues: string[];
  loginConfiguration: { checked: boolean; ok: boolean; detail: string };
};

function MetaDiagnosticsPanel() {
  const runDiagnosis = useServerFn(diagnoseFacebookIntegration);
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "denied" } | { status: "ready"; check: MetaCheck }
  >({ status: "idle" });

  const run = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await runDiagnosis();
      setState(response.ok ? { status: "ready", check: response.check as MetaCheck } : { status: "denied" });
    } catch {
      setState({ status: "denied" });
    }
  }, [runDiagnosis]);

  return (
    <section className="mb-6 rounded-2xl border border-border/70 bg-surface/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Diagnóstico da integração Meta</h2>
          <p className="text-xs text-muted-foreground">
            Disponível para administradores. Nenhum segredo é exibido.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void run()} disabled={state.status === "loading"}>
          {state.status === "loading" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Verificar configuração
        </Button>
      </div>

      {state.status === "denied" && (
        <p className="mt-3 text-sm text-muted-foreground">
          Diagnóstico disponível apenas para administradores.
        </p>
      )}

      {state.status === "ready" && (
        <div className="mt-4 space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Row label="Versão do Graph" value={state.check.graphVersion} />
            <Row label="App ID" value={state.check.appId ?? "não definido"} />
            <Row label="config_id" value={state.check.configId ?? "não definido"} />
            <Row label="Modo efetivo" value={state.check.mode === "classic" ? "Login clássico" : "Login para Empresas"} />
            <Row
              label="Permissões enviadas"
              value={state.check.mode === "classic" ? state.check.effectiveScopes.join(", ") : "Definidas no config_id da Meta"}
            />
            <Row label="URL de retorno" value={state.check.redirectUri ?? "não definida"} />
            <Row label="Site público" value={state.check.siteUrl ?? "não definido"} />
          </dl>

          <p
            className={
              state.check.loginConfiguration.ok
                ? "flex items-start gap-2 text-emerald-400"
                : "flex items-start gap-2 text-amber-400"
            }
          >
            {state.check.loginConfiguration.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{state.check.loginConfiguration.detail}</span>
          </p>

          {state.check.issues.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-300">
              {state.check.issues.map((issue) => (
                <li key={issue}>• {issue}</li>
              ))}
            </ul>
          ) : (
            <p className="text-emerald-400">Configuração do servidor completa.</p>
          )}

          {state.check.authorizationUrl && (
            <p className="break-all rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
              {state.check.authorizationUrl}
            </p>
          )}

          <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Checklist no painel da Meta</p>
            <ul className="mt-1 space-y-1">
              <li>• URIs de redirecionamento válidos: {state.check.redirectUri ?? "—"}</li>
              <li>
                • Adicione também {state.check.siteUrl ?? "https://seu-dominio"}/integracoes/instagram/callback
              </li>
              <li>• Domínio do SDK do JavaScript sem barra final</li>
              <li>• Ícone quadrado do app e Página do app associada</li>
              <li>• Configuração do Login para Empresas publicada e app em modo Ativo</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm">{value}</dd>
    </div>
  );
}
