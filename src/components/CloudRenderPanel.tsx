import { useMemo } from "react";
import { CloudCog, Download, RefreshCw, StopCircle, Trash2, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCloudBatches } from "@/lib/cloud-render";
import { batchIsActive, batchPercent, CLOUD_STATUS_LABEL } from "@/lib/render-cloud";

/**
 * Fila de render na VPS. Mostra o andamento real vindo do servidor — o lote
 * continua rodando mesmo com o navegador fechado.
 */
export function CloudRenderPanel({ tool }: { tool?: string }) {
  const { batches, loading, error, refresh, cancel, remove } = useCloudBatches(true);

  const visible = useMemo(
    () => (tool ? batches.filter((b) => b.tool === tool) : batches),
    [batches, tool],
  );

  const downloadAll = async (urls: { name: string; url: string }[]) => {
    for (const item of urls) {
      const a = document.createElement("a");
      a.href = item.url;
      a.download = item.name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CloudCog className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Fila de render na nuvem</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          Atualizar
        </Button>
      </header>

      <p className="mb-3 text-xs text-muted-foreground">
        Os vídeos são renderizados no servidor. Pode fechar o navegador: quando voltar, os arquivos
        prontos ficam aqui para baixar.
      </p>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      ) : null}

      {!visible.length ? (
        <p className="text-xs text-muted-foreground">Nenhum lote na nuvem ainda.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((batch) => {
            const percent = batchPercent(batch);
            const ready = batch.items.filter((i) => i.resultUrl);
            return (
              <li key={batch.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {batch.label ?? "Lote"} · {batch.items.length} vídeo(s)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {CLOUD_STATUS_LABEL[batch.status]} · {percent}%
                      {batch.errors ? ` · ${batch.errors} com erro` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {ready.length > 1 ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void downloadAll(
                            ready.map((i) => ({ name: i.name, url: i.resultUrl as string })),
                          )
                        }
                      >
                        <FileArchive className="size-4" />
                        Baixar todos
                      </Button>
                    ) : null}
                    {batchIsActive(batch.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void cancel(batch.id).then(() => toast.success("Lote cancelado"))
                        }
                      >
                        <StopCircle className="size-4" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => void remove(batch.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <ul className="mt-2 space-y-1">
                  {batch.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="text-muted-foreground">
                        {item.error
                          ? item.error.slice(0, 60)
                          : item.stage || CLOUD_STATUS_LABEL[item.status]}
                        {item.status === "processing" ? ` ${Math.round(item.progress)}%` : ""}
                      </span>
                      {item.resultUrl ? (
                        <a
                          href={item.resultUrl}
                          download={item.name}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Download className="size-3.5" />
                          baixar
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
