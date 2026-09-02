import { X } from "lucide-react";
import { TemplateCanvas } from "@/components/TemplateCanvas";
import type { Template } from "@/lib/template";

/** Prévia rápida de UM vídeo: mostra como vai ficar e permite ajustar
 *  headline e CTA apenas deste vídeo (sem afetar o restante do lote). */
export function QuickPreviewModal({
  template,
  poster,
  file,
  fileName,
  headline,
  cta,
  onHeadline,
  onCta,
  onClose,
}: {
  template: Template;
  poster?: string | null;
  file?: File | null;
  fileName: string;
  headline: string;
  cta: string;
  onHeadline: (v: string) => void;
  onCta: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="panel max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold">Como vai ficar</p>
            <p className="truncate text-sm text-muted-foreground">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="fechar"
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-primary hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-[260px_1fr]">
          <div className="mx-auto w-full max-w-[260px]">
            <TemplateCanvas
              template={template}
              interactive={false}
              poster={poster ?? null}
              previewFile={file ?? null}
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              Headline só deste vídeo
              <input
                className="field mt-1 text-sm"
                placeholder={template.headline.text || "texto do template"}
                value={headline}
                onChange={(e) => onHeadline(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              CTA só deste vídeo
              <input
                className="field mt-1 text-sm"
                placeholder={template.cta.text || "texto do template"}
                value={cta}
                onChange={(e) => onCta(e.target.value)}
              />
            </label>
            <p className="font-mono text-[11px] text-muted-foreground">
              As mudanças valem apenas para este vídeo. Deixe em branco para usar o texto do
              template.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                className="rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:border-primary hover:text-primary"
                onClick={() => {
                  onHeadline("");
                  onCta("");
                }}
              >
                limpar deste vídeo
              </button>
              <button
                className="rounded-lg bg-primary px-3 py-1.5 font-mono text-xs text-primary-foreground"
                onClick={onClose}
              >
                pronto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
