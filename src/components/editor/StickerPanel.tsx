/**
 * Painel de STICKERS (chamadas para ação animadas).
 *
 * Todos os stickers são desenhados em vetor pelo próprio app — nada de assets
 * de terceiros — então a prévia e o MP4 exportado ficam idênticos.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import { STICKERS, drawSticker, type StickerDef, type StickerId } from "@/lib/editor/stickers";
import { createStickerLayer } from "@/lib/video-template/factory";
import {
  CTA_GOAL_LABELS,
  CTA_PLATFORMS,
  buildSmartCta,
  type CtaGoal,
  type CtaPlatform,
} from "@/lib/editor/cta-smart";
import type { StickerLayer, TemplateLayer } from "@/lib/video-template/types";

function StickerThumb({ def, color, accent, text }: { def: StickerDef; color: string; accent: string; text: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const bw = def.ratio >= 1 ? w * 0.9 : h * 0.9 * def.ratio;
      const bh = bw / def.ratio;
      drawSticker(ctx, def.id, (w - bw) / 2, (h - Math.min(bh, h * 0.9)) / 2, bw, Math.min(bh, h * 0.9), {
        t: (performance.now() - t0) / 1000,
        color,
        accent,
        text: text || def.text,
        fontFamily: "Outfit",
        speed: 1,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [def, color, accent, text]);
  return <canvas ref={ref} width={240} height={110} className="h-[55px] w-full" />;
}

export function StickerPanel({
  layers,
  selected,
  brandColor,
  brandAccent,
  onAdd,
  onUpdate,
}: {
  layers: TemplateLayer[];
  selected: StickerLayer | null;
  brandColor?: string;
  brandAccent?: string;
  onAdd: (layer: TemplateLayer) => void;
  onUpdate: (id: string, patch: Partial<StickerLayer>) => void;
}) {
  const [color, setColor] = useState(brandColor || "#7c5cff");
  const [accent, setAccent] = useState(brandAccent || "#ffffff");
  const [text, setText] = useState("");
  const [group, setGroup] = useState<string>("Todos");
  const [platform, setPlatform] = useState<CtaPlatform>("instagram");
  const [goal, setGoal] = useState<CtaGoal>("seguir");
  const [handle, setHandle] = useState("");
  const [useBrand, setUseBrand] = useState(false);

  const platformDef = CTA_PLATFORMS.find((p) => p.id === platform)!;
  const smart = useMemo(
    () => buildSmartCta(platform, goal, handle, { ...(brandColor ? { color: brandColor } : {}), ...(brandAccent ? { accent: brandAccent } : {}), useBrand }),
    [platform, goal, handle, brandColor, brandAccent, useBrand],
  );
  const smartDef = useMemo(() => STICKERS.find((s) => s.id === smart.stickerId)!, [smart.stickerId]);

  /** Adiciona o CTA já ajustado ao formato e à UI nativa da plataforma. */
  const addSmart = () => {
    onAdd(
      createStickerLayer(layers, smart.stickerId, {
        name: `CTA ${platformDef.label}`,
        text: smart.text,
        color: smart.color,
        accent: smart.accent,
        speed: smart.speed,
        x: smart.x,
        y: smart.y,
        width: smart.width,
        height: smart.height,
        endTime: smart.duration,
      }),
    );
  };

  const groups = useMemo(() => ["Todos", ...Array.from(new Set(STICKERS.map((s) => s.group)))], []);
  const list = useMemo(() => (group === "Todos" ? STICKERS : STICKERS.filter((s) => s.group === group)), [group]);

  const add = (def: StickerDef) => {
    const height = 12;
    const width = Math.min(84, height * def.ratio * (1920 / 1080) * 0.55);
    onAdd(
      createStickerLayer(layers, def.id as StickerId, {
        name: def.label,
        text: text || def.text,
        color,
        accent,
        width,
        height,
        x: (100 - width) / 2,
      }),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Chamada para ação</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Clique para adicionar no vídeo. Depois ajuste posição e duração na timeline.
        </p>
      </div>

      <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
        <Label className="text-xs">CTA inteligente por plataforma</Label>
        <div className="flex gap-1">
          {CTA_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPlatform(p.id);
                if (!p.goals.includes(goal)) setGoal(p.goals[0]!);
              }}
              className={`flex-1 rounded-lg px-2 py-1 text-[11px] transition ${
                platform === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {platformDef.goals.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGoal(g)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                goal === g ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}
            >
              {CTA_GOAL_LABELS[g]}
            </button>
          ))}
        </div>
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@seucanal ou link do perfil"
        />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={useBrand} onChange={(e) => setUseBrand(e.target.checked)} />
          Usar as cores da minha marca
        </label>
        <div className="rounded-lg bg-background/60 p-2">
          <StickerThumb def={smartDef} color={smart.color} accent={smart.accent} text={smart.text} />
          <p className="mt-1 text-[10px] text-muted-foreground">{smart.hint}</p>
        </div>
        <Button size="sm" className="w-full" onClick={addSmart}>
          Adicionar CTA de {platformDef.label}
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Cor</Label>
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 p-1" />
        </div>
        <div>
          <Label className="text-xs">Detalhe</Label>
          <Input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 p-1" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Texto (seu @ ou nome do canal)</Label>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="@seuperfil" />
      </div>

      <div className="flex flex-wrap gap-1">
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              group === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {list.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => add(def)}
            title={def.hint}
            className="interactive rounded-xl border border-border/60 bg-background/40 p-2 text-left hover:border-primary/60"
          >
            <StickerThumb def={def} color={color} accent={accent} text={text} />
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">{def.label}</span>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
          <Label className="text-xs">Sticker selecionado</Label>
          <Input
            value={selected.text}
            onChange={(e) => onUpdate(selected.id, { text: e.target.value })}
            placeholder="Texto"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="color"
              value={selected.color}
              onChange={(e) => onUpdate(selected.id, { color: e.target.value })}
              className="h-9 p-1"
            />
            <Input
              type="color"
              value={selected.accent}
              onChange={(e) => onUpdate(selected.id, { accent: e.target.value })}
              className="h-9 p-1"
            />
          </div>
          <div>
            <Label className="text-xs">Velocidade da animação: {selected.speed.toFixed(1)}x</Label>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.1}
              value={selected.speed}
              onChange={(e) => onUpdate(selected.id, { speed: Number(e.target.value) })}
              className="w-full"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUpdate(selected.id, { color, accent })}
            className="w-full"
          >
            Aplicar cores acima
          </Button>
        </div>
      ) : null}
    </div>
  );
}
