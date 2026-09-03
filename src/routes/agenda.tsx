import { RequireAuth } from "@/components/RequireAuth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Facebook,
  Instagram,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
  Youtube,
  Video,
} from "lucide-react";

import { AppShell, type AppMode } from "@/components/AppShell";
import { TemplateLibrary } from "@/components/TemplateLibrary";
import { CloudPanel } from "@/components/CloudPanel";
import { BulkScheduleModal } from "@/components/BulkScheduleModal";
import { ScheduleCalendar } from "@/components/ScheduleCalendar";
import { Button } from "@/components/ui/button";
import { listJobs } from "@/lib/jobs";
import type { Template } from "@/lib/template";
import {
  KIND_LABEL,
  STATUS_LABEL,
  cancelPost,
  deletePost,
  listAccounts,
  listPosts,
  removeAccount,
  reschedulePost,
  schedulePost,
  socialAccountDetail,
  socialAccountOptionLabel,
  socialAccountTitle,
  uploadPostVideo,
  type PostKind,
  type ScheduledPost,
  type SocialAccount,
} from "@/lib/social";

import { beginInstagramOAuth } from "@/lib/meta-oauth.functions";
import { publishPostNow } from "@/lib/publish.functions";
import { getSocialProfiles } from "@/lib/profiles.functions";
import {
  connectionHealth,
  connectionValidAt,
  friendlyPublishError,
  type ConnectionHealth,
} from "@/lib/social-health";
import { currentUser, onAuth, type CloudUser } from "@/lib/cloud";

