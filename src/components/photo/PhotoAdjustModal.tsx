import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_ADJUST, type PhotoAdjust } from "@/lib/photo/render";

export interface PhotoAdjustTarget {
  id: string;
  name: string;
  preview: string;
  adjust: PhotoAdjust;
}

export function PhotoAdjustModal({
  target,
  onClose,
  onApply,
}: {
  target: PhotoAdjustTarget | null;
  onClose: () => void;
  onApply: (id: string, adjust: PhotoAdjust) => void;
}) {
  const [adjust, setAdjust] = useState<PhotoAdjust>(DEFAULT_ADJUST);

  useEffect(() => {
    if (target) setAdjust(target.adjust);
  }, [target]);

  const rotate = () =>
    setAdjust((a) => ({ ...a, rotate90: (((a.rotate90 + 90) % 360) as PhotoAdjust["rotate90"]) }));

  const row = (
    label: string,
    key: "brightness" | "contrast" | "saturation",
  ) => (
    <div key={key} className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{Math.round(adjust[key] * 100)}%</span>
      </div>
      <Slider
        value={[adjust[key]]}
        min={0.6}
        max={1.4}
        step={0.01}
        onValueChange={([v]) => setAdjust((a) => ({ ...a, [key]: v ?? 1 }))}
      />
    </div>
  );

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajuste individual</DialogTitle>
        </DialogHeader>
        {target ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border bg-black/40">
              <img
                src={target.preview}
                alt={`Prévia de ${target.name}`}
                className="mx-auto max-h-64 object-contain transition-transform"
                style={{
                  transform: `rotate(${adjust.rotate90}deg)`,
                  filter: `brightness(${adjust.brightness}) contrast(${adjust.contrast}) saturate(${adjust.saturation})`,
                }}
              />
            </div>
            <Button variant="outline" size="sm" onClick={rotate} className="gap-2">
              <RotateCw className="size-4" /> Girar 90°
            </Button>
            {row("Brilho", "brightness")}
            {row("Contraste", "contrast")}
            {row("Saturação", "saturation")}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAdjust(DEFAULT_ADJUST)}>
                Redefinir
              </Button>
              <Button
                onClick={() => {
                  onApply(target.id, adjust);
                  onClose();
                }}
              >
                Aplicar
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
