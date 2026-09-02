/** Editor profissional de vídeos verticais do VaiViral. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Crop,
  Frame,
  Layers,
  Music4,
  Palette,
  Scissors,
  Shuffle,
  Sliders,
  Sparkles,
  Stamp,
  Type,
  Wand2,
} from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { TranscriptPanel } from "@/components/editor/TranscriptPanel";
import { CaptionStylePanel } from "@/components/editor/CaptionStylePanel";
import { TimelinePro } from "@/components/editor/TimelinePro";
import { BatchApplyModal } from "@/components/editor/BatchApplyModal";
import { TransitionPicker } from "@/components/editor/TransitionPicker";
import { AudioPanel } from "@/components/editor/AudioPanel";
import { CutPanel, FramePanel, GradePanel, LayoutPanel, TitlesPanel } from "@/components/editor/ToolPanels";
import { EditorCanvas } from "@/components/vtemplate/EditorCanvas";
import { AnimationPanel } from "@/components/vtemplate/AnimationPanel";
import { AnimationLibrary } from "@/components/editor/AnimationLibrary";
import { BrandKitPanel } from "@/components/vtemplate/BrandKitPanel";
import { PropertiesPanel } from "@/components/vtemplate/PropertiesPanel";
import { useEditorHistory } from "@/components/editor/useEditorHistory";
import { openProjectForVideo, saveEditorProject } from "@/lib/editor/project.service";
import { previewUrl, type EditorProjectDoc } from "@/lib/editor/project";
import { defaultEditorAudio } from "@/lib/editor/audio";
import { applyBrandKitToDoc } from "@/lib/brand-kit";
import { defaultPreEdit, type PreEdit } from "@/lib/preedit";
import { ensureTranscript, saveTranscript } from "@/lib/editor/transcript.service";
import { emptyTranscript, removedRanges, silenceRanges, type TranscriptDoc } from "@/lib/editor/transcript";
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

type ToolId =
  | "corte"
  | "enquadrar"
  | "transicoes"
  | "layout"
  | "ajustes"
  | "animacao"
  | "legendas"
  | "mixagem"
  | "titulos"
  | "templates"
  | "brand"
  | "camada";

const TOOL_GROUPS: { title: string; tools: { id: ToolId; label: string; icon: typeof Crop }[] }[] = [
  {
    title: "Ferramentas",
    tools: [
      { id: "corte", label: "Corte", icon: Scissors },
      { id: "enquadrar", label: "Enquadrar", icon: Crop },
      { id: "transicoes", label: "Transições", icon: Shuffle },
    ],
  },
  {
    title: "Design",
    tools: [
      { id: "layout", label: "Layout", icon: Frame },
      { id: "ajustes", label: "Ajustes", icon: Sliders },
      { id: "animacao", label: "Animação", icon: Wand2 },
      { id: "templates", label: "Templates", icon: Layers },
      { id: "brand", label: "Brand Kit", icon: Stamp },
    ],
  },
  {
    title: "Áudio & Texto",
    tools: [
      { id: "legendas", label: "Legendas", icon: Palette },
      { id: "mixagem", label: "Mixagem", icon: Music4 },
      { id: "titulos", label: "Títulos", icon: Type },
      { id: "camada", label: "Camada", icon: Sparkles },
    ],
  },
];

function EditorPage() {
  const { projectId, videoId } = Route.useParams();
  const [recordId, setRecordId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptDoc>(emptyTranscript(videoId));
  const [templates, setTemplates] = useState<VideoTemplateRecord[]>([]);
  const [leftTab, setLeftTab] = useState<"texto" | "estilos">("texto");
  const [tool, setTool] = useState<ToolId>("corte");
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
  const silences = useMemo(() => silenceRanges(transcript, 0.6), [transcript]);

  const patchDoc = useCallback(
    (patch: Partial<EditorProjectDoc>, label = "editar") => {
      history.set((d) => (d ? { ...d, ...patch } : d), label);
    },
    [history],
  );

  /** Pré-edição (corte, enquadramento, cor, layout) — mesma estrutura do estúdio. */
  const patchPre = useCallback(
    (patch: Partial<PreEdit>, label = "preedit") => {
      history.set((d) => (d ? { ...d, preedit: { ...(d.preedit ?? defaultPreEdit()), ...patch } } : d), label);
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

  /** adiciona camadas prontas (biblioteca de animações) à composição */
  const addLayers = useCallback(
    (newLayers: TemplateLayer[], label = "adicionar-camadas") => {
      history.set(
        (d) =>
          d
            ? { ...d, composition: { ...d.composition, layers: [...d.composition.layers, ...newLayers] } }
            : d,
        label,
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
      const kit = doc.brandKit;
      patchDoc(
        { composition: kit ? applyBrandKitToDoc(composition, kit) : composition, templateId: template.id },
        "aplicar-template",
      );
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
  const pre = doc.preedit ?? defaultPreEdit();
  const selectedLayer = doc.composition.layers.find((l) => l.id === selectedId) ?? null;
  const scriptText = transcript.words
    .filter((w) => !w.removed)
    .map((w) => w.word)
    .join(" ");

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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[76px_320px_1fr_330px]">
        {/* BARRA DE FERRAMENTAS */}
        <nav aria-label="Ferramentas do editor" className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-r border-border/60 py-3 lg:flex">
          {TOOL_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-1 text-center font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              {group.tools.map((t) => {
                const Icon = t.icon;
                const active = tool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTool(t.id)}
                    aria-pressed={active}
                    className={`mx-auto flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] transition-colors ${
                      active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

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

        {/* PAINEL CONTEXTUAL */}
        <aside className="hidden min-h-0 flex-col border-l border-border/60 p-3 lg:flex">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === tool)?.label}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tool === "corte" && (
              <CutPanel
                preedit={pre}
                onChange={patchPre}
                duration={duration}
                currentTime={currentTime}
                onSeek={seek}
                silenceCount={silences.length}
                onCutSilences={() => {
                  const kept: { start: number; end: number }[] = [];
                  let cursor = 0;
                  for (const s of silences) {
                    if (s.start > cursor) kept.push({ start: cursor, end: s.start });
                    cursor = Math.max(cursor, s.end);
                  }
                  if (cursor < duration) kept.push({ start: cursor, end: duration });
                  patchPre({ segments: kept }, "cortar-pausas");
                }}
              />
            )}
            {tool === "enquadrar" && (
              <FramePanel
                preedit={pre}
                onChange={patchPre}
                srcW={doc.media.width ?? 1920}
                srcH={doc.media.height ?? 1080}
              />
            )}
            {tool === "transicoes" && (
              <div className="space-y-4">
                <TransitionPicker
                  value={pre.transIn}
                  onChange={(t) => patchPre({ transIn: t }, "transicao-entrada")}
                  label="Entrada"
                  onPreview={() => seek(Math.max(0, (pre.segments[0]?.start ?? 0)))}
                />
                <TransitionPicker
                  value={pre.transOut}
                  onChange={(t) => patchPre({ transOut: t }, "transicao-saida")}
                  label="Saída"
                  onPreview={() => seek(Math.max(0, duration - (pre.transOut.dur || 0.5)))}
                />
              </div>
            )}
            {tool === "layout" && <LayoutPanel preedit={pre} onChange={patchPre} />}
            {tool === "ajustes" && <GradePanel preedit={pre} onChange={patchPre} />}
            {tool === "animacao" && (
              <div className="space-y-4">
                {selectedLayer ? (
                  <AnimationPanel
                    layer={selectedLayer}
                    onUpdate={(patch) => updateLayer(selectedLayer.id, patch)}
                    onPreview={() => setPlaying(true)}
                  />
                ) : (
                  <p className="rounded-lg border border-border/60 bg-card/40 p-2 text-xs text-muted-foreground">
                    Selecione uma camada para ajustar duração, início, velocidade e direção — ou escolha uma animação pronta abaixo.
                  </p>
                )}
                <AnimationLibrary
                  layers={doc.composition.layers}
                  onAddLayers={(ls, label) => addLayers(ls, label)}
                />
              </div>
            )}
            {tool === "camada" && (
              <PropertiesPanel
                layer={selectedLayer}
                onUpdate={(patch) => selectedLayer && updateLayer(selectedLayer.id, patch)}
              />
            )}
            {tool === "brand" && (
              <BrandKitPanel
                doc={doc.composition}
                onUpdateLayer={updateLayer}
                value={doc.brandKit}
                onChange={(kit) =>
                  patchDoc(
                    { brandKit: kit, composition: applyBrandKitToDoc(doc.composition, kit) },
                    "brand-kit",
                  )
                }
              />
            )}
            {tool === "legendas" && (
              <CaptionStylePanel
                presetId={doc.captionPresetId}
                style={captionLayer?.style ?? captionPreset.style}
                onApplyPreset={(preset) => {
                  patchDoc({ captionPresetId: preset.id }, "preset-legenda");
                  if (captionLayer)
                    updateLayer(captionLayer.id, { presetId: preset.id, style: preset.style } as Partial<TemplateLayer>);
                }}
                onStyleChange={(patch) => {
                  if (!captionLayer) return;
                  updateLayer(captionLayer.id, { style: { ...captionLayer.style, ...patch } } as Partial<TemplateLayer>);
                }}
              />
            )}
            {tool === "mixagem" && (
              <AudioPanel
                audio={doc.audio ?? defaultEditorAudio()}
                onChange={(next, label) => patchDoc({ audio: next }, label ?? "audio")}
                scriptText={scriptText}
                currentTime={currentTime}
              />
            )}
            {tool === "titulos" && (
              <TitlesPanel
                title={doc.title}
                hook={doc.hook}
                cta={doc.cta}
                onChange={(patch, label) => patchDoc(patch, label ?? "textos")}
              />
            )}
            {tool === "templates" && (
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
          </div>
        </aside>

      </div>

      {/* TRILHA DE ÁUDIO */}
      {!!(doc.audio?.tracks.length) && (
        <div className="shrink-0 border-t border-border/60 px-3 py-2">
          <div className="relative h-7 overflow-hidden rounded-lg bg-card/50">
            {doc.audio.tracks.map((c) => {
              const total = Math.max(1, duration);
              const width = ((c.duration || Math.max(2, total - c.startTime)) / total) * 100;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setTool("mixagem");
                    seek(c.startTime);
                  }}
                  title={`${c.name} · ${c.kind}`}
                  className={`absolute top-1 h-5 truncate rounded px-2 text-[10px] ${
                    c.kind === "voice" ? "bg-cyan-500/30 text-cyan-100" : "bg-primary/30 text-primary-foreground"
                  }`}
                  style={{ left: `${(c.startTime / total) * 100}%`, width: `${Math.min(100, width)}%` }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
