/** Página de cortes: gera cortes reais, mostra timeline + prévia e aplica templates. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/base";
import { findClips } from "@/lib/clips";
import { CutLibrary } from "@/components/CutLibrary";
import {
  captureCutThumbnail,
  cutAsSource,
  cutBinding,
  cutDuration,
  cutsFromClips,
  getSourceFile,
  loadCuts,
  registerSourceFile,
  removeCut,
  sourceIdFor,
  upsertCuts,
  type CutRecord,
} from "@/lib/editor/cuts";
import { publishCuts } from "@/lib/editor/cuts.service";
import { createInstance, listMyTemplates, updateInstance } from "@/lib/video-template/service";
import type { VideoTemplateRecord } from "@/lib/video-template/types";

export const Route = createFileRoute("/cortes")({
  head: () => ({
    meta: [
      { title: "Cortes com timeline e prévia — VaiViral" },
      {
        name: "description",
        content:
          "Gere cortes automáticos do seu vídeo, ajuste na timeline, veja a prévia e aplique um template ao corte escolhido.",
      },
      { property: "og:title", content: "Cortes com timeline e prévia — VaiViral" },
      {
        property: "og:description",
        content: "Timeline, prévia e aplicação de template no corte real, pronto para renderizar em 1080x1920.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth title="Cortes" description="Entre na sua conta para gerar e salvar cortes.">
      <CutsPage />
    </RequireAuth>
  ),
});

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function CutsPage() {
  const navigate = useNavigate();
  const [cuts, setCuts] = useState<CutRecord[]>([]);
  const [templates, setTemplates] = useState<VideoTemplateRecord[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setCuts(loadCuts());
    void listMyTemplates()
      .then((t) => {
        setTemplates(t);
        setTemplateId(t[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const current = useMemo(() => cuts.find((c) => c.id === selected) ?? null, [cuts, selected]);
  const visible = useMemo(
    () => (file ? cuts.filter((c) => c.sourceId === sourceIdFor(file)) : cuts),
    [cuts, file],
  );

  const pickFile = async (f: File) => {
    if (url) URL.revokeObjectURL(url);
    const next = URL.createObjectURL(f);
    setFile(f);
    setUrl(next);
    registerSourceFile(sourceIdFor(f), f);
    setSelected(null);
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setProgress(0);
    try {
      const clips = await findClips(file, { minLen: 15, maxLen: 60, max: 20, onProgress: setProgress });
      if (!clips.length) {
        toast.info("Nenhum corte encontrado neste vídeo.");
        return;
      }
      const generated = cutsFromClips(clips, file);
      const next = upsertCuts(generated);
      setCuts(next);
      setSelected(generated[0]?.id ?? null);
      toast.success(`${clips.length} cortes gerados.`);
      void publishToLibrary(generated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao analisar o vídeo.");
    } finally {
      setAnalyzing(false);
    }
  };

  /** Publica os cortes na biblioteca real, com miniatura e legenda. */
  const publishToLibrary = async (list: CutRecord[]) => {
    if (!file || !list.length) return;
    setPublishing(true);
    try {
      const thumbs: Record<string, string | null> = {};
      for (const cut of list) {
        thumbs[cut.id] = await captureCutThumbnail(file, cut.start + Math.min(1, cutDuration(cut) / 4));
      }
      await publishCuts(list, thumbs);
      setLibraryKey((k) => k + 1);
      toast.success("Cortes publicados na biblioteca.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível publicar na biblioteca.");
    } finally {
      setPublishing(false);
    }
  };

  const preview = (cut: CutRecord) => {
    setSelected(cut.id);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = cut.start;
    void v.play().catch(() => undefined);
  };

  // pausa a prévia no fim do corte
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current) return;
    const onTime = () => {
      if (v.currentTime >= current.end) v.pause();
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [current]);

  const applyTemplate = async () => {
    const template = templates.find((t) => t.id === templateId);
    if (!template || !current) return;
    setApplying(true);
    try {
      const instance = await createInstance(template, {
        ...cutAsSource(current, `cut://${current.id}`),
      });
      await updateInstance(instance.id, {
        ...instance.instance_data,
        settings: { ...(instance.instance_data.settings ?? {}), cut: cutBinding(current) },
      });
      toast.success("Template aplicado ao corte. Abrindo projetos…");
      void navigate({ to: "/projetos" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível aplicar o template.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <p className="mono-label">Etapa 1 · Cortes</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Cortes com timeline e prévia</h1>
        <p className="text-sm text-muted-foreground">
          Gere cortes reais do seu vídeo, confira na prévia e aplique um template ao corte escolhido.
        </p>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-xl border border-border/60 px-3 py-2 text-sm">
            {file ? "Trocar vídeo" : "Escolher vídeo"}
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
              }}
            />
          </label>
          {file && <span className="truncate text-sm text-muted-foreground">{file.name}</span>}
          <Button onClick={() => void analyze()} disabled={!file || analyzing}>
            {analyzing ? `Analisando… ${Math.round(progress * 100)}%` : "Gerar cortes"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void publishToLibrary(visible)}
            disabled={!file || !visible.length || publishing}
          >
            {publishing ? "Publicando…" : "Publicar na biblioteca"}
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-black">
            {url ? (
              <video
                ref={videoRef}
                src={url}
                controls
                className="mx-auto max-h-[60vh] w-full object-contain"
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              />
            ) : (
              <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                Escolha um vídeo para ver a prévia.
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Timeline</span>
              <span className="font-mono">{fmt(duration)}</span>
            </div>
            <div className="relative h-12 rounded-lg bg-background/70">
              {visible.map((c) => {
                const left = duration ? (c.start / duration) * 100 : 0;
                const width = duration ? Math.max(1, (cutDuration(c) / duration) * 100) : 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => preview(c)}
                    title={`${c.title} · ${fmt(c.start)}–${fmt(c.end)}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={`absolute top-1.5 h-9 rounded-md border text-[10px] ${
                      c.id === selected ? "border-primary bg-primary/40" : "border-white/10 bg-primary/15"
                    }`}
                  >
                    {c.score}
                  </button>
                );
              })}
              {!visible.length && (
                <p className="grid h-full place-items-center text-xs text-muted-foreground">
                  Nenhum corte ainda.
                </p>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
            <p className="mb-2 text-sm font-medium">Aplicar template ao corte</p>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              aria-label="Template"
              className="w-full rounded-lg border border-border/60 bg-background px-2 py-2 text-sm"
            >
              {!templates.length && <option value="">Nenhum template criado</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button
              className="mt-2 w-full"
              disabled={!current || !templateId || applying}
              onClick={() => void applyTemplate()}
            >
              {applying ? "Aplicando…" : current ? `Aplicar em “${current.title}”` : "Escolha um corte"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              O template vira um projeto em{" "}
              <Link to="/projetos" className="underline">
                Projetos
              </Link>
              , com o vídeo do corte no lugar do CUT_VIDEO.
            </p>
          </div>

          <div className="space-y-2">
            {visible.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border p-2 ${c.id === selected ? "border-primary" : "border-border/60"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <button type="button" onClick={() => preview(c)} className="text-left text-sm font-medium">
                    {c.title}
                  </button>
                  <span className="mono-label">{c.score}</span>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {fmt(c.start)} – {fmt(c.end)} · {Math.round(cutDuration(c))}s
                </p>
                {!getSourceFile(c.sourceId) && (
                  <p className="text-[11px] text-amber-400">Reabra “{c.sourceName}” para renderizar.</p>
                )}
                <div className="mt-1 flex gap-2 text-xs">
                  <button type="button" className="underline" onClick={() => preview(c)}>
                    Prévia
                  </button>
                  <button
                    type="button"
                    className="text-destructive underline"
                    onClick={() => setCuts(removeCut(c.id))}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <CutLibrary
        refreshKey={libraryKey}
        onPreview={(cut) => {
          const local = cuts.find((c) => c.id === cut.id);
          if (local) preview(local);
          else if (file) registerSourceFile(sourceIdFor(file), file);
        }}
      />
    </div>
  );
}
