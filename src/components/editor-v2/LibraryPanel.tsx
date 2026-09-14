import { useMemo, useState } from "react";
import { Captions, Check, Heart, LoaderCircle, Plus, Search, SlidersHorizontal } from "lucide-react";
import { LibraryRegistry, loadLibraryUserState, markRecent, saveLibraryUserState, toggleFavorite, type LibraryItem, type LibraryItemType } from "@/lib/editor-v2/library";
import { LibraryPreview } from "./LibraryPreview";

const sections: { label: string; types: LibraryItemType[] }[] = [
  { label: "Modelos", types: ["template"] },
  { label: "Texto", types: ["text", "animation"] },
  { label: "Legendas", types: ["caption"] },
  { label: "Elementos", types: ["sticker", "overlay", "shape", "background"] },
  { label: "Transições", types: ["transition"] },
  { label: "Efeitos", types: ["video-effect", "filter", "lut"] },
  { label: "Áudio", types: ["music", "sound-effect"] },
];

type Scope = "built-in" | "mine" | "favorites" | "recent";

interface LibraryPanelProps {
  registry: LibraryRegistry;
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
  onAdd: (item: LibraryItem) => void;
  onGenerateCaptions: () => void;
  generatingCaptions: boolean;
  captionProgress: number;
  revision?: number;
}

