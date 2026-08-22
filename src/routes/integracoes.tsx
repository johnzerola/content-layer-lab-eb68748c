import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
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
import { beginInstagramOAuth } from "@/lib/meta-oauth.functions";
import { beginFacebookOAuth } from "@/lib/facebook-oauth.functions";
import { AppShell, type AppMode } from "@/components/AppShell";
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
    description: "Reels, Feed e Stories via login oficial da Meta.",
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
  const startInstagram = useServerFn(beginInstagramOAuth);
  const startFacebook = useServerFn(beginFacebookOAuth);

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
        const response =
          platform === "instagram" ? await startInstagram() : await startFacebook();
        if (!response.ok) {
          toast.error(response.error);
          return;
        }
        window.location.href = response.authorizationUrl;
      } catch {
        toast.error("Não foi possível iniciar a autorização.");
      } finally {
        setBusy(null);
      }
    },
    [startFacebook, startInstagram],
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
                              {connected ? "Pronta para publicar" : "Precisa reautorizar"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void disconnect(account)}
                            aria-label={`Remover ${account.username}`}
                            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    type="button"
                    disabled={!platform.available || busy === platform.platform}
                    onClick={() => void connect(platform.platform)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === platform.platform ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {platform.available ? "Adicionar conta" : "Em preparação"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}
