/**
 * GALERIA DE CORTES REAIS — usada dentro do painel de Templates do editor
 * profissional. Lista os cortes publicados na biblioteca (tabela `video_cuts`),
 * mostra prévia 9:16 real (miniatura + player do trecho) e aplica o corte
 * escolhido direto no projeto aberto. Só apresentação: nenhuma regra nova.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { listLibraryCuts, type LibraryCut } from "@/lib/editor/cuts.service";
import { loadSourceFile } from "@/lib/editor/cuts";

function fmt(s: number) {
  const total = Math.max(0, Math.round(s));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Prévia 9:16 do trecho real do corte (usa o arquivo de origem quando existe). */
function CutPreview({ cut }: { cut: LibraryCut }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const play = useCallback(async () => {
    if (src || loading) return;
    setLoading(true);
    try {
      const file = await loadSourceFile(cut.sourceId);
      if (!file) {
        toast.error("O vídeo de origem deste corte não está disponível neste aparelho.");
        return;
      }
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      setSrc(url);
    } finally {
      setLoading(false);
    }
  }, [cut.sourceId, loading, src]);

  // mantém o player dentro da janela do corte
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
    const onTime = () => {
      if (el.currentTime < cut.start - 0.2 || el.currentTime > cut.end) el.currentTime = cut.start;
    };
    el.currentTime = cut.start;
    el.addEventListener("timeupdate", onTime);
    void el.play().catch(() => undefined);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [src, cut.start, cut.end]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "9 / 16" }}>
      {src ? (
        <video ref={videoRef} src={src} muted loop playsInline className="h-full w-full object-cover" />
      ) : (
        <>
          {cut.thumbnail ? (
            <img src={cut.thumbnail} alt={cut.title} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/25 to-background text-[10px] text-muted-foreground">
              9:16
            </div>
          )}
          <button
            type="button"
            onClick={play}
            aria-label={`Pré-visualizar ${cut.title}`}
            className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity hover:opacity-100"
          >
            {loading ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
          </button>
        </>
      )}
      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 font-mono text-[9px] text-white">
        {fmt(cut.end - cut.start)}
      </span>
    </div>
  );
}

export function CutGallery({ onApply }: { onApply: (cut: LibraryCut) => void | Promise<void> }) {
  const [cuts, setCuts] = useState<LibraryCut[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void listLibraryCuts()
      .then(setCuts)
      .catch(() => setCuts([]))
      .finally(() => setLoading(false));
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? cuts.filter((c) => `${c.title} ${c.caption ?? ""} ${c.sourceName}`.toLowerCase().includes(q)) : cuts;
  }, [cuts, query]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Carregando cortes…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar corte…"
        className="w-full rounded-lg border border-border/60 bg-transparent px-2 py-1.5 text-xs"
      />
      {!list.length && (
        <p className="text-xs text-muted-foreground">
          Nenhum corte publicado ainda. Gere cortes e publique na biblioteca para aplicá-los aqui.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {list.map((cut) => (
          <article key={cut.rowId} className="space-y-1.5 rounded-xl border border-border/60 p-1.5">
            <CutPreview cut={cut} />
            <p className="truncate text-[11px] font-medium">{cut.title}</p>
            <p className="truncate font-mono text-[9px] uppercase text-muted-foreground">
              {fmt(cut.start)}–{fmt(cut.end)}
            </p>
            <button
              type="button"
              disabled={busy === cut.rowId}
              onClick={async () => {
                setBusy(cut.rowId);
                try {
                  await onApply(cut);
                } finally {
                  setBusy(null);
                }
              }}
              className="interactive flex w-full items-center justify-center gap-1 rounded-lg bg-primary/20 px-2 py-1 text-[11px] disabled:opacity-60"
            >
              {busy === cut.rowId ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              Aplicar corte
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
