/** Editor profissional de vídeos verticais do VaiViral. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { TranscriptPanel } from "@/components/editor/TranscriptPanel";
import { CaptionStylePanel } from "@/components/editor/CaptionStylePanel";
import { TimelinePro } from "@/components/editor/TimelinePro";
import { BatchApplyModal } from "@/components/editor/BatchApplyModal";
import { EditorCanvas } from "@/components/vtemplate/EditorCanvas";
import { useEditorHistory } from "@/components/editor/useEditorHistory";
import { openProjectForVideo, saveEditorProject } from "@/lib/editor/project.service";
import { previewUrl, type EditorProjectDoc } from "@/lib/editor/project";
import { ensureTranscript, saveTranscript } from "@/lib/editor/transcript.service";
import { emptyTranscript, removedRanges, type TranscriptDoc } from "@/lib/editor/transcript";
import { findCaptionPreset } from "@/lib/editor/caption-styles";
import { listMyTemplates } from "@/lib/video-template/service";
import { applyTemplateToVideo } from "@/lib/video-template/bindings";
import type { CaptionLayer, TemplateLayer, VideoTemplateRecord } from "@/lib/video-template/types";

export const Route = createFileRoute("/projects/$projectId/editor/$videoId")({
  head: () => ({
    meta: [
      { title: "Editor de vídeo vertical — VaiViral" },
      {
        name: "description",
        content:
          "Edite cortes verticais pela transcrição, aplique templates, legendas e branding e envie tudo para render em lote.",
      },
      { property: "og:title", content: "Editor de vídeo vertical — VaiViral" },
      {
        property: "og:description",
        content: "Transcrição, legendas, templates e render em lote no mesmo editor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth
      title="Editor de vídeo"
      description="Entre na sua conta para editar cortes, legendas e templates."
    >
      <EditorPage />
    </RequireAuth>
  ),
});

type RightTab = "templates" | "texto" | "formas" | "ia" | "filtros";

function EditorPage() {
  const { projectId, videoId } = Route.useParams();
  const [recordId, setRecordId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptDoc>(emptyTranscript(videoId));
  const [templates, setTemplates] = useState<VideoTemplateRecord[]>([]);
  const [leftTab, setLeftTab] = useState<"texto" | "estilos">("texto");
  const [rightTab, setRightTab] = useState<RightTab>("templates");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cutOnRemove, setCutOnRemove] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [batchOpen, setBatchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const history = useEditorHistory<EditorProjectDoc | null>(null);
  const doc = history.state;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const record = await openProjectForVideo(projectId, videoId);
        const tr = await ensureTranscript(videoId);
        if (!alive) return;
        setRecordId(record.id);
        history.reset(record.doc, "load");
        setTranscript(tr);
        void listMyTemplates()
          .then((items) => {
            if (alive) setTemplates(items);
          })
          .catch(() => {
            if (alive) setTemplates([]);
          });
      } catch (error) {
        if (alive) {
          setLoadError(error instanceof Error ? error.message : "Não foi possível abrir este projeto.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, videoId, loadAttempt]);

  /** Autosave com debounce — nunca escreve a cada frame de arraste. */
  useEffect(() => {
    if (!doc || !recordId) return;
    setSaveState("dirty");
    const t = setTimeout(() => {
      setSaveState("saving");
      void saveEditorProject(recordId, doc)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 1000);
    return () => clearTimeout(t);
  }, [doc, recordId]);

  useEffect(() => {
    if (!transcript.words.length) return;
    const t = setTimeout(() => void saveTranscript(transcript, recordId).catch(() => undefined), 1200);
    return () => clearTimeout(t);
  }, [transcript, recordId]);

  const cuts = useMemo(() => (cutOnRemove ? removedRanges(transcript) : []), [transcript, cutOnRemove]);

  const patchDoc = useCallback(
    (patch: Partial<EditorProjectDoc>, label = "editar") => {
      history.set((d) => (d ? { ...d, ...patch } : d), label);
    },
    [history],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<TemplateLayer>) => {
      history.set(
        (d) =>
          d
            ? {
                ...d,
                composition: {
                  ...d.composition,
                  layers: d.composition.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as TemplateLayer) : l)),
                },
              }
            : d,
        `layer:${id}`,
      );
    },
    [history],
  );

  const applyTemplate = useCallback(
    (template: VideoTemplateRecord) => {
      if (!doc) return;
      const composition = applyTemplateToVideo(template.template_data, {
        id: doc.cutId ?? doc.videoId,
        title: doc.title,
        videoUrl: doc.media.originalUrl,
        coverUrl: doc.media.posterUrl,
        duration: doc.media.duration,
      });
      patchDoc({ composition, templateId: template.id }, "aplicar-template");
    },
    [doc, patchDoc],
  );

  const seek = useCallback((time: number) => {
    setCurrentTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
  }, []);

  // Atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (recordId && doc) void saveEditorProject(recordId, doc).then(() => setSaveState("saved"));
      } else if (e.key === "Delete" && selectedId) {
        history.set(
          (d) =>
            d ? { ...d, composition: { ...d.composition, layers: d.composition.layers.filter((l) => l.id !== selectedId) } } : d,
          "excluir",
        );
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, recordId, doc, selectedId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [playing]);

  if (loading) {
    return <div className="grid h-dvh place-items-center text-sm text-muted-foreground">Carregando editor…</div>;
  }

  if (loadError || !doc) {
    return (
      <div className="grid h-dvh place-items-center bg-background px-6 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Não foi possível abrir o editor</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError ?? "O projeto não retornou dados válidos."}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Tentar novamente
            </button>
            <Link to="/" className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
              Voltar ao painel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const captionLayer = doc.composition.layers.find((l): l is CaptionLayer => l.type === "caption") ?? null;
  const captionPreset = findCaptionPreset(doc.captionPresetId);
  const src = previewUrl(doc);
  const duration = doc.media.duration || transcript.duration;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* HEADER */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <Link to="/" className="font-semibold tracking-tight">
          VaiViral
        </Link>
        <button type="button" onClick={() => history.undo()} className="rounded-md border border-border/60 px-2 py-1 text-xs">
          Desfazer
        </button>
        <button type="button" onClick={() => history.redo()} className="rounded-md border border-border/60 px-2 py-1 text-xs">
          Refazer
        </button>
        <input
          value={doc.title}
          onChange={(e) => patchDoc({ title: e.target.value }, "titulo")}
          aria-label="Nome do projeto"
          className="min-w-40 rounded-md border border-border/60 bg-card/60 px-2 py-1 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {saveState === "saving" ? "Salvando..." : saveState === "dirty" ? "Alterações pendentes" : "Salvo"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={doc.composition.aspectRatio}
            onChange={(e) =>
              patchDoc(
                { composition: { ...doc.composition, aspectRatio: e.target.value as typeof doc.composition.aspectRatio } },
                "formato",
              )
            }
            className="rounded-md border border-border/60 bg-card/60 px-2 py-1 text-xs"
            aria-label="Proporção"
          >
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
          </select>
          <button
            type="button"
            onClick={() => setBatchOpen(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Aplicar em lote
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_1fr_300px]">
        {/* PAINEL ESQUERDO */}
        <aside className="hidden min-h-0 flex-col border-r border-border/60 p-3 lg:flex">
          <div className="mb-3 flex rounded-lg border border-border/60 p-0.5 text-sm">
            {(["texto", "estilos"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLeftTab(t)}
                className={`flex-1 rounded-md px-2 py-1 capitalize ${leftTab === t ? "bg-primary/20" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {leftTab === "texto" ? (
              <TranscriptPanel
                doc={transcript}
                onChange={(next) => setTranscript(next)}
                currentTime={currentTime}
                onSeek={seek}
                cutOnRemove={cutOnRemove}
                onCutOnRemoveChange={setCutOnRemove}
              />
            ) : (
              <CaptionStylePanel
                presetId={doc.captionPresetId}
                style={captionLayer?.style ?? captionPreset.style}
                onApplyPreset={(preset) => {
                  patchDoc({ captionPresetId: preset.id }, "preset-legenda");
                  if (captionLayer) updateLayer(captionLayer.id, { presetId: preset.id, style: preset.style } as Partial<TemplateLayer>);
                }}
                onStyleChange={(patch) => {
                  if (!captionLayer) return;
                  updateLayer(captionLayer.id, {
                    style: { ...captionLayer.style, ...patch },
                  } as Partial<TemplateLayer>);
                }}
              />
            )}
          </div>
        </aside>

        {/* CANVAS */}
        <main className="flex min-h-0 flex-col items-center justify-center gap-3 overflow-hidden bg-black/30 p-4">
          <div className="relative max-h-full">
            <EditorCanvas
              doc={{ ...doc.composition, sampleVideoUrl: src }}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={updateLayer}
              zoom={0.42}
              showSafeArea
            />
            {src && (
              <video
                ref={videoRef}
                src={src}
                className="sr-only"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  if (!doc.media.duration) {
                    patchDoc({ media: { ...doc.media, duration: e.currentTarget.duration } }, "duracao");
                  }
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="rounded-lg border border-border/60 px-3 py-1.5"
            >
              {playing ? "Pausar" : "Reproduzir"}
            </button>
            <span className="text-xs text-muted-foreground">Espaço = play/pause · Delete = excluir camada</span>
          </div>
        </main>

        {/* PAINEL DIREITO */}
        <aside className="hidden min-h-0 flex-col border-l border-border/60 p-3 lg:flex">
          <div className="mb-2 flex flex-wrap gap-1 text-xs">
            {(["templates", "texto", "formas", "ia", "filtros"] as RightTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setRightTab(t)}
                className={`rounded-full border px-2.5 py-1 capitalize ${
                  rightTab === t ? "border-primary bg-primary/20" : "border-border/60"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightTab === "templates" && (
              <div className="space-y-2">
                {!templates.length && (
                  <p className="text-xs text-muted-foreground">
                    Você ainda não criou templates.{" "}
                    <Link to="/templates" className="underline">
                      Criar agora
                    </Link>
                  </p>
                )}
                {templates.map((t) => (
                  <div key={t.id} className="rounded-xl border border-border/60 p-2">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.aspect_ratio} · {t.template_data.layers.length} camadas
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => applyTemplate(t)}
                        className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                      >
                        Aplicar
                      </button>
                      <Link
                        to="/templates/$id/edit"
                        params={{ id: t.id }}
                        className="rounded-md border border-border/60 px-2 py-1 text-xs"
                      >
                        Editar template
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {rightTab !== "templates" && (
              <p className="text-xs text-muted-foreground">
                Painel “{rightTab}” chega nas próximas fases do editor. As camadas já criadas continuam editáveis pelo
                canvas e pela timeline.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* TIMELINE */}
      <div className="h-56 shrink-0">
        <TimelinePro
          duration={duration}
          currentTime={currentTime}
          zoom={doc.timelineZoom}
          layers={doc.composition.layers}
          selectedId={selectedId}
          removed={cuts}
          onSeek={seek}
          onSelect={setSelectedId}
          onZoom={(z) => patchDoc({ timelineZoom: z }, "zoom")}
          onTrim={(id, startTime, endTime) => updateLayer(id, { startTime, endTime })}
          onToggleVisible={(id) => {
            const layer = doc.composition.layers.find((l) => l.id === id);
            if (layer) updateLayer(id, { visible: !layer.visible });
          }}
          onToggleLock={(id) => {
            const layer = doc.composition.layers.find((l) => l.id === id);
            if (layer) updateLayer(id, { locked: !layer.locked });
          }}
          onSplit={() => {
            if (!selectedId) return;
            const layer = doc.composition.layers.find((l) => l.id === selectedId);
            if (!layer) return;
            const end = layer.endTime ?? duration;
            if (currentTime <= layer.startTime || currentTime >= end) return;
            const copy: TemplateLayer = {
              ...layer,
              id: `${layer.id}-b${Math.round(currentTime * 100)}`,
              startTime: currentTime,
              endTime: end,
            };
            history.set(
              (d) =>
                d
                  ? {
                      ...d,
                      composition: {
                        ...d.composition,
                        layers: d.composition.layers
                          .map((l) => (l.id === selectedId ? { ...l, endTime: currentTime } : l))
                          .concat(copy),
                      },
                    }
                  : d,
              "dividir",
            );
          }}
        />
      </div>

      <BatchApplyModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        templates={templates}
        initialTemplateId={doc.templateId}
        targets={[{ videoId: doc.videoId, cutId: doc.cutId, title: doc.title, videoUrl: doc.media.originalUrl }]}
      />
    </div>
  );
}