export function LibraryPanel({ registry, selectedId, onSelect, onAdd, onGenerateCaptions, generatingCaptions, captionProgress, revision = 0 }: LibraryPanelProps) {
  const [section, setSection] = useState("Modelos");
  const [scope, setScope] = useState<Scope>("built-in");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [userState, setUserState] = useState(loadLibraryUserState);
  const result = useMemo(() => {
    void revision;
    return registry.search({ text: query, types: sections.find((item) => item.label === section)?.types ?? [], pageSize: 100 });
  }, [registry, revision, query, section]);
  const items = result.items.filter((item) => scope === "favorites" ? userState.favorites.includes(item.id) : scope === "recent" ? userState.recent.includes(item.id) : scope === "mine" ? item.source === "user" : item.source === "built-in");
  const selectedCaptionStyle = selectedId ? registry.get(selectedId) : null;

  const select = (item: LibraryItem) => {
    const next = markRecent(userState, item.id);
    setUserState(next);
    saveLibraryUserState(next);
    onSelect(item);
  };
  const add = (item: LibraryItem) => {
    const next = markRecent(userState, item.id);
    setUserState(next);
    saveLibraryUserState(next);
    onAdd(item);
  };

  return (
    <section className="editor-v2-panel editor-v2-library flex h-full min-h-0 flex-col" aria-label="Biblioteca do Editor V2">
      <div className="editor-v2-panel-header px-3 pb-3 pt-3">
        <h2 className="text-sm font-semibold">Biblioteca</h2>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar recursos" aria-label="Buscar recursos" className="h-9 w-full rounded-lg border border-white/10 bg-black/20 pl-8 pr-3 text-xs outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/8 px-2 py-2 vaiviral-scrollbar" role="tablist" aria-label="Categorias da biblioteca">
        {sections.map((item) => <button key={item.label} type="button" role="tab" aria-selected={section === item.label} onClick={() => setSection(item.label)} className={`editor-v2-tab shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${section === item.label ? "is-active text-white" : "text-muted-foreground hover:text-white"}`}>{item.label}</button>)}
      </div>

      <div className="flex items-center gap-1 px-3 py-2" role="group" aria-label="Filtro da biblioteca">
        {(["built-in", "mine", "favorites", "recent"] as Scope[]).map((value) => <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} className={`rounded-md px-2 py-1 text-[10px] ${scope === value ? "bg-primary/18 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{value === "built-in" ? "Incluídos" : value === "mine" ? "Meus" : value === "favorites" ? "Favoritos" : "Recentes"}</button>)}
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{items.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 vaiviral-scrollbar">
        {section === "Modelos" && <div className="mb-3 rounded-xl border border-violet-300/15 bg-[linear-gradient(135deg,rgba(124,92,255,.12),rgba(38,211,169,.05))] p-3">
          <p className="text-[11px] font-semibold text-foreground">Layouts prontos para o vídeo atual</p>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Use um modelo na posição da agulha. Os modelos que você criou no editor anterior aparecem em <strong className="font-semibold text-foreground">Meus</strong>.</p>
        </div>}
        {section === "Legendas" && <div className="mb-3 rounded-xl border border-primary/25 bg-[linear-gradient(135deg,hsl(var(--primary)/.14),hsl(var(--accent)/.06))] p-3 shadow-[0_0_26px_hsl(var(--primary)/.08)]">
          <div className="flex items-start gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/18 text-primary"><Captions className="size-4" /></span><div><p className="text-[11px] font-semibold text-foreground">Legendas automáticas</p><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Transcreve as falas, sincroniza cada palavra e usa o estilo escolhido abaixo.</p></div></div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/8 bg-black/15 px-2.5 py-2 text-[9px]"><span className="text-muted-foreground">Estilo</span><span className="max-w-36 truncate font-semibold text-foreground">{selectedCaptionStyle?.type === "caption" ? selectedCaptionStyle.name : "Verde Impacto"}</span></div>
          <button type="button" disabled={generatingCaptions} onClick={onGenerateCaptions} className="editor-primary-button mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-65">{generatingCaptions ? <LoaderCircle className="size-3.5 animate-spin" /> : <Captions className="size-3.5" />}{generatingCaptions ? `Gerando… ${captionProgress}%` : "Gerar legendas automáticas"}</button>
          <p className="mt-2 text-center text-[8px] leading-relaxed text-muted-foreground">Selecione um vídeo ou deixe o editor usar o primeiro vídeo disponível.</p>
        </div>}
        {items.length ? <div className="grid grid-cols-2 gap-2">{items.map((item) => {
          const selected = selectedId === item.id;
          const favorite = userState.favorites.includes(item.id);
          return <article key={item.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-vaiviral-library-item", item.id); }} onMouseEnter={() => setHoveredId(item.id)} onMouseLeave={() => setHoveredId(null)} className={`editor-library-card group overflow-hidden rounded-xl focus-within:ring-2 focus-within:ring-primary ${selected ? "is-selected" : ""}`}>
            <button type="button" className="block w-full text-left" onClick={() => select(item)} aria-pressed={selected}>
              <LibraryPreview item={item} active={hoveredId === item.id} />
              <span className="flex items-center gap-1.5 px-2 pb-1 pt-2"><span className="min-w-0 flex-1 truncate text-[11px] font-medium">{item.name}</span>{selected && <Check className="size-3 shrink-0 text-primary" />}</span>
              <span className="block truncate px-2 pb-2 text-[9px] text-muted-foreground">{item.category}</span>
            </button>
            <div className="flex items-center border-t border-white/5 px-1.5 py-1">
              <button type="button" onClick={() => { const next = toggleFavorite(userState, item.id); setUserState(next); saveLibraryUserState(next); }} aria-label={favorite ? `Remover ${item.name} dos favoritos` : `Favoritar ${item.name}`} className={`grid size-7 place-items-center rounded-md hover:bg-white/10 ${favorite ? "text-rose-400" : "text-muted-foreground"}`}><Heart className="size-3.5" fill={favorite ? "currentColor" : "none"} /></button>
              <button type="button" onClick={() => item.type === "transition" ? select(item) : add(item)} className="editor-primary-button ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-primary-foreground">{item.type === "transition" ? <SlidersHorizontal className="size-3" /> : item.type === "caption" ? <Captions className="size-3" /> : <Plus className="size-3" />} {actionLabel(item)}</button>
            </div>
          </article>;
        })}</div> : <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-white/10 px-5 text-center"><div><p className="text-xs font-medium">Nada por aqui</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Tente outra busca ou volte aos recursos incluídos.</p></div></div>}
      </div>
    </section>
  );
}

function actionLabel(item: LibraryItem) {
  if (item.type === "transition") return "Configurar";
  if (item.type === "caption") return "Escolher";
  if (item.type === "template") return "Usar modelo";
  if (["filter", "video-effect", "animation", "lut"].includes(item.type)) return "Aplicar";
  return "Adicionar";
}
