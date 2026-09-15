/** Baixa um vídeo a partir de um link e devolve o arquivo pronto para uso. */
import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { downloadVideoLink, extractVideoLinks } from "@/lib/link-import";

export interface LinkImportProps {
  onFile: (file: File) => void | Promise<void>;
  placeholder?: string;
}

export function LinkImport({ onFile, placeholder }: LinkImportProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const linkCount = extractVideoLinks(url).length;

  const run = async () => {
    const targets = extractVideoLinks(url);
    if (!targets.length || busy) return;
    setBusy(true);
    setProgress(0);
    setMessage(null);
    const failed: { url: string; reason: string }[] = [];
    let imported = 0;
    try {
      for (const [index, target] of targets.entries()) {
        try {
          const { file } = await downloadVideoLink(target);
          await onFile(file);
          imported += 1;
        } catch (error) {
          failed.push({
            url: target,
            reason: error instanceof Error ? error.message : "Falha desconhecida.",
          });
        }
        setProgress(index + 1);
      }
      setUrl(failed.map((item) => item.url).join("\n"));
      if (imported) toast.success(`${imported} vídeo(s) importado(s).`);
      if (failed.length) {
        const detail = failed.at(-1)?.reason ?? "Falha no download.";
        setMessage(`${failed.length} falharam. ${detail}`);
        toast.error(`${failed.length} link(s) falharam: ${detail}`);
      } else {
        setMessage(`${imported} vídeo(s) importado(s) com sucesso.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar o link.");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <textarea
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void run();
          }}
          aria-label="Link do vídeo"
          placeholder={placeholder ?? "Cole um link ou uma lista"}
          rows={2}
          className="w-72 resize-y rounded-xl border border-border/60 bg-background px-2 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !linkCount}
          className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy
            ? `Baixando ${progress}/${linkCount}`
            : linkCount > 1
              ? `Baixar ${linkCount}`
              : "Baixar"}
        </button>
      </div>
      {message && (
        <p role="status" className="pl-5 text-xs leading-relaxed text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
