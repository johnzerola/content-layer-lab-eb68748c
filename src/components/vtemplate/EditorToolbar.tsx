/** Barra de ferramentas do editor: adicionar camadas, blocos, zoom, undo/redo e salvar. */
import {
  Grid3x3,
  Image as ImageIcon,
  Redo2,
  Save,
  Shapes,
  Square,
  Subtitles,
  Type,
  Undo2,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/base";
import { SAVE_LABEL, type SaveStatus } from "@/lib/video-template/store";
import {
  BLOCKS,
  createCaptionLayer,
  createCutVideoLayer,
  createImageLayer,
  createLogoLayer,
  createShapeLayer,
  createTextLayer,
} from "@/lib/video-template/factory";
import type { TemplateLayer } from "@/lib/video-template/types";

export function EditorToolbar({
  layers,
  onAdd,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  setZoom,
  showGrid,
  setShowGrid,
  status,
  onSave,
}: {
  layers: TemplateLayer[];
  onAdd: (next: TemplateLayer[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  setZoom: (z: number) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  status: SaveStatus;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-3 py-2">
      <Button size="sm" variant="outline" onClick={() => onAdd([createTextLayer(layers)])}>
        <Type className="mr-1 size-3.5" /> Texto
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd([createCutVideoLayer(layers)])}>
        <Video className="mr-1 size-3.5" /> Vídeo
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd([createImageLayer(layers)])}>
        <ImageIcon className="mr-1 size-3.5" /> Imagem
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd([createLogoLayer(layers)])}>
        <Square className="mr-1 size-3.5" /> Logo
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd([createShapeLayer(layers)])}>
        <Shapes className="mr-1 size-3.5" /> Forma
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAdd([createCaptionLayer(layers)])}>
        <Subtitles className="mr-1 size-3.5" /> Legenda
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <select
        aria-label="Adicionar bloco pronto"
        value=""
        onChange={(e) => {
          const block = BLOCKS.find((b) => b.id === e.target.value);
          if (block) onAdd(block.build(layers));
          e.currentTarget.value = "";
        }}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      >
        <option value="">Blocos prontos…</option>
        {BLOCKS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button size="icon" variant="ghost" aria-label="Desfazer" disabled={!canUndo} onClick={onUndo} className="size-8">
        <Undo2 className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Refazer" disabled={!canRedo} onClick={onRedo} className="size-8">
        <Redo2 className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Diminuir zoom" onClick={() => setZoom(Math.max(0.3, zoom - 0.1))} className="size-8">
        <ZoomOut className="size-4" />
      </Button>
      <span className="w-12 text-center font-mono text-[11px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Button size="icon" variant="ghost" aria-label="Aumentar zoom" onClick={() => setZoom(Math.min(1.4, zoom + 0.1))} className="size-8">
        <ZoomIn className="size-4" />
      </Button>
      <Button
        size="icon"
        variant={showGrid ? "default" : "ghost"}
        aria-label="Alternar grade"
        onClick={() => setShowGrid(!showGrid)}
        className="size-8"
      >
        <Grid3x3 className="size-4" />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{SAVE_LABEL[status]}</span>
        <Button size="sm" onClick={onSave} disabled={status === "saving"}>
          <Save className="mr-1 size-3.5" /> Salvar
        </Button>
      </div>
    </div>
  );
}
