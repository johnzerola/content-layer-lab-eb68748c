/**
 * Biblioteca real de cortes: miniatura, legenda e botão de renderizar,
 * para reutilizar o mesmo corte em vários templates.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw, Send, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/base";
import {
  cutAsSource,
  cutDuration,
  getSourceFile,
  loadSourceFile,
  registerSourceFile,
  type CutRecord,
} from "@/lib/editor/cuts";
import {
  deleteLibraryCut,
  listLibraryCuts,
  updateLibraryCut,
  type LibraryCut,
} from "@/lib/editor/cuts.service";
import { applyTemplateToVideo } from "@/lib/video-template/bindings";
import { applyBrandKitToDoc, loadBrandKit } from "@/lib/brand-kit";
import { listMyTemplates } from "@/lib/video-template/service";
import { renderTemplateProject, templateRenderSupported } from "@/lib/editor/render-template";
import type { VideoTemplateRecord } from "@/lib/video-template/types";
import { BulkScheduleModal, type BulkScheduleItem } from "@/components/BulkScheduleModal";
import { listAccounts, type SocialAccount } from "@/lib/social";

interface RenderState {
  status: "idle" | "rendering" | "done" | "error";
  progress: number;
  url?: string;
  file?: File;
  error?: string;
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CutLibrary({
  refreshKey = 0,
  onPreview,
}: {
  refreshKey?: number;
  onPreview?: (cut: CutRecord) => void;
}) {
  const [cuts, setCuts] = useState<LibraryCut[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<VideoTemplateRecord[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [renders, setRenders] = useState<Record<string, RenderState>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sourcesTick, setSourcesTick] = useState(0);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [publishItem, setPublishItem] = useState<BulkScheduleItem | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCuts(await listLibraryCuts());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar a biblioteca de cortes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    void listAccounts().then(setAccounts).catch(() => undefined);
  }, []);

  useEffect(() => {
    void listMyTemplates()
      .then((list) => {
        setTemplates(list);
        setTemplateId((prev) => prev || (list[0]?.id ?? ""));
      })
      .catch(() => undefined);
  }, []);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const attachFiles = (files: FileList | null) => {
    if (!files?.length) return;
    let matched = 0;
    for (const file of Array.from(files)) {
      for (const cut of cuts) {
        if (cut.sourceName === file.name) {
          registerSourceFile(cut.sourceId, file);
          matched++;
          break;
        }
      }
    }
    setSourcesTick((n) => n + 1);
    toast[matched ? "success" : "info"](
      matched ? "Vídeo de origem reconectado." : "Nenhum corte usa esse arquivo.",
    );
  };

  const renderCut = async (cut: LibraryCut) => {
    if (!template) {
      toast.error("Crie ou escolha um template para renderizar.");
      return;
    }
    if (!templateRenderSupported()) {
      toast.error("Este navegador não suporta a renderização (WebCodecs).");
      return;
    }
    const file = await loadSourceFile(cut.sourceId);
    if (!file) {
      toast.error(`Reconecte o vídeo “${cut.sourceName}” para renderizar.`);
      fileRef.current?.click();
      return;
    }
    setRenders((r) => ({ ...r, [cut.rowId]: { status: "rendering", progress: 0 } }));
    try {
      const doc = applyBrandKitToDoc(
        applyTemplateToVideo(template.template_data, cutAsSource(cut, `cut://${cut.id}`)),
        loadBrandKit(),
      );
      const blob = await renderTemplateProject({
        doc,
        file,
        cut: { start: cut.start, end: cut.end },
        onProgress: (p) =>
          setRenders((r) => ({ ...r, [cut.rowId]: { status: "rendering", progress: p } })),
      });
      const url = URL.createObjectURL(blob);
      const out = new File([blob], `${cut.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "corte"}.mp4`, {
        type: "video/mp4",
      });
      setRenders((r) => ({ ...r, [cut.rowId]: { status: "done", progress: 1, url, file: out } }));
      toast.success(`“${cut.title}” renderizado.`);
    } catch (e) {
      setRenders((r) => ({
        ...r,
        [cut.rowId]: {
          status: "error",
          progress: 0,
          error: e instanceof Error ? e.message : "Falha na renderização.",
        },
      }));
      toast.error("Não foi possível renderizar este corte.");
    }
  };

  const saveCaption = async (cut: LibraryCut) => {
    const caption = draft.trim();
    setEditing(null);
    try {
      await updateLibraryCut(cut.rowId, { caption: caption || null });
      setCuts((list) =>
        list.map((c) => (c.rowId === cut.rowId ? { ...c, caption: caption || null, text: caption || undefined } : c)),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a legenda.");
    }
  };

  const remove = async (cut: LibraryCut) => {
    try {
      await deleteLibraryCut(cut.rowId);
      setCuts((list) => list.filter((c) => c.rowId !== cut.rowId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o corte.");
    }
  };

  return (
    <section className="space-y-4" aria-label="Biblioteca de cortes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mono-label">Biblioteca</p>
          <h2 className="text-lg font-semibold tracking-tight">Cortes salvos</h2>
          <p className="text-sm text-muted-foreground">
            Reutilize qualquer corte: escolha um template e renderize em 1080x1920.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            aria-label="Template para renderizar"
            className="min-h-11 rounded-lg border border-border/60 bg-background px-2 text-sm"
          >
            {!templates.length && <option value="">Nenhum template criado</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Atualizar
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Reconectar vídeo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              attachFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {loading && !cuts.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-56 rounded-2xl" />
          ))}
        </div>
      ) : !cuts.length ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Nenhum corte publicado ainda. Gere cortes de um vídeo e eles aparecem aqui.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cuts.map((cut) => {
            const state = renders[cut.rowId];
            const hasSource = Boolean(getSourceFile(cut.sourceId)) || sourcesTick < 0;
            return (
              <li
                key={cut.rowId}
                className="interactive flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/50"
              >
                <button
                  type="button"
                  onClick={() => onPreview?.(cut)}
                  className="relative aspect-[9/16] max-h-56 w-full overflow-hidden bg-black"
                  aria-label={`Prévia de ${cut.title}`}
                >
                  {cut.thumbnail ? (
                    <img
                      src={cut.thumbnail}
                      alt={`Miniatura do corte ${cut.title}`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-xs text-muted-foreground">
                      Sem miniatura
                    </span>
                  )}
                  <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px]">
                    {fmt(cut.start)}–{fmt(cut.end)} · {Math.round(cutDuration(cut))}s
                  </span>
                </button>

                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{cut.title}</p>
                    <span className="mono-label">{cut.score}</span>
                  </div>

                  {editing === cut.rowId ? (
                    <textarea
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => void saveCaption(cut)}
                      rows={3}
                      aria-label="Legenda do corte"
                      className="w-full rounded-lg border border-border/60 bg-background p-2 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(cut.rowId);
                        setDraft(cut.caption ?? "");
                      }}
                      className="min-h-11 rounded-lg border border-transparent p-1 text-left text-xs text-muted-foreground hover:border-border/60"
                    >
                      {cut.caption || "Adicionar legenda…"}
                    </button>
                  )}

                  {!hasSource && (
                    <p className="text-[11px] text-amber-400">
                      Reconecte “{cut.sourceName}” para renderizar.
                    </p>
                  )}

                  {state?.status === "rendering" && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-background">
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${Math.round(state.progress * 100)}%` }}
                      />
                    </div>
                  )}
                  {state?.status === "error" && (
                    <p className="text-[11px] text-destructive">{state.error}</p>
                  )}

                  <div className="mt-auto flex items-center gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => void renderCut(cut)}
                      disabled={state?.status === "rendering" || !templates.length}
                    >
                      {state?.status === "rendering" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          {Math.round(state.progress * 100)}%
                        </>
                      ) : (
                        <>
                          <Wand2 className="size-4" aria-hidden />
                          Renderizar
                        </>
                      )}
                    </Button>
                    {state?.status === "done" && state.file && (
                      <button
                        type="button"
                        onClick={() =>
                          setPublishItem({
                            file: state.file as File,
                            ...(cut.caption ? { caption: cut.caption } : {}),
                          })
                        }
                        className="grid size-11 place-items-center rounded-lg border border-primary/50 text-primary"
                        aria-label={`Publicar ${cut.title}`}
                        title="Publicar no Instagram, Facebook, YouTube ou TikTok"
                      >
                        <Send className="size-4" aria-hidden />
                      </button>
                    )}
                    {state?.status === "done" && state.url && (
                      <a
                        href={state.url}
                        download={`${cut.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp4`}
                        className="grid size-11 place-items-center rounded-lg border border-border/60"
                        aria-label={`Baixar ${cut.title}`}
                      >
                        <Download className="size-4" aria-hidden />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(cut)}
                      className="grid size-11 place-items-center rounded-lg border border-border/60 text-destructive"
                      aria-label={`Excluir ${cut.title}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BulkScheduleModal
        open={!!publishItem}
        onClose={() => setPublishItem(null)}
        accounts={accounts}
        items={publishItem ? [publishItem] : []}
        hideFilePicker
        subtitle="Publique este corte renderizado na conta conectada."
        onDone={() => setPublishItem(null)}
      />
    </section>
  );
}
