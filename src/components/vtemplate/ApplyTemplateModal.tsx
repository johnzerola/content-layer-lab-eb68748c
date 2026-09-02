/** Modal para aplicar um template a um ou vários vídeos/cortes (lote). */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/base";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applyTemplateBatch } from "@/lib/video-template/service";
import type { BindableVideoSource, VideoTemplateRecord } from "@/lib/video-template/types";
import { TemplateThumb } from "./TemplateCard";

export function ApplyTemplateModal({
  template,
  sources,
  open,
  onOpenChange,
  onApplied,
}: {
  template: VideoTemplateRecord | null;
  sources: BindableVideoSource[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApplied?: (count: number) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  if (!template) return null;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const apply = async () => {
    const chosen = sources.filter((s) => selected.includes(s.id));
    if (!chosen.length) {
      toast.error("Selecione pelo menos um vídeo.");
      return;
    }
    setProgress({ done: 0, total: chosen.length });
    try {
      await applyTemplateBatch(template, chosen, (done, total) => setProgress({ done, total }));
      toast.success(`Template aplicado a ${chosen.length} vídeo(s).`);
      onApplied?.(chosen.length);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível aplicar o template.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Aplicar “{template.name}”</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <TemplateThumb template={template} height={220} />
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            {sources.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum vídeo disponível ainda. Importe ou gere cortes primeiro.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sources.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/40">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                      <span className="truncate">{s.title ?? s.id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {sources.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => setSelected(selected.length === sources.length ? [] : sources.map((s) => s.id))}
              >
                {selected.length === sources.length ? "Limpar seleção" : "Selecionar todos"}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          {progress && (
            <span className="mr-auto font-mono text-xs text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={!!progress}>
            Aplicar a {selected.length || 0} vídeo(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
