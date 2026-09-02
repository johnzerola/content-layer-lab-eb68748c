/** Contas: credenciais salvas de YouTube, Instagram e TikTok usadas pelo agendamento. */
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import {
  deleteManualCredential,
  listManualCredentials,
  MANUAL_PLATFORMS,
  saveManualCredential,
  type ManualCredentialSummary,
  type ManualPlatform,
} from "@/lib/manual-credentials.functions";

export const Route = createFileRoute("/contas")({
  head: () => ({
    meta: [
      { title: "Contas e credenciais — VaiViral" },
      {
        name: "description",
        content: "Salve com segurança as credenciais de YouTube, Instagram e TikTok para o agendamento publicar sozinho.",
      },
      { property: "og:title", content: "Contas e credenciais — VaiViral" },
      {
        property: "og:description",
        content: "Guarde tokens criptografados por plataforma e deixe a fila de publicação usar automaticamente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ContasPage />
    </RequireAuth>
  ),
});

const LABELS: Record<ManualPlatform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

function ContasPage() {
  const list = useServerFn(listManualCredentials);
  const save = useServerFn(saveManualCredential);
  const remove = useServerFn(deleteManualCredential);

  const [items, setItems] = useState<ManualCredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<ManualPlatform>("youtube");
  const [label, setLabel] = useState("");
  const [handle, setHandle] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar credenciais.");
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (accessToken.trim().length < 8) {
      toast.error("Cole um token válido.");
      return;
    }
    setSaving(true);
    try {
      const res = await save({
        data: {
          platform,
          label: label.trim(),
          handle: handle.trim(),
          accessToken: accessToken.trim(),
          refreshToken: refreshToken.trim(),
          expiresAt: expiresAt.trim(),
          extra: {},
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Credencial salva com segurança.");
      setAccessToken("");
      setRefreshToken("");
      void load();
    } catch {
      toast.error("Não foi possível salvar agora.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header>
        <p className="mono-label">Publicação</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Contas e credenciais</h1>
        <p className="text-sm text-muted-foreground">
          Guarde aqui os tokens de cada plataforma. Eles são criptografados no servidor, nunca voltam ao navegador e são
          usados automaticamente pela fila de agendamento. Para conectar por login social, use{" "}
          <Link to="/perfis" className="underline">
            Perfis
          </Link>
          .
        </p>
      </header>

      <section className="glass space-y-3 rounded-2xl border border-border/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="mono-label">Plataforma</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ManualPlatform)}
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            >
              {MANUAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="mono-label">Apelido da conta</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Canal principal"
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="mono-label">@ do perfil</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="seucanal"
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="mono-label">Expira em (opcional)</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="mono-label">Access token</span>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="mono-label">Refresh token (opcional)</span>
            <input
              type="password"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="interactive rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar credencial"}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Credenciais salvas</h2>
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!loading && !items.length && (
          <p className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Nenhuma credencial salva ainda.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((c) => (
            <article key={c.id} className="glass flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {LABELS[c.platform]} · {c.label || c.handle || "conta"}
                </p>
                <p className="mono-label truncate">{c.masked}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.hasRefresh ? "com refresh · " : ""}
                  {c.expiresAt ? `expira ${new Date(c.expiresAt).toLocaleDateString("pt-BR")}` : "sem validade definida"}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-destructive underline"
                onClick={async () => {
                  if (!window.confirm("Remover esta credencial?")) return;
                  const res = await remove({ data: { id: c.id } });
                  if (!res.ok) toast.error(res.error);
                  void load();
                }}
              >
                Remover
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
