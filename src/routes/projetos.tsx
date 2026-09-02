/** Projetos de template: lista, edição e renderização real em MP4 1080x1920. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/base";
import { deleteInstance, listInstances, updateInstance } from "@/lib/video-template/service";
import { renderTemplateProject, templateRenderSupported } from "@/lib/editor/render-template";
import { getSourceFile, readCutBinding, registerSourceFile } from "@/lib/editor/cuts";
import type { TemplateInstanceRecord } from "@/lib/video-template/types";

export const Route = createFileRoute("/projetos")({
  head: () => ({
    meta: [
      { title: "Projetos de template — VaiViral" },
      {
        name: "description",
        content: "Todos os seus projetos de template em um só lugar: edite, renderize em MP4 1080x1920 e baixe em lote.",
      },
      { property: "og:title", content: "Projetos de template — VaiViral" },
      { property: "og:description", content: "Edite e renderize seus projetos de template em MP4 vertical." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth title="Projetos" description="Entre na sua conta para ver seus projetos de template.">
      <ProjectsPage />
    </RequireAuth>
  ),
});

interface RenderState {
  status: "idle" | "rendering" | "done" | "error";
  progress: number;
  url?: string;
  error?: string;
}

function ProjectsPage() {
  const [items, setItems] = useState<TemplateInstanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [renders, setRenders] = useState<Record<string, RenderState>>({});
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listInstances());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os projetos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const missingSources = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const cut = readCutBinding(it.instance_data.settings);
      if (cut && !getSourceFile(cut.sourceId)) set.add(cut.sourceName || cut.sourceId);
    }
    return [...set];
  }, [items, renders]);

  const attachFiles = (files: FileList | null) => {
    if (!files) return;
    let matched = 0;
    for (const file of Array.from(files)) {
      for (const it of items) {
        const cut = readCutBinding(it.instance_data.settings);
        if (cut && cut.sourceName === file.name) {
          registerSourceFile(cut.sourceId, file);
          matched++;
          break;
        }
      }
    }
    setRenders((r) => ({ ...r }));
    toast[matched ? "success" : "info"](
      matched ? `${matched} vídeo(s) reconectado(s).` : "Nenhum projeto usa esses arquivos.",
    );
  };

  const renderOne = useCallback(async (item: TemplateInstanceRecord, signal?: AbortSignal) => {
    const cut = readCutBinding(item.instance_data.settings);
    const file = cut ? getSourceFile(cut.sourceId) : null;
    if (!cut || !file) {
      setRenders((r) => ({
        ...r,
        [item.id]: { status: "error", progress: 0, error: "Reconecte o vídeo de origem para renderizar." },
      }));
      return null;
    }
    setRenders((r) => ({ ...r, [item.id]: { status: "rendering", progress: 0 } }));
    try {
      const blob = await renderTemplateProject({
        doc: item.instance_data,
        file,
        cut: { start: cut.start, end: cut.end },
        signal,
        onProgress: (p) => setRenders((r) => ({ ...r, [item.id]: { status: "rendering", progress: p } })),
      });
      const url = URL.createObjectURL(blob);
      setRenders((r) => ({ ...r, [item.id]: { status: "done", progress: 1, url } }));
      return { item, blob, url };
    } catch (e) {
      setRenders((r) => ({
        ...r,
        [item.id]: { status: "error", progress: 0, error: e instanceof Error ? e.message : "Falha na renderização." },
      }));
      return null;
    }
  }, []);

  const renderAll = async () => {
    if (!templateRenderSupported()) {
      toast.error("Este navegador não suporta a renderização (WebCodecs).");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let ok = 0;
    try {
      for (const item of items) {
        if (controller.signal.aborted) break;
        const done = await renderOne(item, controller.signal);
        if (done) ok++;
      }
      toast.success(`${ok} de ${items.length} projetos renderizados.`);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const downloadAll = () => {
    let n = 0;
    for (const item of items) {
      const state = renders[item.id];
      if (state?.status === "done" && state.url) {
        const a = document.createElement("a");
        a.href = state.url;
        a.download = `${(item.label ?? "projeto").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-1080x1920.mp4`;
        a.click();
        n++;
      }
    }
    if (!n) toast.info("Nenhum vídeo renderizado ainda.");
  };

  const rename = async (item: TemplateInstanceRecord) => {
    const name = window.prompt("Nome do projeto", item.instance_data.name);
    if (!name) return;
    await updateInstance(item.id, { ...item.instance_data, name });
    void load();
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono-label">Etapa 3 · Projetos</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Projetos de template</h1>
          <p className="text-sm text-muted-foreground">
            Cada projeto é um template já aplicado a um corte real. Renderize em MP4 1080x1920.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void renderAll()} disabled={busy || !items.length}>
            {busy ? "Renderizando…" : `Renderizar todos (${items.length})`}
          </Button>
          <Button variant="outline" onClick={downloadAll}>
            Baixar renderizados
          </Button>
          {busy && (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              Cancelar
            </Button>
          )}
        </div>
      </header>

      {missingSources.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Reconecte os vídeos de origem para renderizar</p>
          <p className="text-xs text-muted-foreground">Arquivos: {missingSources.join(", ")}</p>
          <label className="mt-2 inline-block cursor-pointer rounded-lg border border-border/60 px-3 py-1.5 text-xs">
            Selecionar arquivos
            <input
              type="file"
              accept="video/*"
              multiple
              className="sr-only"
              onChange={(e) => attachFiles(e.target.files)}
            />
          </label>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Carregando projetos…</p>}

      {!loading && !items.length && (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum projeto ainda. Gere um corte em{" "}
            <Link to="/cortes" className="underline">
              Cortes
            </Link>{" "}
            e aplique um template.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const cut = readCutBinding(item.instance_data.settings);
          const state = renders[item.id];
          return (
            <article key={item.id} className="space-y-2 rounded-2xl border border-border/60 bg-card/50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="truncate text-sm font-medium">{item.label ?? item.instance_data.name}</h2>
                <span className="mono-label">{item.instance_data.aspectRatio}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.instance_data.layers.length} camadas ·{" "}
                {cut ? `${Math.round(cut.end - cut.start)}s do corte` : "sem corte vinculado"}
              </p>
              {state?.status === "rendering" && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
                  <div className="h-full bg-primary" style={{ width: `${Math.round(state.progress * 100)}%` }} />
                </div>
              )}
              {state?.status === "error" && <p className="text-xs text-destructive">{state.error}</p>}
              {state?.status === "done" && state.url && (
                <video src={state.url} controls className="max-h-56 w-full rounded-lg bg-black object-contain" />
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                {item.video_id && item.project_id !== null ? null : null}
                <Link
                  to="/projects/$projectId/editor/$videoId"
                  params={{ projectId: item.project_id ?? "novo", videoId: item.video_id ?? item.id }}
                  className="rounded-lg border border-border/60 px-2.5 py-1.5"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  className="rounded-lg bg-primary px-2.5 py-1.5 text-primary-foreground disabled:opacity-50"
                  disabled={state?.status === "rendering" || busy}
                  onClick={() => void renderOne(item)}
                >
                  Renderizar
                </button>
                {state?.status === "done" && state.url && (
                  <a
                    href={state.url}
                    download={`${(item.label ?? "projeto").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-1080x1920.mp4`}
                    className="rounded-lg border border-border/60 px-2.5 py-1.5"
                  >
                    Baixar
                  </a>
                )}
                <button type="button" className="rounded-lg border border-border/60 px-2.5 py-1.5" onClick={() => void rename(item)}>
                  Renomear
                </button>
                <button
                  type="button"
                  className="ml-auto text-destructive underline"
                  onClick={async () => {
                    await deleteInstance(item.id);
                    void load();
                  }}
                >
                  Excluir
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
