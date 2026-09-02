/** Carrega a mídia do editor por arquivo local ou por link (mesmo fluxo do ViralBatch). */
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { LinkImport } from "@/components/editor/LinkImport";
import { registerSourceFile } from "@/lib/editor/cuts";

export interface MediaSourceBarProps {
  videoId: string;
  hasMedia: boolean;
  onLoaded: (file: File, objectUrl: string) => void;
}

export function MediaSourceBar({ videoId, hasMedia, onLoaded }: MediaSourceBarProps) {
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accept = (file: File) => {
    registerSourceFile(videoId, file);
    onLoaded(file, URL.createObjectURL(file));
    setMsg(`mídia carregada: ${file.name}`);
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
      <LinkImport onFile={accept} placeholder="Colar link do vídeo (tiktok, instagram, youtube, url direta)" />
      <div className="hidden">
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
