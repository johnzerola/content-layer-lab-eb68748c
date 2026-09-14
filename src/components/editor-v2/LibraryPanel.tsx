import { useMemo, useRef, useState } from "react";
import { Captions, Check, Film, Heart, Image as ImageIcon, LoaderCircle, Music2, Plus, Search, SlidersHorizontal, Upload, Volume2 } from "lucide-react";
import { LibraryRegistry, loadLibraryUserState, markRecent, saveLibraryUserState, toggleFavorite, type LibraryItem, type LibraryItemType } from "@/lib/editor-v2/library";
import type { MediaAsset } from "@/lib/editor-v2/types";
import { LibraryPreview } from "./LibraryPreview";

const sections: { label: string; types: LibraryItemType[] }[] = [
  { label: "Mídia", types: [] },
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
  mediaAssets: MediaAsset[];
  assetThumbnails: Record<string, string>;
  importingMedia: boolean;
  onImportFiles: (files: FileList) => void;
  onInsertMedia: (asset: MediaAsset) => void;
  onPreviewSoundEffect: (item: LibraryItem) => void;
  revision?: number;
}

type MediaFilter = "all" | "video" | "image" | "audio";

export function LibraryPanel({ registry, selectedId, onSelect, onAdd, onGenerateCaptions, generatingCaptions, captionProgress, mediaAssets, assetThumbnails, importingMedia, onImportFiles, onInsertMedia, onPreviewSoundEffect, revision = 0 }: LibraryPanelProps) {
  const [section, setSection] = useState("Mídia");
  const [scope, setScope] = useState<Scope>("built-in");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [userState, setUserState] = useState(loadLibraryUserState);
  const result = useMemo(() => {
    void revision;
    return registry.search({ text: query, types: sections.find((item) => item.label === section)?.types ?? [], pageSize: 100 });
  }, [registry, revision, query, section]);
  const items = result.items.filter((item) => scope === "favorites" ? userState.favorites.includes(item.id) : scope === "recent" ? userState.recent.includes(item.id) : scope === "mine" ? item.source === "user" : item.source === "built-in");
  const visibleMedia = useMemo(() => mediaAssets.filter((asset) => {
    if (asset.kind !== "video" && asset.kind !== "image" && asset.kind !== "audio") return false;
    if (mediaFilter !== "all" && asset.kind !== mediaFilter) return false;
    return !query.trim() || asset.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"));
  }), [mediaAssets, mediaFilter, query]);
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
        {section === "Mídia" ? (["all", "video", "image", "audio"] as MediaFilter[]).map((value) => <button key={value} type="button" onClick={() => setMediaFilter(value)} aria-pressed={mediaFilter === value} className={`rounded-md px-2 py-1 text-[10px] ${mediaFilter === value ? "bg-primary/18 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{value === "all" ? "Tudo" : value === "video" ? "Vídeos" : value === "image" ? "Fotos" : "Áudios"}</button>) : (["built-in", "mine", "favorites", "recent"] as Scope[]).map((value) => <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} className={`rounded-md px-2 py-1 text-[10px] ${scope === value ? "bg-primary/18 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{value === "built-in" ? "Incluídos" : value === "mine" ? "Meus" : value === "favorites" ? "Favoritos" : "Recentes"}</button>)}
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{section === "Mídia" ? visibleMedia.length : items.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 vaiviral-scrollbar">
        {section === "Mídia" && <>
          <input ref={mediaInputRef} type="file" accept="video/*,audio/*,image/*" multiple className="sr-only" aria-label="Selecionar vídeos, fotos e áudios" onChange={(event) => { if (event.target.files?.length) onImportFiles(event.target.files); event.target.value = ""; }} />
          <div
            onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDraggingFiles(true); } }}
            onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false); }}
            onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); setDraggingFiles(false); onImportFiles(event.dataTransfer.files); } }}
            className={`mb-3 rounded-xl border border-dashed p-3 transition ${draggingFiles ? "border-primary bg-primary/14 shadow-[0_0_28px_hsl(var(--primary)/.16)]" : "border-white/14 bg-[linear-gradient(135deg,hsl(var(--primary)/.09),hsl(var(--accent)/.04))] hover:border-primary/45"}`}
          >
            <div className="flex items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/16 text-primary"><Upload className="size-4" /></span><div className="min-w-0"><p className="text-[11px] font-semibold text-foreground">Adicione sua mídia</p><p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">Arraste vídeos, fotos ou áudios para cá.</p></div></div>
            <button type="button" onClick={() => mediaInputRef.current?.click()} disabled={importingMedia} className="editor-primary-button mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-[10px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-65">{importingMedia ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}{importingMedia ? "Importando…" : "Escolher arquivos"}</button>
            <p className="mt-2 text-center text-[8px] text-muted-foreground">MP4, MOV, WebM, JPG, PNG, WebP, MP3 e WAV</p>
          </div>
          {visibleMedia.length ? <div className="grid grid-cols-2 gap-2">{visibleMedia.map((asset) => <MediaCard key={asset.id} asset={asset} {...(assetThumbnails[asset.id] ? { thumbnail: assetThumbnails[asset.id] } : {})} onInsert={() => onInsertMedia(asset)} />)}</div> : <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-white/10 px-5 text-center"><div><span className="mx-auto grid size-10 place-items-center rounded-full bg-white/5 text-muted-foreground"><Film className="size-4" /></span><p className="mt-3 text-xs font-medium">Sua mídia aparecerá aqui</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Depois de importar, você pode inserir o mesmo arquivo novamente em qualquer ponto da timeline.</p></div></div>}
        </>}
        {section === "Modelos" && <div className="mb-3 rounded-xl border border-violet-300/15 bg-[linear-gradient(135deg,rgba(124,92,255,.12),rgba(38,211,169,.05))] p-3">
          <p className="text-[11px] font-semibold text-foreground">Layouts prontos para o vídeo atual</p>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Use um modelo na posição da agulha. Os modelos que você criou no editor anterior aparecem em <strong className="font-semibold text-foreground">Meus</strong>.</p>
        </div>}
        {section === "Legendas" && <div className="mb-3 rounded-xl border border-primary/25 bg-[linear-gradient(135deg,hsl(var(--primary)/.14),hsl(var(--accent)/.06))] p-3 shadow-[0_0_26px_hsl(var(--primary)/.08)]">
          <div className="flex items-start gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/18 text-primary"><Captions className="size-4" /></span><div><p className="text-[11px] font-semibold text-foreground">Legendas automáticas</p><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Transcreve as falas, sincroniza cada palavra e usa o estilo escolhido abaixo.</p></div></div>
          <div className="mt-2 flex gap-1" role="group" aria-label="Coleções rápidas de legendas"><button type="button" onClick={() => setQuery("")} aria-pressed={!query} className={`h-7 rounded-md px-2.5 text-[9px] font-semibold ${!query ? "bg-white/12 text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}>Todos</button><button type="button" onClick={() => setQuery("shorts")} aria-pressed={query.trim().toLocaleLowerCase("pt-BR") === "shorts"} className={`h-7 rounded-md px-2.5 text-[9px] font-semibold ${query.trim().toLocaleLowerCase("pt-BR") === "shorts" ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/.28)]" : "bg-primary/10 text-primary hover:bg-primary/16"}`}>Shorts dinâmicos</button></div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/8 bg-black/15 px-2.5 py-2 text-[9px]"><span className="text-muted-foreground">Estilo</span><span className="max-w-36 truncate font-semibold text-foreground">{selectedCaptionStyle?.type === "caption" ? selectedCaptionStyle.name : "Verde Impacto"}</span></div>
          <button type="button" disabled={generatingCaptions} onClick={onGenerateCaptions} className="editor-primary-button mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-65">{generatingCaptions ? <LoaderCircle className="size-3.5 animate-spin" /> : <Captions className="size-3.5" />}{generatingCaptions ? `Gerando… ${captionProgress}%` : "Gerar legendas automáticas"}</button>
          <p className="mt-2 text-center text-[8px] leading-relaxed text-muted-foreground">Selecione um vídeo ou deixe o editor usar o primeiro vídeo disponível.</p>
        </div>}
        {section !== "Mídia" && (items.length ? <div className="grid grid-cols-2 gap-2">{items.map((item) => {
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
              {item.type === "sound-effect" && <button type="button" onClick={() => onPreviewSoundEffect(item)} aria-label={`Ouvir ${item.name}`} className="ml-0.5 flex h-7 items-center gap-1 rounded-md px-2 text-[9px] font-semibold text-cyan-300 hover:bg-cyan-300/10"><Volume2 className="size-3" />Ouvir</button>}
              <button type="button" onClick={() => item.type === "transition" ? select(item) : add(item)} className="editor-primary-button ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-primary-foreground">{item.type === "transition" ? <SlidersHorizontal className="size-3" /> : item.type === "caption" ? <Captions className="size-3" /> : <Plus className="size-3" />} {actionLabel(item)}</button>
            </div>
          </article>;
        })}</div> : <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-white/10 px-5 text-center"><div><p className="text-xs font-medium">Nada por aqui</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Tente outra busca ou volte aos recursos incluídos.</p></div></div>)}
      </div>
    </section>
  );
}

