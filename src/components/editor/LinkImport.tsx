/** Baixa um vídeo a partir de um link e devolve o arquivo pronto para uso. */
import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { resolveVideoLink } from "@/lib/import.functions";

export interface LinkImportProps {
  onFile: (file: File) => void;
  placeholder?: string;
}

export function LinkImport({ onFile, placeholder }: LinkImportProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const target = url.trim();
    if (!target || busy) return;
    setBusy(true);
    try {
      const res = await resolveVideoLink({ data: { url: target } });
      if (!res.ok || !res.videoUrl || !res.proxyUrl) {
        toast.error(res.message ?? "Não encontrei o vídeo nesse link.");
        return;
      }
      const dl = await fetch(res.proxyUrl);
      if (!dl.ok) {
        toast.error("A origem bloqueou o download desse arquivo.");
        return;
      }
      const blob = await dl.blob();
      const base = (res.title ?? "video").replace(/[^\w\-. ]+/g, "").trim().slice(0, 60) || "video";
      onFile(new File([blob], `${base}.${res.ext ?? "mp4"}`, { type: blob.type || "video/mp4" }));
      setUrl("");
      toast.success("Vídeo importado do link.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar o link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Link2 className="h-4 w-4 text-muted-foreground" />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run();
        }}
        aria-label="Link do vídeo"
        placeholder={placeholder ?? "Colar link do vídeo"}
        className="w-56 rounded-xl border border-border/60 bg-background px-2 py-2 text-sm"
      />
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || !url.trim()}
        className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Baixando…" : "Baixar"}
      </button>
    </div>
  );
}
