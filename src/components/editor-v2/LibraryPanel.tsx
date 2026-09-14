import { useMemo, useState } from "react";
import { Check, Heart, Plus, Search } from "lucide-react";
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

type Scope = "built-in" | "favorites" | "recent";

interface LibraryPanelProps {
  registry: LibraryRegistry;
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
  onAdd: (item: LibraryItem) => void;
}

export function LibraryPanel({ registry, selectedId, onSelect, onAdd }: LibraryPanelProps) {
  const [section, setSection] = useState("Modelos");
  const [scope, setScope] = useState<Scope>("built-in");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [userState, setUserState] = useState(loadLibraryUserState);
  const result = useMemo(() => registry.search({ text: query, types: sections.find((item) => item.label === section)?.types ?? [], pageSize: 60 }), [registry, query, section]);
  const items = result.items.filter((item) => scope === "favorites" ? userState.favorites.includes(item.id) : scope === "recent" ? userState.recent.includes(item.id) : item.source === "built-in");

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
        {(["built-in", "favorites", "recent"] as Scope[]).map((value) => <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} className={`rounded-md px-2 py-1 text-[10px] ${scope === value ? "bg-primary/18 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{value === "built-in" ? "Incluídos" : value === "favorites" ? "Favoritos" : "Recentes"}</button>)}
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{items.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 vaiviral-scrollbar">
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
              <button type="button" onClick={() => add(item)} className="editor-primary-button ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-primary-foreground"><Plus className="size-3" /> Inserir</button>
            </div>
          </article>;
        })}</div> : <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-white/10 px-5 text-center"><div><p className="text-xs font-medium">Nada por aqui</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Tente outra busca ou volte aos recursos incluídos.</p></div></div>}
      </div>
    </section>
  );
}