function MediaCard({ asset, thumbnail, onInsert }: { asset: MediaAsset; thumbnail?: string; onInsert: () => void }) {
  const Icon = asset.kind === "video" ? Film : asset.kind === "image" ? ImageIcon : Music2;
  return <article className="editor-library-card group overflow-hidden rounded-xl focus-within:ring-2 focus-within:ring-primary">
    <div className="relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_25%,hsl(var(--primary)/.22),transparent_55%),hsl(var(--muted)/.35)]">
      {thumbnail && asset.kind !== "audio" ? <img src={thumbnail} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" /> : <div className="grid size-full place-items-center"><span className={`grid size-11 place-items-center rounded-2xl ${asset.kind === "audio" ? "bg-cyan-400/14 text-cyan-300" : "bg-primary/14 text-primary"}`}><Icon className="size-5" /></span></div>}
      <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md border border-white/10 bg-black/55 px-1.5 py-1 text-[8px] font-semibold text-white backdrop-blur"><Icon className="size-2.5" />{asset.kind === "video" ? "VÍDEO" : asset.kind === "image" ? "FOTO" : "ÁUDIO"}</span>
      {asset.duration ? <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[8px] text-white">{formatDuration(asset.duration)}</span> : null}
    </div>
    <div className="px-2 pb-2 pt-2"><p className="truncate text-[10px] font-medium text-foreground" title={asset.name}>{asset.name}</p><p className="mt-0.5 truncate text-[8px] text-muted-foreground">{asset.width && asset.height ? `${asset.width} × ${asset.height}` : asset.mimeType || "Arquivo local"}</p></div>
    <div className="border-t border-white/5 p-1.5"><button type="button" onClick={onInsert} className="editor-primary-button flex h-7 w-full items-center justify-center gap-1 rounded-md px-2 text-[9px] font-semibold text-primary-foreground"><Plus className="size-3" />Inserir na agulha</button></div>
  </article>;
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function actionLabel(item: LibraryItem) {
  if (item.type === "transition") return "Configurar";
  if (item.type === "caption") return "Escolher";
  if (item.type === "template") return "Usar modelo";
  if (["filter", "video-effect", "animation", "lut"].includes(item.type)) return "Aplicar";
  return "Adicionar";
}
