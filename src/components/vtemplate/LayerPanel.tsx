/** Lista de camadas com reordenação, visibilidade, bloqueio, duplicar e excluir. */
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/base";
import type { TemplateLayer } from "@/lib/video-template/types";

const TYPE_LABEL: Record<TemplateLayer["type"], string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  shape: "Forma",
  caption: "Legenda",
};

export function LayerPanel({
  layers,
  selectedId,
  onSelect,
  onUpdate,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  /** ordenadas do fundo para o topo */
  layers: TemplateLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TemplateLayer>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (idsBottomFirst: string[]) => void;
}) {
  const topFirst = [...layers].reverse();

  const move = (id: string, dir: -1 | 1) => {
    const ids = layers.map((l) => l.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    onReorder(ids);
  };

  if (!layers.length) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma camada ainda. Adicione texto, vídeo, imagem ou um bloco pronto.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {topFirst.map((l) => {
        const sel = l.id === selectedId;
        return (
          <li key={l.id}>
            <div
              className={`group flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${
                sel ? "border-primary/70 bg-primary/10" : "border-transparent hover:bg-muted/40"
              }`}
            >
              <button type="button" onClick={() => onSelect(l.id)} className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span className="truncate text-sm">{l.name}</span>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  {TYPE_LABEL[l.type]}
                  {l.bindingType !== "STATIC" ? ` · ${l.bindingType}` : ""}
                </span>
              </button>
              <Button size="icon" variant="ghost" aria-label="Subir camada" onClick={() => move(l.id, 1)} className="size-7">
                <ChevronUp className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Descer camada" onClick={() => move(l.id, -1)} className="size-7">
                <ChevronDown className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={l.visible ? "Ocultar camada" : "Mostrar camada"}
                onClick={() => onUpdate(l.id, { visible: !l.visible })}
                className="size-7"
              >
                {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={l.locked ? "Desbloquear camada" : "Bloquear camada"}
                onClick={() => onUpdate(l.id, { locked: !l.locked })}
                className="size-7"
              >
                {l.locked ? <Lock className="size-3.5 text-warn" /> : <Unlock className="size-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" aria-label="Duplicar camada" onClick={() => onDuplicate(l.id)} className="size-7">
                <Copy className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Excluir camada" onClick={() => onDelete(l.id)} className="size-7">
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
