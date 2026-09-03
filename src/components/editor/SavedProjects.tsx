/**
 * PROJETOS SALVOS: cortes completos (timeline, keyframes, legendas e áudio)
 * guardados no banco. Reabre exatamente onde parou no editor profissional.
 * Só apresentação/leitura — nenhuma regra de negócio nova.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadSourceFile, registerSourceFile } from "@/lib/editor/cuts";
import { listEditorProjects, saveEditorProject, type EditorProjectRecord } from "@/lib/editor/project.service";

function seconds(v?: number | null) {
  if (!v || !Number.isFinite(v)) return "—";
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SavedProjects() {
  const [items, setItems] = useState<EditorProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  /** vídeos disponíveis neste navegador (memória ou armazenamento local) */
  const [available, setAvailable] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listEditorProjects());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os projetos salvos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const ids = await Promise.all(
        items.map(async (p) => ((await loadSourceFile(p.doc.videoId)) ? p.doc.videoId : null)),
      );
      if (alive) setAvailable(new Set(ids.filter((id): id is string => Boolean(id))));
    })();
    return () => {
      alive = false;
    };
  }, [items, tick]);

  const filtered = useMemo(
    () => items.filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  );

  /** reconecta os arquivos locais pelo nome salvo na mídia do projeto */
  const attach = (files: FileList | null) => {
    if (!files) return;
    let matched = 0;
    for (const file of Array.from(files)) {
      for (const p of items) {
        if (p.doc.title === file.name || p.name === file.name) {
          registerSourceFile(p.doc.videoId, file);
          matched++;
          break;
        }
      }
    }
    setTick((t) => t + 1);
    toast[matched ? "success" : "info"](
      matched ? `${matched} vídeo(s) reconectado(s).` : "Nenhum projeto salvo usa esses arquivos.",
    );
  };

  return (
    <div className="space-y-4" data-tick={tick}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar projeto salvo"
          className="rounded-lg border border-border/60 bg-transparent px-3 py-1.5 text-xs"
        />
        <label className="cursor-pointer rounded-lg border border-border/60 px-3 py-1.5 text-xs">
          Reconectar vídeos
          <input
            type="file"
            accept="video/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              attach(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <Link to="/editor" className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground">
          Novo projeto
        </Link>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando projetos salvos…</p>}

      {!loading && !filtered.length && (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Nenhum corte salvo ainda. Abra o{" "}
          <Link to="/editor" className="underline">
            editor profissional
          </Link>{" "}
          e o projeto passa a aparecer aqui automaticamente.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const hasFile = available.has(p.doc.videoId);
          const layers = p.doc.composition?.layers?.length ?? 0;
          const keys = p.doc.preedit?.keys?.length ?? 0;
          const cuts = p.doc.removedRanges?.length ?? 0;
          const tracks = p.doc.audio?.tracks ?? [];
          const audioBits = Array.from(new Set(tracks.map((t) => t.kind)));
          return (
            <article key={p.id} className="glass space-y-2 rounded-2xl border border-border/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-sm font-medium">{p.name}</h3>
                <span className="mono-label">{seconds(p.doc.media?.duration)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {layers} camadas · {cuts} corte(s) · {keys} keyframes ·{" "}
                {audioBits.length ? audioBits.join(" + ") : "sem áudio extra"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Atualizado em {new Date(p.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </p>
              {!hasFile && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px]">
                  Vídeo de origem não está neste navegador — reconecte para renderizar.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Link
                  to="/projects/$projectId/editor/$videoId"
                  params={{ projectId: p.id, videoId: p.doc.videoId }}
                  className="rounded-lg bg-primary px-2.5 py-1.5 text-primary-foreground"
                >
                  Reabrir no editor
                </Link>
                <button
                  type="button"
                  className="rounded-lg border border-border/60 px-2.5 py-1.5"
                  onClick={async () => {
                    const name = window.prompt("Nome do projeto", p.name);
                    if (!name) return;
                    await saveEditorProject(p.id, { ...p.doc, title: name });
                    void load();
                  }}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  className="ml-auto text-destructive underline"
                  onClick={async () => {
                    if (!window.confirm(`Excluir “${p.name}”?`)) return;
                    const { error } = await supabase.from("projects").delete().eq("id", p.id);
                    if (error) toast.error("Não foi possível excluir.");
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
