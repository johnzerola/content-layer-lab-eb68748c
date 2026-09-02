/**
 * Acervo de músicas e efeitos livres com prévia e carregamento sob demanda.
 * Só busca a lista quando a categoria é aberta e só baixa o arquivo quando o
 * usuário toca a prévia ou adiciona o som na trilha.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Music, Pause, Play, Plus, Search, Waves } from "lucide-react";
import { CC0_MOODS, SOUND_CATEGORIES, searchFreeSounds, type SoundAsset, type SoundKind } from "@/lib/editor/sound-library";


interface Props {
  /** adiciona o som na trilha de áudio do editor */
  onAdd: (asset: SoundAsset) => void;
}

export function SoundLibrary({ onAdd }: Props) {
  const [kind, setKind] = useState<SoundKind>("music");
  const categories = useMemo(() => SOUND_CATEGORIES.filter((c) => c.kind === kind), [kind]);
  const [categoryId, setCategoryId] = useState(categories[0]!.id);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SoundAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const category = categories.find((c) => c.id === categoryId) ?? categories[0]!;

  useEffect(() => {
    setCategoryId(categories[0]!.id);
  }, [categories]);

  useEffect(() => {
    let alive = true;
    const term = query.trim() || category.query;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      searchFreeSounds(term, kind)
        .then((list) => {
          if (alive) setItems(list);
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : "falha ao carregar o acervo");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [category, kind, query]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  /** Prévia sob demanda: cria o elemento só no clique e reaproveita um único player. */
  const preview = (asset: SoundAsset) => {
    if (playing === asset.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const el = new Audio();
    el.preload = "none";
    el.crossOrigin = "anonymous";
    el.src = asset.url;
    el.volume = 0.8;
    el.onended = () => setPlaying(null);
    el.onerror = () => {
      setPlaying(null);
      setError("essa prévia não pôde ser carregada");
    };
    audioRef.current = el;
    void el.play().catch(() => setPlaying(null));
    setPlaying(asset.id);
  };

  return (
    <div className="space-y-2">
      <div className="flex rounded-lg border border-border/60 p-0.5 text-xs">
        {(["music", "sfx"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 ${
              kind === k ? "bg-primary/20 text-foreground" : "text-muted-foreground"
            }`}
          >
            {k === "music" ? <Music className="h-3.5 w-3.5" /> : <Waves className="h-3.5 w-3.5" />}
            {k === "music" ? "Músicas" : "Efeitos"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar em ${category.label.toLowerCase()}...`}
          aria-label="Buscar no acervo de áudio"
          className="w-full bg-transparent py-1.5 text-xs outline-none"
        />
      </div>

      {kind === "music" && (
        <div className="grid grid-cols-3 gap-1.5">
          {CC0_MOODS.map((m) => {
            const active = query === m.query;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setQuery(active ? "" : m.query)}
                className={`rounded-lg bg-gradient-to-br ${m.gradient} p-2 text-left transition-transform hover:scale-[1.02] ${
                  active ? "ring-2 ring-primary" : ""
                }`}
              >
                <span className="block text-[11px] font-semibold text-foreground">{m.label}</span>
                <span className="block truncate text-[10px] text-foreground/70">{m.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1">

        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setQuery("");
              setCategoryId(c.id);
            }}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              c.id === categoryId && !query ? "border-primary bg-primary/20" : "border-border/60 text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {loading && (
          <p className="flex items-center gap-1.5 py-3 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando acervo livre...
          </p>
        )}
        {!loading && !items.length && !error && (
          <p className="py-3 text-[11px] text-muted-foreground">Nada encontrado. Tente outra busca.</p>
        )}
        {items.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center gap-2 rounded-lg border border-border/50 px-2 py-1.5 hover:border-primary/50"
          >
            <button
              type="button"
              onClick={() => preview(asset)}
              aria-label={playing === asset.id ? `Pausar ${asset.name}` : `Ouvir ${asset.name}`}
              className="rounded-full bg-primary/15 p-1.5 text-primary"
            >
              {playing === asset.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{asset.name}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {asset.sizeMb}MB · {asset.attribution}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onAdd(asset)}
              aria-label={`Adicionar ${asset.name} à trilha`}
              className="rounded-md border border-border/60 p-1 hover:border-primary/60"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Acervo livre (Creative Commons / domínio público) do Wikimedia Commons. Mantenha o crédito ao publicar.
      </p>
    </div>
  );
}
