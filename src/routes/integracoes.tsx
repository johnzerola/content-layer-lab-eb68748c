import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Star,
  Facebook,
  Instagram,
  Loader2,
  RefreshCw,
  ShieldCheck,
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
        content:
          "Conecte quantas contas do Instagram e Páginas do Facebook quiser para publicar em lote.",
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

const META_PLATFORMS: Array<{
  platform: "instagram" | "facebook";
  name: string;
  description: string;
  icon: typeof Instagram;
}> = [
  {
    platform: "instagram",
    name: "Instagram",
    description:
      "Reels, Feed e Stories. A autorização é feita pelo Facebook (o Instagram Profissional precisa estar vinculado a uma Página).",
    icon: Instagram,
  },
  {
    platform: "facebook",
    name: "Facebook",
    description: "Páginas com Reels e vídeos no Feed via Facebook Login.",
    icon: Facebook,
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
    void listAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
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
        // O mesmo Facebook Login autoriza a Página e a conta Instagram
        // profissional vinculada a ela.
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
        const sentScopes = authorizationUrl.searchParams.get("scope")?.split(",") ?? [];
        if (
          response.diagnostics.mode === "classic" &&
          response.diagnostics.requestedScopes.some((scope) => !sentScopes.includes(scope))
        ) {
          toast.error("A URL OAuth não contém todas as permissões obrigatórias.");
          return;
        }
        if (
          response.diagnostics.mode === "classic" &&
          authorizationUrl.searchParams.has("config_id")
        ) {
          toast.error("O modo clássico não pode enviar config_id.");
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

  const facebookAccounts = accounts.filter((account) => account.platform === "facebook");
  const instagramAccounts = accounts.filter((account) => account.platform === "instagram");
  const hasMetaAccounts = facebookAccounts.length + instagramAccounts.length > 0;
  const syncingMeta = busy === "facebook" || busy === "instagram";

  return (
    <AppShell
      mode={mode}
      onMode={setMode}
      count={jobs.length}
      onLibrary={() => {}}
      onCloud={() => {}}
    >
      <main className="w-full min-w-0">
        <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mono-label text-primary">Contas sociais</p>
            <h1 className="mt-2 font-display text-2xl font-bold">Facebook e Instagram</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              As Páginas autorizadas e seus Instagrams profissionais vinculados são sincronizados
              juntos pelo Login da Meta.
            </p>
          </div>
          {user && (
            <Button
              type="button"
              disabled={syncingMeta}
              onClick={() => void connect("facebook")}
              className="min-h-10 shrink-0"
            >
              {syncingMeta ? (
                <Loader2 className="size-4 animate-spin" />
              ) : hasMetaAccounts ? (
                <RefreshCw className="size-4" />
              ) : (
                <Facebook className="size-4" />
              )}
              {hasMetaAccounts ? "Atualizar seleção Meta" : "Conectar com a Meta"}
            </Button>
          )}
        </header>

        {user && <MetaDiagnosticsPanel />}

        {!user ? (
          <div className="border border-border bg-surface/60 p-6 text-center text-sm text-muted-foreground">
            Faça login na Nuvem para conectar suas contas.
          </div>
        ) : (
          <section className="border border-border/70 bg-surface/50">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-emerald-400" />
                Conexão oficial Meta
              </div>
              <p className="text-xs text-muted-foreground">
                {facebookAccounts.length} Página(s) · {instagramAccounts.length} Instagram
              </p>
            </div>
            <div className="grid md:grid-cols-2">
              {META_PLATFORMS.map((platform, index) => (
                <AccountsColumn
                  key={platform.platform}
                  platform={platform}
                  accounts={platform.platform === "facebook" ? facebookAccounts : instagramAccounts}
                  divided={index > 0}
                  onPrimary={choosePrimary}
                  onRemove={disconnect}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 grid gap-4 border-t border-border pt-5 text-xs text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <p className="font-medium text-foreground">Segurança da conexão</p>
            <p className="mt-1 max-w-3xl leading-relaxed">
              O VaiViral recebe tokens oficiais da Meta, armazena-os criptografados e nunca solicita
              sua senha. Você pode remover qualquer Página ou Instagram desta lista.
            </p>
          </div>
          <div className="flex gap-4">
            <a href="/privacidade" className="underline hover:text-foreground">
              Privacidade
            </a>
            <a href="/exclusao-de-dados" className="underline hover:text-foreground">
              Excluir dados
            </a>
          </div>
        </section>

        <section className="mt-6 border-t border-border pt-5">
          <p className="mono-label text-muted-foreground">Próximas integrações</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ComingSoon icon={Settings2} name="TikTok" />
            <ComingSoon icon={Youtube} name="YouTube" />
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function AccountsColumn({
  platform,
  accounts,
  divided,
  onPrimary,
  onRemove,
}: {
  platform: (typeof META_PLATFORMS)[number];
  accounts: SocialAccount[];
  divided: boolean;
  onPrimary: (account: SocialAccount) => Promise<void>;
  onRemove: (account: SocialAccount) => Promise<void>;
}) {
  const Icon = platform.icon;
  return (
    <div
      className={`min-w-0 p-4 sm:p-5 ${divided ? "border-t border-border md:border-l md:border-t-0" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center border border-primary/35 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{platform.name}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {platform.description}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {accounts.length === 0 && (
          <li className="border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhuma conta vinculada.
          </li>
        )}
        {accounts.map((account) => {
          const connected = account.status === "conectado" && account.provider !== "pending";
          const accountName = account.display_name || account.username;
          return (
            <li
              key={account.id}
              className="flex min-h-16 items-center gap-3 border border-border bg-surface-2 p-3"
            >
              {connected ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
              ) : (
                <TriangleAlert className="size-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {platform.platform === "instagram" ? "@" : ""}
                  {platform.platform === "instagram" ? account.username : accountName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {account.is_primary
                    ? "Conta principal"
                    : connected
                      ? "Pronta para publicar"
                      : "Reconexão necessária"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!connected || account.is_primary}
                onClick={() => void onPrimary(account)}
                aria-label={`Definir ${accountName} como conta principal`}
                title={account.is_primary ? "Conta principal" : "Definir como conta principal"}
                className={account.is_primary ? "text-amber-400" : "text-muted-foreground"}
              >
                <Star className={`size-4 ${account.is_primary ? "fill-current" : ""}`} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void onRemove(account)}
                aria-label={`Remover ${accountName}`}
                title="Remover conexão"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ComingSoon({ icon: Icon, name }: { icon: typeof Settings2; name: string }) {
  return (
    <div className="flex items-center gap-3 border border-border px-4 py-3 text-sm text-muted-foreground">
      <Icon className="size-4" />
      <span className="font-medium text-foreground">{name}</span>
      <span className="ml-auto flex items-center gap-1 text-xs">
        <Clock3 className="size-3.5" /> Em preparação
      </span>
    </div>
  );
}

type MetaCheck = {
  graphVersion: string;
  appId: string | null;
  configId: string | null;
  mode: "classic" | "business";
  usesConfigId: boolean;
  requiredScopes: string[];
  effectiveScopes: string[];
  permissionSource: "manual-scope" | "meta-business-configuration";
  permissionWarning: string | null;
  redirectUri: string | null;
  siteUrl: string | null;
  authorizationUrl: string | null;
  issues: string[];
  loginConfiguration: { checked: boolean; ok: boolean; detail: string };
};

function MetaDiagnosticsPanel() {
  const runDiagnosis = useServerFn(diagnoseFacebookIntegration);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "denied" }
    | { status: "ready"; check: MetaCheck }
  >({ status: "idle" });

  const run = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await runDiagnosis();
      setState(
        response.ok
          ? { status: "ready", check: response.check as MetaCheck }
          : { status: "denied" },
      );
    } catch {
      setState({ status: "denied" });
    }
  }, [runDiagnosis]);

  return (
    <section className="mb-6 rounded-lg border border-border/70 bg-surface/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Diagnóstico da integração Meta</h2>
          <p className="text-xs text-muted-foreground">
            Disponível para administradores. Nenhum segredo é exibido.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void run()}
          disabled={state.status === "loading"}
        >
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
            <Row
              label="Modo efetivo"
              value={state.check.mode === "classic" ? "Login clássico" : "Login para Empresas"}
            />
            <Row
              label="Usando config_id"
              value={
                state.check.usesConfigId ? `Sim (${state.check.configId ?? "configurado"})` : "Não"
              }
            />
            <Row label="Scopes obrigatórios" value={state.check.requiredScopes.join(",")} />
            <Row
              label="Scopes enviados pelo app"
              value={
                state.check.mode === "classic"
                  ? state.check.effectiveScopes.join(",")
                  : "Nenhum — definidos na configuração da Meta"
              }
            />
            <Row label="URL de retorno" value={state.check.redirectUri ?? "não definida"} />
            <Row label="Site público" value={state.check.siteUrl ?? "não definido"} />
          </dl>

          {state.check.permissionWarning && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{state.check.permissionWarning}</span>
            </p>
          )}

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
            <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-300">
              {state.check.issues.map((issue) => (
                <li key={issue}>• {issue}</li>
              ))}
            </ul>
          ) : (
            <p className="text-emerald-400">Configuração do servidor completa.</p>
          )}

          {state.check.authorizationUrl && (
            <p className="break-all rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
              {state.check.authorizationUrl}
            </p>
          )}

          <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Checklist no painel da Meta</p>
            <ul className="mt-1 space-y-1">
              <li>• URIs de redirecionamento válidos: {state.check.redirectUri ?? "—"}</li>
              <li>
                • Adicione também {state.check.siteUrl ?? "https://seu-dominio"}
                /integracoes/instagram/callback
              </li>
              <li>• Domínio do SDK do JavaScript sem barra final</li>
              <li>• Ícone quadrado do app e Página do app associada</li>
              {state.check.mode === "business" ? (
                <li>
                  • Configuração do Login para Empresas publicada com todos os scopes obrigatórios
                </li>
              ) : (
                <li>
                  • Em Permissões e recursos, pages_read_engagement deve estar adicionada, não
                  apenas encontrada no caso de uso
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm">{value}</dd>
    </div>
  );
}
