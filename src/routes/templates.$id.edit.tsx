import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Layers, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { Button, Input } from "@/components/ui/base";
import { EditorCanvas } from "@/components/vtemplate/EditorCanvas";
import { EditorToolbar } from "@/components/vtemplate/EditorToolbar";
import { LayerPanel } from "@/components/vtemplate/LayerPanel";
import { PropertiesPanel } from "@/components/vtemplate/PropertiesPanel";
import { getTemplate, updateTemplate } from "@/lib/video-template/service";
import { useTemplateAutosave, useTemplateEditor } from "@/lib/video-template/store";
import type { TemplateDoc, VideoTemplateRecord } from "@/lib/video-template/types";

export const Route = createFileRoute("/templates/$id/edit")({
  head: () => ({
    meta: [
      { title: "Editor de template — VaiViral" },
      { name: "description", content: "Edite camadas, legendas, filtros e animações do seu template de vídeo." },
      { property: "og:title", content: "Editor de template — VaiViral" },
      { property: "og:description", content: "Edite camadas, legendas, filtros e animações do seu template." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditTemplatePage,
});

function EditTemplatePage() {
  const { id } = useParams({ from: "/templates/$id/edit" });
  const [record, setRecord] = useState<VideoTemplateRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getTemplate(id)
      .then((r) => {
        if (!alive) return;
        if (!r) setError("Template não encontrado.");
        else setRecord(r);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <RequireAuth title="Editor de template" description="Entre na sua conta para editar templates.">
        <div className="flex min-h-screen flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button asChild variant="outline">
            <Link to="/templates">Voltar aos templates</Link>
          </Button>
        </div>
      </RequireAuth>
    );
  }

  if (!record) {
    return (
      <RequireAuth title="Editor de template" description="Entre na sua conta para editar templates.">
        <div className="flex min-h-screen items-center justify-center">
          <div className="skeleton h-96 w-64 rounded-2xl" />
        </div>
      </RequireAuth>
    );
  }

  return <Editor key={record.id} record={record} />;
}

function Editor({ record }: { record: VideoTemplateRecord }) {
  const ed = useTemplateEditor(record.template_data);
  const [zoom, setZoom] = useState(0.85);
  const [showGrid, setShowGrid] = useState(false);
  const [tab, setTab] = useState<"layers" | "props">("props");

  const save = useCallback(
    async (doc: TemplateDoc) => {
      await updateTemplate(record.id, { doc, name: doc.name });
    },
    [record.id],
  );
  const { status, saveNow } = useTemplateAutosave(ed.doc, save);

  // ⌘Z / ⌘⇧Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ed, saveNow]);

  return (
    <RequireAuth title="Editor de template" description="Entre na sua conta para editar templates.">
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <header className="flex items-center gap-3 border-b border-border/70 px-3 py-2">
          <Button size="icon" variant="ghost" asChild aria-label="Voltar" className="size-8">
            <Link to="/templates">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <Input
            value={ed.doc.name}
            onChange={(e) => ed.patchDoc({ name: e.target.value }, "nome")}
            aria-label="Nome do template"
            className="h-8 max-w-72 text-sm"
          />
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{ed.doc.aspectRatio}</span>
          <div className="ml-auto flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await updateTemplate(record.id, {
                    doc: ed.doc,
                    status: "published",
                    visibility: "public",
                    bumpVersion: true,
                  });
                  toast.success("Template publicado na comunidade.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Falha ao publicar.");
                }
              }}
            >
              Publicar
            </Button>
          </div>
        </header>

        <EditorToolbar
          layers={ed.doc.layers}
          onAdd={ed.addLayers}
          onUndo={ed.undo}
          onRedo={ed.redo}
          canUndo={ed.canUndo}
          canRedo={ed.canRedo}
          zoom={zoom}
          setZoom={setZoom}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          status={status}
          onSave={() => void saveNow()}
        />

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border/70 lg:block">
            <LayerPanel
              layers={ed.layers}
              selectedId={ed.selectedId}
              onSelect={ed.select}
              onUpdate={ed.updateLayer}
              onDuplicate={ed.duplicateLayer}
              onDelete={ed.removeLayer}
              onReorder={ed.reorder}
            />
          </aside>

          <main className="min-w-0 flex-1 overflow-hidden bg-muted/10">
            <EditorCanvas
              doc={ed.doc}
              selectedId={ed.selectedId}
              onSelect={ed.select}
              onChange={ed.updateLayer}
              zoom={zoom}
              showGrid={showGrid}
              showSafeArea
            />
          </main>

          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border/70">
            <div className="flex gap-1 border-b border-border/70 p-2 lg:hidden">
              <Button size="sm" variant={tab === "layers" ? "default" : "ghost"} onClick={() => setTab("layers")}>
                <Layers className="mr-1 size-3.5" /> Camadas
              </Button>
              <Button size="sm" variant={tab === "props" ? "default" : "ghost"} onClick={() => setTab("props")}>
                <SlidersHorizontal className="mr-1 size-3.5" /> Propriedades
              </Button>
            </div>
            <div className="lg:hidden">
              {tab === "layers" ? (
                <LayerPanel
                  layers={ed.layers}
                  selectedId={ed.selectedId}
                  onSelect={ed.select}
                  onUpdate={ed.updateLayer}
                  onDuplicate={ed.duplicateLayer}
                  onDelete={ed.removeLayer}
                  onReorder={ed.reorder}
                />
              ) : (
                <PropertiesPanel layer={ed.selected} onUpdate={(p) => ed.selected && ed.updateLayer(ed.selected.id, p)} />
              )}
            </div>
            <div className="hidden lg:block">
              <PropertiesPanel layer={ed.selected} onUpdate={(p) => ed.selected && ed.updateLayer(ed.selected.id, p)} />
            </div>
          </aside>
        </div>
      </div>
    </RequireAuth>
  );
}