export const Route = createFileRoute("/agenda")({
  component: GuardedAgendaPage,
  head: () => ({
    meta: [
      { title: "Agenda de postagens — VaiViral" },
      {
        name: "description",
        content:
          "Conecte contas do Instagram, envie os vídeos prontos e agende Reels, Feed e Stories para publicarem sozinhos no horário escolhido.",
      },
      { property: "og:title", content: "Agenda de postagens — VaiViral" },
      {
        property: "og:description",
        content:
          "Fila de publicação automática de Reels, Feed e Stories para as contas conectadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_STYLE: Record<string, string> = {
  agendado: "border-primary/40 bg-primary/12 text-primary",
  processando: "border-border bg-surface-2 text-muted-foreground",
  publicado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  falhou: "border-red-500/40 bg-red-500/10 text-red-400",
  cancelado: "border-border bg-surface-2 text-muted-foreground",
};

function AgendaPage() {
  const [mode, setMode] = useState<AppMode>("external");
  const [libOpen, setLibOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const jobs = listJobs();

  const [user, setUser] = useState<CloudUser | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);
  const startInstagramOAuth = useServerFn(beginInstagramOAuth);

  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [kind, setKind] = useState<PostKind>("reels");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState(() => localInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, ConnectionHealth>>({});
  const [tokenExpiry, setTokenExpiry] = useState<Record<string, string | null>>({});
  const [retryingAll, setRetryingAll] = useState(false);
  const runPublishNow = useServerFn(publishPostNow);
  const loadProfiles = useServerFn(getSocialProfiles);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const kindOptions = useMemo(() => {
    const platform = selectedAccount?.platform;
    if (platform === "youtube") {
      return [
        { value: "shorts", label: "Shorts (vertical)" },
        { value: "feed", label: "Vídeo longo" },
      ];
    }
    if (platform === "facebook") {
      return [
        { value: "reels", label: "Reels da Página" },
        { value: "feed", label: "Vídeo no Feed" },
      ];
    }
    return [
      { value: "reels", label: "Reels" },
      { value: "feed", label: "Feed" },
      { value: "stories", label: "Stories" },
    ];
  }, [selectedAccount]);

  useEffect(() => {
    if (!kindOptions.some((o) => o.value === kind)) {
      setKind(kindOptions[0]!.value as PostKind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindOptions]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([listAccounts(), listPosts()]);
      setAccounts(a);
      setPosts(p);
      if (!accountId && a[0]) setAccountId(a[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar a agenda.");
    } finally {
      setLoading(false);
    }
    try {
      const profiles = await loadProfiles();
      const nextHealth: Record<string, ConnectionHealth> = {};
      const nextExpiry: Record<string, string | null> = {};
      for (const prof of profiles) {
        nextHealth[prof.id] = connectionHealth({
          connectionStatus: prof.connectionStatus,
          tokenExpiresAt: prof.tokenExpiresAt,
          accountStatus: prof.status,
        });
        nextExpiry[prof.id] = prof.tokenExpiresAt;
      }
      setHealth(nextHealth);
      setTokenExpiry(nextExpiry);
    } catch {
      /* saúde das conexões é informativa; a agenda continua utilizável */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    void currentUser().then(setUser);
    return onAuth(setUser);
  }, []);

  useEffect(() => {
    if (user) void refresh();
    else {
      setAccounts([]);
      setPosts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const visiblePosts = useMemo(() => {
    if (!selectedDay) return posts;
    return posts.filter((p) => {
      const d = new Date(p.scheduled_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return key === selectedDay;
    });
  }, [posts, selectedDay]);

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of visiblePosts) {
      const key = new Date(p.scheduled_at).toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      });
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [visiblePosts]);

  const failedPosts = useMemo(() => posts.filter((p) => p.status === "falhou"), [posts]);

  const connectionAlerts = useMemo(
    () =>
      accounts
        .map((a) => ({ account: a, state: health[a.id] }))
        .filter(
          (row): row is { account: SocialAccount; state: ConnectionHealth } =>
            !!row.state && (row.state.level === "warn" || row.state.level === "expired"),
        ),
    [accounts, health],
  );

  const scheduleWarning = useMemo(() => {
    if (!accountId) return null;
    const state = health[accountId];
    if (state && (state.level === "expired" || state.level === "missing")) return state.message;
    const at = new Date(when);
    if (!Number.isFinite(at.getTime())) return null;
    if (!connectionValidAt(tokenExpiry[accountId], at)) {
      return "A conexão desta conta expira antes do horário escolhido. Reconecte-a para o post publicar.";
    }
    if (state?.level === "warn") return state.message;
    return null;
  }, [accountId, health, tokenExpiry, when]);

  async function onRetryAllFailed() {
    if (!failedPosts.length) return;
    setRetryingAll(true);
    try {
      await Promise.all(
        failedPosts.map((p) => reschedulePost(p.id, new Date(Date.now() + 60 * 1000))),
      );
      toast.success(`${failedPosts.length} publicação(ões) reenviada(s) para a fila.`);
      await refresh();
    } catch {
      toast.error("Não foi possível reenviar todas as publicações.");
    } finally {
      setRetryingAll(false);
    }
  }

  async function onAddAccount() {
    setLinkingAccount(true);
    try {
      const result = await startInstagramOAuth();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível adicionar.");
    } finally {
      setLinkingAccount(false);
    }
  }

  async function onPublishNow(postId: string) {
    setPublishingId(postId);
    try {
      const result = await runPublishNow({ data: { postId } });
      if (result.ok) {
        toast.success(
          result.permalink ? `Publicado: ${result.permalink}` : "Publicado com sucesso.",
        );
      } else {
        toast.error(result.error);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar agora.");
    } finally {
      setPublishingId(null);
    }
  }

  async function onSchedule() {
    if (!file) {
      toast.error("Escolha o vídeo que será publicado.");
      return;
    }
    setSending(true);
    try {
      const up = await uploadPostVideo(file, file.name);
      await schedulePost({
        accountId: accountId || null,
        kind,
        caption,
        scheduledAt: new Date(when),
        videoPath: up.path,
        videoUrl: up.url,
        fileName: file.name,
        consent,
      });
      setFile(null);
      setCaption("");
      setConsent(false);
      toast.success("Publicação agendada.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao agendar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell
      mode="lote"

      onMode={setMode}
      count={jobs.length}
      onLibrary={() => setLibOpen(true)}
      onCloud={() => setCloudOpen(true)}
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <section className="mb-6 rounded-2xl border border-border/70 bg-[var(--gradient-surface)] p-5 shadow-[var(--shadow-panel)]">
          <p className="mono-label flex items-center gap-2 text-primary">
            <CalendarClock className="size-3.5" /> publicação automática
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
            Seus vídeos vão ao ar sozinhos
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Envie o MP4 pronto, escolha a conta, o formato e a hora. A publicacao automatica so roda
            em contas conectadas por OAuth/API oficial; contas digitadas manualmente ficam como
            rascunho ate a conexao real ser configurada.
          </p>
        </section>

        {!user && (
          <div className="rounded-2xl border border-border bg-surface/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Faça login na aba <strong className="text-foreground">Nuvem</strong> para conectar
              contas e agendar publicações.
            </p>
          </div>
        )}

        {user && (connectionAlerts.length > 0 || failedPosts.length > 0) && (
          <div className="mb-6 flex flex-col gap-3">
            {connectionAlerts.length > 0 && (
              <div
                role="status"
                className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-300">
                    {connectionAlerts.length === 1
                      ? "Uma conta precisa ser reconectada"
                      : `${connectionAlerts.length} contas precisam ser reconectadas`}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-amber-200/80">
                    {connectionAlerts.map(({ account, state }) => (
                      <li key={account.id}>
                        {socialAccountTitle(account)} — {state.message}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  to="/integracoes"
                  className="interactive inline-flex min-h-11 items-center rounded-xl border border-amber-500/40 px-3 text-xs font-medium text-amber-200"
                >
                  Reconectar
                </Link>
              </div>
            )}

            {failedPosts.length > 0 && (
              <div
                role="status"
                className="flex flex-wrap items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-red-300">
                    {failedPosts.length === 1
                      ? "1 publicação falhou"
                      : `${failedPosts.length} publicações falharam`}
                  </p>
                  <p className="mt-1 text-xs text-red-200/80">
                    {friendlyPublishError(failedPosts[0]?.error_code, failedPosts[0]?.error)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onRetryAllFailed()}
                  disabled={retryingAll}
                  className="interactive inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-red-500/40 px-3 text-xs font-medium text-red-200 disabled:opacity-60"
                >
                  {retryingAll ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                  )}
                  Tentar todas de novo
                </button>
              </div>
            )}
          </div>
        )}

        {user && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
            <div className="flex flex-col gap-6">
              {/* contas */}
              <section className="rounded-2xl border border-border/70 bg-surface/60 p-5">
                <p className="mono-label pb-3">Contas conectadas</p>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm">
                    <Instagram className="size-4 text-pink-400" />
                    <span>Instagram</span>
                    <Facebook className="size-4 text-sky-400" />
                    <span>Facebook</span>
                  </div>
                  <Link
                    to="/integracoes"
                    className="interactive flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
                  >
                    <Plus className="size-4" />
                    Add
                  </Link>
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {accounts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/35 bg-primary/12 text-primary">
                        {a.platform === "youtube" ? (
                          <Youtube className="size-4" />
                        ) : a.platform === "tiktok" ? (
                          <Video className="size-4" />
                        ) : a.platform === "facebook" ? (
                          <Facebook className="size-4" />
                        ) : (
                          <Instagram className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-medium">
                            {socialAccountTitle(a)}
                          </span>
                          {health[a.id]?.badge && (
                            <Link
                              to="/integracoes"
                              title={health[a.id]?.message ?? undefined}
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                health[a.id]?.level === "warn"
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                  : "border-red-500/40 bg-red-500/10 text-red-300"
                              }`}
                            >
                              {health[a.id]?.badge}
                            </Link>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {socialAccountDetail(a)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {a.status === "connected" || a.status === "conectado"
                            ? `conectada via ${a.provider}`
                            : a.status === "aguardando provedor"
                              ? "pendente: aguardando configuração da API"
                              : "rascunho; falta OAuth/API"}
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={async () => {
                          await removeAccount(a.id);
                          await refresh();
                        }}
                        aria-label={`Remover @${a.username}`}
                        className="interactive grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:text-red-400"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                  {!accounts.length && (
                    <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                      nenhuma conta ainda
                    </li>
                  )}
                </ul>
              </section>

              {/* novo agendamento */}
              <section className="rounded-2xl border border-border/70 bg-surface/60 p-5">
                <div className="flex items-center justify-between gap-3 pb-3">
                  <p className="mono-label">Nova publicação</p>
                  <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                    <CalendarClock className="mr-1 size-4" />
                    Agendar em massa
                  </Button>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-surface-2 px-3 py-4 text-sm text-muted-foreground transition hover:text-foreground">
                  <UploadCloud className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {file ? file.name : "Escolher vídeo MP4 exportado"}
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                {previewUrl && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-border bg-black">
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      className="mx-auto max-h-64 w-full object-contain"
                    />
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="mono-label">Conta</span>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none"
                    >
                      <option value="">— selecionar —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {socialAccountOptionLabel(a)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="mono-label">Formato</span>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as PostKind)}
                      className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none"
                    >
                      {kindOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="mono-label">Legenda</span>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={3}
                    placeholder="Escreva a legenda com hashtags…"
                    className="resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </label>

                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="mono-label">Data e hora</span>
                  <input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none"
                  />
                </label>

                <label className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span>
                    Confirmo que tenho direito de publicar este vídeo e autorizo o envio do arquivo
                    à rede social escolhida no horário agendado.
                  </span>
                </label>

                {scheduleWarning && (
                  <p
                    role="status"
                    className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {scheduleWarning}{" "}
                      <Link to="/integracoes" className="underline underline-offset-2">
                        Reconectar agora
                      </Link>
                    </span>
                  </p>
                )}

                <button
                  onClick={onSchedule}
                  disabled={sending}
                  className="interactive mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CalendarClock className="size-4" />
                  )}
                  {sending ? "Enviando…" : "Agendar publicação"}
                </button>
              </section>
            </div>

            {/* calendário + fila */}
            <div className="flex flex-col gap-6">
              <ScheduleCalendar
                posts={posts}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />

              <section className="rounded-2xl border border-border/70 bg-surface/60 p-5">
              <div className="flex items-center justify-between pb-3">
                <p className="mono-label">
                  Fila{selectedDay ? " · dia selecionado" : ""}
                </p>
                {loading && (
                  <Loader2
                    className="size-4 animate-spin text-muted-foreground"
                    aria-label="Carregando agenda"
                  />
                )}
              </div>

              {!visiblePosts.length && (
                <p className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-[12px] text-muted-foreground">
                  nada agendado ainda
                </p>
              )}

              <div className="flex flex-col gap-5">
                {grouped.map(([day, list]) => (
                  <div key={day}>
                    <p className="mono-label pb-2 text-primary">{day}</p>
                    <ul className="flex flex-col gap-2">
                      {list.map((p) => (
                        <li key={p.id} className="rounded-xl border border-border bg-surface-2 p-3">
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground">
                              {new Date(p.scheduled_at).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {KIND_LABEL[p.kind] ?? p.kind} · {p.file_name ?? "vídeo"}
                              </p>
                              {p.caption && (
                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                  {p.caption}
                                </p>
                              )}
                              {p.error && (
                                <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                                  <p className="text-[11px] leading-tight text-red-400">
                                    ERRO: {p.error}
                                  </p>
                                </div>
                              )}
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                                STATUS_STYLE[p.status] ?? "border-border text-muted-foreground"
                              }`}
                            >
                              {STATUS_LABEL[p.status] ?? p.status}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/50 pt-2">
                            {(p.status === "falhou" || p.status === "agendado") && (
                              <button
                                type="button"
                                disabled={publishingId === p.id}
                                onClick={() => void onPublishNow(p.id)}
                                aria-label={`Publicar agora: ${p.file_name ?? "vídeo"}`}
                                className="interactive inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
                              >
                                {publishingId === p.id ? (
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <UploadCloud className="size-3.5" aria-hidden="true" />
                                )}
                                {publishingId === p.id ? "Publicando…" : "Publicar agora"}
                              </button>
                            )}
                            {p.status === "falhou" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await reschedulePost(
                                      p.id,
                                      new Date(Date.now() + 5 * 60 * 1000),
                                    );
                                    toast.success("Publicação reenviada para a fila.");
                                    await refresh();
                                  } catch {
                                    toast.error("Falha ao re-agendar.");
                                  }
                                }}
                                aria-label={`Re-agendar ${p.file_name ?? "vídeo"}`}
                                className="interactive inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition hover:text-foreground"
                              >
                                Re-agendar
                              </button>
                            )}
                            {p.status === "agendado" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await cancelPost(p.id);
                                  await refresh();
                                }}
                                aria-label={`Cancelar ${p.file_name ?? "vídeo"}`}
                                className="interactive inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition hover:text-foreground"
                              >
                                <X className="size-3.5" aria-hidden="true" /> Cancelar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await deletePost(p.id);
                                await refresh();
                              }}
                              aria-label={`Excluir ${p.file_name ?? "vídeo"} da agenda`}
                              className="interactive inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition hover:text-red-400"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" /> Excluir
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {libOpen && (
        <TemplateLibrary
          templates={templates}
          activeId=""
          onClose={() => setLibOpen(false)}
          onChangeList={setTemplates}
          onUse={() => {}}
          onCommit={(t) => t}
        />
      )}

      {cloudOpen && (
        <CloudPanel
          templates={templates}
          onClose={() => setCloudOpen(false)}
          onChangeList={setTemplates}
          mode={mode}
          buildSnapshot={() => ({ items: [] })}
          onRestore={() => {}}
        />
      )}

      <BulkScheduleModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        accounts={accounts}
        onDone={() => void refresh()}
      />
    </AppShell>
  );
}

function GuardedAgendaPage() {
  return (
    <RequireAuth
      title={"Agenda requer login"}
      description={"Entre para conectar suas contas e agendar publicações automáticas."}
    >
      <AgendaPage />
    </RequireAuth>
  );
}
