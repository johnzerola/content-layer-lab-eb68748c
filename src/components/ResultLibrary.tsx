import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listExports, type ExportRow } from "@/lib/cloud";
import { Button } from "@/components/ui/button";
import {
  Download,
  History,
  FileVideo,
  ExternalLink,
  Calendar,
  Layers,
  Monitor,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ResultLibrary() {
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    listExports(100)
      .then(setExports)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = exports.filter((e) =>
    (e.file_name + (e.source_name || "")).toLowerCase().includes(search.toLowerCase()),
  );

  const formatSize = (bytes: number) => {
    if (!bytes) return "---";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do arquivo ou fonte..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="size-4" />
          {exports.length} exportações registradas
        </div>
      </div>

      {!filtered.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileVideo className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">Nenhum resultado encontrado</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
            {search
              ? "Tente mudar os termos da busca."
              : "As exportações que você fizer aparecerão aqui."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <Card
              key={e.id}
              className="group overflow-hidden border-border/60 bg-surface/40 p-0 transition-colors hover:border-[var(--border-hover)] hover:bg-surface/60"
            >
              <div className="relative grid aspect-[16/9] place-items-center border-b border-border/60 bg-surface-2">
                <FileVideo className="size-8 text-primary/70" />
                <Badge
                  variant="outline"
                  className="absolute left-2 top-2 h-5 bg-background/70 font-mono text-[10px] uppercase tracking-[0.1em] backdrop-blur"
                >
                  {e.mode}
                </Badge>
                {e.platform && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground backdrop-blur">
                    <Monitor className="size-3" /> {e.platform}
                  </span>
                )}
              </div>

              <CardContent className="space-y-2 p-3.5">
                <h4 className="truncate text-sm font-medium" title={e.file_name}>
                  {e.file_name}
                </h4>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {e.source_name && (
                    <span className="flex min-w-0 items-center gap-1">
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">{e.source_name}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {formatDistanceToNow(new Date(e.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                  {e.bytes > 0 && (
                    <span className="font-mono">{formatSize(e.bytes)}</span>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full gap-2"
                  disabled
                  title="Este é o histórico das exportações. O arquivo foi salvo no seu computador no momento do download. Para arquivos guardados no servidor, use a fila de renderização na nuvem."
                >
                  <Download className="size-4" /> Salvo localmente
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
