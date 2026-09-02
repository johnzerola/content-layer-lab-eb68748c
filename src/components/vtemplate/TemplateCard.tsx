/** Card de template com miniatura estática, ações e badges. */
import { Copy, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/base";
import { filterToCss } from "@/lib/video-template/factory";
import type { VideoTemplateRecord } from "@/lib/video-template/types";

/** Miniatura leve: desenha as camadas em DOM, sem vídeo. */
export function TemplateThumb({ template, height = 180 }: { template: VideoTemplateRecord; height?: number }) {
  const doc = template.template_data;
  const bg = doc.canvas.background;
  const background =
    bg.kind === "color"
      ? bg.color
      : bg.kind === "gradient"
        ? `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`
        : "#0b0b0f";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/60"
      style={{ height, aspectRatio: `${doc.canvas.width}/${doc.canvas.height}`, background, filter: filterToCss(doc.filter) }}
    >
      {[...doc.layers]
        .sort((a, b) => a.zIndex - b.zIndex)
        .filter((l) => l.visible)
        .map((l) => (
          <div
            key={l.id}
            className="absolute"
            style={{
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: `${l.width}%`,
              height: `${l.height}%`,
              opacity: l.opacity,
              transform: `rotate(${l.rotation}deg)`,
              background:
                l.type === "shape"
                  ? l.fill
                  : l.type === "video"
                    ? "rgba(124,92,255,.25)"
                    : l.type === "caption"
                      ? "rgba(255,255,255,.08)"
                      : l.type === "image"
                        ? "rgba(255,255,255,.14)"
                        : "transparent",
              borderRadius: l.type === "shape" && l.shape === "circle" ? "50%" : 4,
              color: l.type === "text" ? l.color : undefined,
              fontSize: l.type === "text" ? Math.max(6, (l.fontSize / doc.canvas.height) * height) : undefined,
              fontWeight: l.type === "text" ? l.fontWeight : undefined,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              textAlign: "center",
              lineHeight: 1.05,
            }}
          >
            {l.type === "text" ? l.text : null}
          </div>
        ))}
    </div>
  );
}

export function TemplateCard({
  template,
  onDuplicate,
  onDelete,
  onUse,
}: {
  template: VideoTemplateRecord;
  onDuplicate?: (t: VideoTemplateRecord) => void;
  onDelete?: (t: VideoTemplateRecord) => void;
  onUse?: (t: VideoTemplateRecord) => void;
}) {
  return (
    <article className="glass group flex flex-col gap-3 rounded-2xl border border-border/60 p-3 transition-transform hover:-translate-y-0.5">
      <TemplateThumb template={template} />
      <header className="min-w-0">
        <h3 className="truncate text-sm font-semibold">{template.name}</h3>
        <p className="font-mono text-[10px] uppercase text-muted-foreground">
          {template.aspect_ratio} · {template.template_data.layers.length} camadas
          {template.category ? ` · ${template.category}` : ""}
          {template.visibility === "public" ? " · público" : ""}
        </p>
      </header>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" asChild>
          <Link to="/templates/$id/edit" params={{ id: template.id }}>
            <Pencil className="mr-1 size-3.5" /> Editar
          </Link>
        </Button>
        {onUse && (
          <Button size="sm" variant="outline" onClick={() => onUse(template)}>
            <Sparkles className="mr-1 size-3.5" /> Aplicar
          </Button>
        )}
        {onDuplicate && (
          <Button size="icon" variant="ghost" aria-label="Duplicar template" className="size-8" onClick={() => onDuplicate(template)}>
            <Copy className="size-4" />
          </Button>
        )}
        {onDelete && (
          <Button size="icon" variant="ghost" aria-label="Excluir template" className="size-8" onClick={() => onDelete(template)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>
    </article>
  );
}
