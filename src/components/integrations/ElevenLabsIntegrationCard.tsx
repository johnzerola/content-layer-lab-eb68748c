import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  connectElevenLabs,
  disconnectElevenLabs,
  getElevenLabsConnection,
  type ElevenLabsConnectionStatus,
} from "@/lib/elevenlabs.functions";

const EMPTY_STATUS: ElevenLabsConnectionStatus = {
  connected: false,
  maskedKey: "",
  accountLabel: "",
  voiceCount: 0,
  updatedAt: null,
};

export function ElevenLabsIntegrationCard() {
  const getStatus = useServerFn(getElevenLabsConnection);
  const connect = useServerFn(connectElevenLabs);
  const disconnect = useServerFn(disconnectElevenLabs);
  const [status, setStatus] = useState<ElevenLabsConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [accountLabel, setAccountLabel] = useState("Minha ElevenLabs");

  const reload = useCallback(async () => {
    setLoading(true);
    setStatusError("");
    try {
      setStatus(await getStatus());
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Não foi possível verificar a integração.",
      );
    } finally {
      setLoading(false);
    }
  }, [getStatus]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async () => {
    if (saving || loading) return;
    setActionError("");
    if (apiKey.trim().length < 12) {
      setActionError("Cole uma chave de API válida da ElevenLabs.");
      return;
    }
    setSaving(true);
    try {
      const result = await connect({
        data: { apiKey: apiKey.trim(), accountLabel: accountLabel.trim() },
      });
      setStatus({
        connected: true,
        maskedKey: `••••${apiKey.trim().slice(-4)}`,
        accountLabel: accountLabel.trim() || "Minha ElevenLabs",
        voiceCount: result.voiceCount,
        updatedAt: new Date().toISOString(),
      });
      setApiKey("");
      setShowKey(false);
      toast.success(`ElevenLabs conectada. ${result.voiceCount} vozes encontradas.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível validar a chave.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (removing) return;
    if (
      !window.confirm(
        "Desconectar a ElevenLabs? Os projetos mantêm as escolhas, mas não poderão gerar novas falas.",
      )
    )
      return;
    setRemoving(true);
    setActionError("");
    try {
      const result = await disconnect();
      if (!result.ok) throw new Error(result.error);
      setStatus(EMPTY_STATUS);
      setStatusError("");
      toast.success("ElevenLabs desconectada.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Não foi possível desconectar. Tente novamente.",
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section
      id="elevenlabs"
      className="glass scroll-mt-6 overflow-hidden rounded-2xl border border-border/60"
      aria-labelledby="elevenlabs-title"
    >
      <div className="flex flex-col gap-3 border-b border-border/60 bg-gradient-to-r from-primary/10 via-transparent to-transparent p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <p className="mono-label text-primary">Vozes por IA</p>
            <h2 id="elevenlabs-title" className="mt-1 text-lg font-semibold">
              ElevenLabs
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Use as vozes disponíveis na sua conta em cada personagem do ChatScene. A chave é
              validada e criptografada no servidor; ela nunca volta ao navegador.
            </p>
          </div>
        </div>
        {loading ? (
          <span
            role="status"
            className="inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />{" "}
            Verificando
          </span>
        ) : statusError ? (
          <span className="inline-flex min-h-9 items-center gap-2 text-xs text-destructive">
            <TriangleAlert className="size-4" aria-hidden /> Verificação indisponível
          </span>
        ) : status?.connected ? (
          <span
            role="status"
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-emerald-500/10 px-3 text-xs font-medium text-emerald-400"
          >
            <CheckCircle2 className="size-4" aria-hidden /> Conectada
          </span>
        ) : (
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-muted px-3 text-xs text-muted-foreground">
            <KeyRound className="size-4" aria-hidden /> Não conectada
          </span>
        )}
      </div>

      <div className="space-y-4 p-4">
        {statusError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p role="alert" className="break-words text-sm text-destructive">
              {statusError}
            </p>
            <Button
              variant="outline"
              className="mt-2 min-h-11"
              disabled={loading}
              onClick={() => void reload()}
            >
              Tentar verificar novamente
            </Button>
          </div>
        ) : null}
        {actionError ? (
          <p
            id="elevenlabs-action-error"
            role="alert"
            className="break-words text-sm text-destructive"
          >
            {actionError}
          </p>
        ) : null}
        {status?.connected ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="rounded-xl border border-border/60 bg-background/45 p-3">
              <p className="break-words text-sm font-medium">
                {status.accountLabel || "Minha ElevenLabs"}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {status.maskedKey} · {status.voiceCount} vozes na última verificação
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Abra o ChatScene → Vozes e atuação para carregar o catálogo e escolher uma voz por
                personagem.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col">
              <Button asChild className="min-h-11">
                <Link to="/chatscene">Escolher vozes</Link>
              </Button>
              <Button
                variant="outline"
                className="min-h-11 text-destructive"
                disabled={removing}
                onClick={() => void remove()}
              >
                {removing ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                {removing ? "Desconectando…" : "Desconectar"}
              </Button>
            </div>
          </div>
        ) : status && !loading && !statusError ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            aria-busy={saving}
          >
            <ol className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <li className="rounded-xl border border-border/60 bg-background/35 p-3">
                <strong className="mb-1 block text-foreground">1. Acesse sua conta</strong>
                Entre ou crie uma conta gratuita no painel da ElevenLabs.
              </li>
              <li className="rounded-xl border border-border/60 bg-background/35 p-3">
                <strong className="mb-1 block text-foreground">2. Crie uma chave restrita</strong>
                Libere apenas Voices e Text to Speech e defina um limite de créditos.
              </li>
              <li className="rounded-xl border border-border/60 bg-background/35 p-3">
                <strong className="mb-1 block text-foreground">3. Valide e use</strong>
                Cole a chave abaixo; o VaiViral testa a conexão antes de salvar.
              </li>
            </ol>

            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noreferrer"
              className="interactive inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Abrir chaves da ElevenLabs <ExternalLink className="size-4" aria-hidden />
            </a>

            <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs">
                <span className="font-medium">Nome desta conexão</span>
                <input
                  name="elevenlabs-connection-name"
                  maxLength={80}
                  autoComplete="off"
                  value={accountLabel}
                  onChange={(event) => setAccountLabel(event.target.value)}
                  className="h-11 w-full rounded-lg border border-border/60 bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Minha ElevenLabs"
                />
              </label>
              <label className="space-y-1.5 text-xs">
                <span className="font-medium">Chave de API</span>
                <span className="relative block">
                  <input
                    name="elevenlabs-api-key"
                    type={showKey ? "text" : "password"}
                    required
                    minLength={12}
                    maxLength={300}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-11 w-full rounded-lg border border-border/60 bg-background px-3 pr-11 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-describedby={`elevenlabs-key-help${actionError ? " elevenlabs-action-error" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                    aria-pressed={showKey}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>
            </fieldset>
            <p id="elevenlabs-key-help" className="text-xs text-muted-foreground">
              A chave é enviada uma vez ao servidor, criptografada e exibida depois apenas pelos
              últimos quatro caracteres.
            </p>
            <Button type="submit" disabled={saving} className="min-h-11">
              {saving ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <KeyRound className="size-4" aria-hidden />
              )}
              {saving ? "Verificando chave…" : "Conectar ElevenLabs"}
            </Button>
          </form>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Consultando sua conexão salva…</p>
        ) : null}

        <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
          <p>
            O plano grátis oferece cota limitada e é destinado a uso pessoal/não comercial com
            atribuição. Para vídeos monetizados, confira a licença do seu plano antes de publicar.
          </p>
        </div>
      </div>
    </section>
  );
}
