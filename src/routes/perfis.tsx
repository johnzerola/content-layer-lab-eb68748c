import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSocialProfiles, type ProfileStats } from "@/lib/profiles.functions";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Facebook,
  Instagram,
  Loader2,
  RefreshCcw,
  Users,
  Youtube,
} from "lucide-react";

export const Route = createFileRoute("/perfis")({
  head: () => ({
    meta: [
      { title: "Perfis Meta — Páginas, Instagram e canais | VaiViral" },
      {
        name: "description",
        content:
          "Veja Páginas do Facebook, contas do Instagram e canais do YouTube conectados, com status de publicação, próximo agendamento e estatísticas.",
      },
      { property: "og:title", content: "Perfis Meta — Páginas, Instagram e canais" },
      {
        property: "og:description",
        content: "Status de publicação, próximo agendamento e estatísticas por perfil conectado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardedProfilesPage,
});

const KIND_LABEL: Record<string, string> = {
  reels: "Reels",
  stories: "Stories",
  feed: "Feed",
  video: "Vídeo",
  short: "Short",
};

function platformMeta(p: ProfileStats) {
  const plat = p.platform.toLowerCase();
  if (plat.includes("insta"))
    return { Icon: Instagram, label: "Instagram", tone: "text-pink-400" };
  if (plat.includes("you")) return { Icon: Youtube, label: "YouTube", tone: "text-red-400" };
  if (plat.includes("face") || plat.includes("page"))
    return { Icon: Facebook, label: "Facebook", tone: "text-blue-400" };
  return { Icon: Users, label: p.platform, tone: "text-muted-foreground" };
}

function fmt(dt: string | null) {
  if (!dt) return null;
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function ProfileCard({ p }: { p: ProfileStats }) {
  const { Icon, label, tone } = platformMeta(p);
  const tokenExpired = p.tokenExpiresAt ? new Date(p.tokenExpiresAt).getTime() < Date.now() : false;
  const healthy = p.status === "conectado" && !tokenExpired && p.connectionStatus !== "erro";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        {p.avatarUrl ? (
          <img
            src={p.avatarUrl}
            alt={`Foto do perfil ${p.displayName || p.username}`}
            className="size-10 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface-2">
            <Icon className={`size-5 ${tone}`} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">{p.displayName || p.username}</CardTitle>
          <CardDescription className="truncate text-[12px]">
            {label} · @{p.username}
            {p.isPrimary ? " · principal" : ""}
          </CardDescription>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
            healthy
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {healthy ? "pronto p/ publicar" : tokenExpired ? "token expirado" : p.status}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { k: "Publicados", v: p.published },
            { k: "Agendados", v: p.scheduled },
            { k: "Na fila", v: p.processing },
            { k: "Falhas", v: p.failed },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-border bg-surface-2 p-2">
              <p className="font-display text-lg font-bold">{s.v}</p>
              <p className="text-[11px] text-muted-foreground">{s.k}</p>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 text-[12px]">
          <p className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="size-3.5 shrink-0" />
            {p.nextScheduledAt ? (
              <span className="text-foreground">
                Próximo: {fmt(p.nextScheduledAt)}
                {p.nextScheduledKind
                  ? ` · ${KIND_LABEL[p.nextScheduledKind] ?? p.nextScheduledKind}`
                  : ""}
              </span>
            ) : (
              "Nenhum agendamento futuro"
            )}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0" />
            {p.lastPublishedAt ? (
              p.lastPermalink ? (
                <a
                  href={p.lastPermalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-2"
                >
                  Último post: {fmt(p.lastPublishedAt)}
                </a>
              ) : (
                <span className="text-foreground">Último post: {fmt(p.lastPublishedAt)}</span>
              )
            ) : (
              "Ainda sem publicações"
            )}
          </p>
          {p.tokenExpiresAt && (
            <p className="text-muted-foreground">
              Token válido até {fmt(p.tokenExpiresAt)}
            </p>
          )}
          {p.lastError && (
            <p className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="break-words">{p.lastError}</span>
            </p>
          )}
        </div>

        {p.byKind.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.byKind.map((k) => (
              <span
                key={k.kind}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {(KIND_LABEL[k.kind] ?? k.kind)}: {k.count}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button asChild size="sm" variant="secondary" className="flex-1">
            <Link to="/agenda">Agendar</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link to="/integracoes">{healthy ? "Gerenciar" : "Reconectar"}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfilesPage() {
  const { data: profiles = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["social-profiles"],
    queryFn: () => getSocialProfiles(),
  });

  const groups = [
    { label: "Páginas do Facebook", test: (p: ProfileStats) => /face|page/i.test(p.platform) },
    { label: "Contas do Instagram", test: (p: ProfileStats) => /insta/i.test(p.platform) },
    { label: "Canais do YouTube", test: (p: ProfileStats) => /you/i.test(p.platform) },
    {
      label: "Outros perfis",
      test: (p: ProfileStats) => !/face|page|insta|you/i.test(p.platform),
    },
  ];

  const totals = profiles.reduce(
    (acc, p) => ({
      published: acc.published + p.published,
      scheduled: acc.scheduled + p.scheduled,
      failed: acc.failed + p.failed,
    }),
    { published: 0, scheduled: 0, failed: 0 },
  );

  return (
    <AppShell mode="lote" onMode={() => {}} count={0} onLibrary={() => {}} onCloud={() => {}}>
      <div className="mx-auto max-w-7xl space-y-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Perfis Meta</h1>
            <p className="text-xs text-muted-foreground">
              Páginas, Instagram e canais conectados — status de publicação e próximo agendamento.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 size-4" />
            )}
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Perfis conectados", v: profiles.length },
            { k: "Publicados", v: totals.published },
            { k: "Agendados", v: totals.scheduled },
            { k: "Falhas", v: totals.failed },
          ].map((s) => (
            <Card key={s.k}>
              <CardContent className="p-4">
                <p className="font-display text-2xl font-bold">{s.v}</p>
                <p className="text-[11px] text-muted-foreground">{s.k}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando perfis…</p>
        ) : profiles.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum perfil conectado ainda. Conecte suas Páginas, Instagram e canais.
              </p>
              <Button asChild size="sm">
                <Link to="/integracoes">Conectar perfis</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          groups.map((g) => {
            const items = profiles.filter(g.test);
            if (items.length === 0) return null;
            return (
              <section key={g.label} className="space-y-3">
                <h2 className="mono-label">{g.label}</h2>
                <div className="stack-in grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((p) => (
                    <ProfileCard key={p.id} p={p} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

function GuardedProfilesPage() {
  return (
    <RequireAuth
      title="Perfis requer login"
      description="Entre para ver suas Páginas, contas do Instagram e canais conectados."
    >
      <ProfilesPage />
    </RequireAuth>
  );
}
