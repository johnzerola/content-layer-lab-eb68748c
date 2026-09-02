/** Carrega a mídia do editor por arquivo local ou por link (mesmo fluxo do ViralBatch). */
import { useRef, useState } from "react";
import { Link2, Upload } from "lucide-react";
import { toast } from "sonner";
import { resolveVideoLink } from "@/lib/import.functions";
import { registerSourceFile } from "@/lib/editor/cuts";

export interface MediaSourceBarProps {
  videoId: string;
  hasMedia: boolean;
  onLoaded: (file: File, objectUrl: string) => void;
}

export function MediaSourceBar({ videoId, hasMedia, onLoaded }: MediaSourceBarProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accept = (file: File) => {
    registerSourceFile(videoId, file);
    onLoaded(file, URL.createObjectURL(file));
    setMsg(`mídia carregada: ${file.name}`);
  };

  /** Baixa o vídeo pelo servidor e usa o arquivo direto no editor. */
  const importFromLink = async () => {
    const target = url.trim();
    if (!target || busy) return;
    setBusy(true);
    setMsg("procurando o vídeo...");
    try {
      const res = await resolveVideoLink({ data: { url: target } });
      if (!res.ok || !res.videoUrl || !res.proxyUrl) {
        setMsg(res.message ?? "não encontrei o vídeo nesse link");
        return;
      }
      setMsg(`baixando de ${res.source ?? "origem"}...`);
      const dl = await fetch(res.proxyUrl);
      if (!dl.ok) {
        setMsg("a origem bloqueou o download desse arquivo");
        return;
      }
      const blob = await dl.blob();
      const ext = res.ext ?? "mp4";
      const base = (res.title ?? "video").replace(/[^\w\-. ]+/g, "").trim().slice(0, 60) || "video";
      accept(new File([blob], `${base}.${ext}`, { type: blob.type || "video/mp4" }));
      setUrl("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha ao importar o link";
      setMsg(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) accept(file);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs"
      >
        <Upload className="h-3.5 w-3.5" /> {hasMedia ? "Trocar mídia" : "Carregar vídeo"}
      </button>
      <div className="flex items-center gap-1">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void importFromLink();
          }}
          placeholder="Colar link do vídeo (tiktok, instagram, youtube, url direta)"
          aria-label="Link do vídeo"
          className="w-64 rounded-md border border-border/60 bg-card/60 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => void importFromLink()}
          disabled={busy || !url.trim()}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Baixando..." : "Baixar"}
        </button>
      </div>
      {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
    </div>
  );
}
