import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AddClipCommand, EditorCommandBus, asProjectTime, createEditorProjectV2, type Clip, type EditorProjectV2 } from "@/lib/editor-v2";
import { BUILT_IN_LIBRARY_ITEMS, LibraryRegistry, type LibraryItem } from "@/lib/editor-v2/library";
import { LibraryPanel } from "./LibraryPanel";

function clipFromLibraryItem(item: LibraryItem, index: number): Clip {
  const isCaption = item.type === "caption";
  const trackId = isCaption ? "track-captions" : "track-overlay";
  return {
    id: `library-${item.sourceId}-${index}`,
    kind: isCaption ? "caption" : item.type === "shape" ? "shape" : "text",
    trackId,
    name: item.name,
    projectStart: asProjectTime(0),
    projectEnd: asProjectTime(Math.min(item.duration ?? 4, 12)),
    sourceIn: 0,
    sourceOut: Math.min(item.duration ?? 4, 12),
    playbackRate: 1,
    enabled: true,
    effects: [],
    animations: [],
    metadata: { libraryItemId: item.id, libraryVersion: item.version, definition: item.definition },
  };
}

export function EditorV2Foundation() {
  const registry = useMemo(() => new LibraryRegistry(BUILT_IN_LIBRARY_ITEMS), []);
  const busRef = useRef(new EditorCommandBus(createEditorProjectV2({ name: "Demo da Library", duration: 12 })));
  const [project, setProject] = useState<EditorProjectV2>(() => busRef.current.getState());
  const [message, setMessage] = useState("Selecione um preset para adicioná-lo de forma reversível.");
  const itemCount = project.tracks.reduce((sum, track) => sum + track.clips.length, 0);

  const add = (item: LibraryItem) => {
    const clip = clipFromLibraryItem(item, project.revisions.document + 1);
    setProject(busRef.current.execute(new AddClipCommand(clip)));
    setMessage(`${item.name} adicionado à trilha ${clip.trackId === "track-captions" ? "Legendas" : "Sobreposições"}.`);
  };
  const undo = () => { setProject(busRef.current.undo()); setMessage("Última inclusão desfeita."); };
  const redo = () => { setProject(busRef.current.redo()); setMessage("Inclusão refeita."); };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_55%_-10%,oklch(0.45_0.18_285/.24),transparent_32%),linear-gradient(180deg,oklch(0.12_0.015_270),oklch(0.09_0.012_270))] p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-4">
        <header className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background/75 px-4 py-3 backdrop-blur-xl">
          <Link to="/editor" className="grid size-8 place-items-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground" aria-label="Voltar ao editor atual"><ArrowLeft className="size-4" /></Link>
          <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold">Editor V2 · Fundação</h1><span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">Feature flag</span></div><p className="text-[11px] text-muted-foreground">Library isolada · documento V2 · comandos reversíveis</p></div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">{itemCount} itens no projeto · rev. {project.revisions.document}</span>
            <button type="button" onClick={undo} disabled={!busRef.current.canUndo} className="grid size-8 place-items-center rounded-lg border border-border/60 disabled:opacity-35" aria-label="Desfazer"><Undo2 className="size-4" /></button>
            <button type="button" onClick={redo} disabled={!busRef.current.canRedo} className="grid size-8 place-items-center rounded-lg border border-border/60 disabled:opacity-35" aria-label="Refazer"><Redo2 className="size-4" /></button>
          </div>
        </header>

        <LibraryPanel registry={registry} onAdd={add} />

        <section
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/30 bg-background/75 px-4 py-3 transition-colors hover:border-primary/60"
          aria-live="polite"
          aria-label="Área de inclusão na futura timeline V2"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData("application/x-vaiviral-library-item");
            const item = registry.get(id);
            if (item) add(item);
          }}
        >
          <div><p className="text-xs font-medium">Timeline V2 ainda não substitui a atual</p><p className="text-[11px] text-muted-foreground">{message} Você também pode soltar um card aqui.</p></div>
          <div className="flex max-w-full gap-1 overflow-x-auto" aria-label="Itens adicionados">
            {project.tracks.flatMap((track) => track.clips).map((clip) => <span key={clip.id} className="whitespace-nowrap rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px]">{clip.name}</span>)}
          </div>
        </section>
      </div>
    </main>
  );
}
