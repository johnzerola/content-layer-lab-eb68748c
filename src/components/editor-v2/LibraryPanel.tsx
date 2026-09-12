import { useMemo, useState } from "react";
import { Check, Download, Heart, Library, Plus, Search } from "lucide-react";
import { LibraryRegistry, loadLibraryUserState, markRecent, saveLibraryUserState, toggleFavorite, type LibraryItem, type LibraryItemType } from "@/lib/editor-v2/library";
import { LibraryPreview } from "./LibraryPreview";

const sections: { label: string; types: LibraryItemType[] }[] = [
  { label: "Mídia", types: ["stock-video", "stock-image", "gif"] },
  { label: "Áudio", types: ["music", "sound-effect"] },
  { label: "Texto", types: ["text", "animation"] },
  { label: "Legendas", types: ["caption"] },
  { label: "Elementos", types: ["sticker", "overlay", "shape", "background"] },
  { label: "Transições", types: ["transition"] },
  { label: "Efeitos", types: ["video-effect", "filter", "lut"] },
  { label: "Templates", types: ["template"] },
];

type Scope = "built-in" | "favorites" | "recent" | "downloaded" | "online";

export function LibraryPanel({ registry, onAdd }: { registry: LibraryRegistry; onAdd: (item: LibraryItem) => void }) {
  const [section, setSection] = useState("Templates");
  const [scope, setScope] = useState<Scope>("built-in");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [userState, setUserState] = useState(loadLibraryUserState);
  const currentTypes = sections.find((item) => item.label === section)?.types ?? [];
  const result = useMemo(() => registry.search({ text: query, types: currentTypes, pageSize: 60 }), [registry, query, currentTypes]);
  const items = result.items.filter((item) => {
    if (scope === "favorites") return userState.favorites.includes(item.id);
    if (scope === "recent") return userState.recent.includes(item.id);
    if (scope === "downloaded") return userState.downloaded.includes(item.id);
    if (scope === "online") return item.source === "provider";
    return item.source === "built-in";
  });
  const updateUser = (next: typeof userState) => { setUserState(next); saveLibraryUserState(next); };
  const select = (item: LibraryItem) => { setSelectedId(item.id); updateUser(markRecent(userState, item.id)); };

  return (
    <section className="grid min-h-[620px] overflow-hidden rounded-2xl border border-border/70 bg-card/75 shadow-2xl shadow-black/20 lg:grid-cols-[168px_minmax(0,1fr)]" aria-label="Library do Editor V2">
      <nav className="border-b border-border/60 bg-background/65 p-3 lg:border-b-0 lg:border-r" aria-label="Categorias da Library">
        <div className="mb-3 flex items-center gap-2 px-2 text-sm font-semibold"><Library className="size-4 text-primary" /> Library</div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
          {sections.map((item) => <button key={item.label} type="button" onClick={() => { setSection(item.label); setSelectedId(null); }} className={`rounded-lg px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${section === item.label ? "bg-primary/16 text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>{item.label}</button>)}
        </div>
      </nav>

      <div className="min-w-0">
        <header className="space-y-3 border-b border-border/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold">{section}</p><p className="text-xs text-muted-foreground">{result.total} itens no registry local</p></div>
            <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar em ${section.toLowerCase()}…`} aria-label={`Buscar em ${section}`} className="h-9 w-full rounded-lg border border-border/70 bg-background/75 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Origem dos itens">
            {(["built-in", "favorites", "recent", "downloaded", "online"] as Scope[]).map((value) => <button key={value} type="button" onClick={() => setScope(value)} className={`rounded-full border px-2.5 py-1 text-[11px] ${scope === value ? "border-primary/60 bg-primary/15 text-foreground" : "border-border/60 text-muted-foreground"}`}>{value === "built-in" ? "Built-in" : value === "favorites" ? "Favoritos" : value === "recent" ? "Recentes" : value === "downloaded" ? "Baixados" : "Online"}</button>)}
          </div>
        </header>

        <div className="max-h-[532px] overflow-y-auto p-4">
          {items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{items.map((item) => {
            const selected = selectedId === item.id;
            const favorite = userState.favorites.includes(item.id);
            return <article key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-vaiviral-library-item", item.id)} onMouseEnter={() => setHoveredId(item.id)} onMouseLeave={() => setHoveredId(null)} className={`group overflow-hidden rounded-xl border bg-background/70 transition-[border-color,transform,box-shadow] focus-within:ring-2 focus-within:ring-primary ${selected ? "border-primary shadow-lg shadow-primary/10" : "border-border/60 hover:-translate-y-0.5 hover:border-primary/45"}`}>
              <button type="button" className="block w-full text-left" onClick={() => select(item)} aria-pressed={selected}>
                <LibraryPreview item={item} active={hoveredId === item.id} />
                <span className="block px-3 pb-2 pt-2"><span className="flex items-start justify-between gap-2"><span className="truncate text-xs font-medium">{item.name}</span>{selected && <Check className="size-3.5 shrink-0 text-primary" />}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{item.type} · {item.category}</span></span>
              </button>
              <div className="flex items-center gap-1 border-t border-border/50 px-2 py-1.5">
                <button type="button" onClick={() => updateUser(toggleFavorite(userState, item.id))} aria-label={favorite ? `Remover ${item.name} dos favoritos` : `Favoritar ${item.name}`} className={`grid size-7 place-items-center rounded-md hover:bg-muted ${favorite ? "text-rose-400" : "text-muted-foreground"}`}><Heart className="size-3.5" fill={favorite ? "currentColor" : "none"} /></button>
                {item.downloadState === "downloaded" && <Download className="size-3.5 text-emerald-400" aria-label="Baixado" />}
                <button type="button" onClick={() => { select(item); onAdd(item); }} className="ml-auto flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground"><Plus className="size-3" /> Adicionar</button>
              </div>
            </article>;
          })}</div> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-border/70 text-center"><div><p className="text-sm font-medium">Nenhum item aqui</p><p className="mt-1 text-xs text-muted-foreground">A integração online permanece desativada nesta fase.</p></div></div>}
        </div>
      </div>
    </section>
  );
}

