import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Trash2,
  Upload,
  Undo2,
  Redo2,
  Plus,
  ArrowUp,
  ArrowDown,
  Magnet,
  Bug,
  Eye,
  EyeOff,
  Layers,
  Palette,
  Sparkles,
  Type as TypeIcon,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TemplateCanvas, LAYER_ORDER, LAYER_LABELS, layerOf, selectableIds } from "./TemplateCanvas";
import {
  defaultCaptions,
  makeExtra,
  type BoxLayer,
  type CaptionStyle,
  type ImageLayer,
  type LayerId,
  type SelId,
  type Template,
  type TextLayer,
} from "@/lib/template";
import { BUILTIN_FONTS, fileToFont, registerFonts } from "@/lib/fonts";
import { defaultAntiDup, makeVariation, describeVariation } from "@/lib/variation";
import { TemplateTimeline } from "./TemplateTimeline";
import { uploadFileOrInline } from "@/lib/media-store";
import { useMediaUrl } from "@/hooks/useMediaUrl";

const KEY_OF: Record<LayerId, keyof Template> = {
  video: "video",
  watermark: "watermark",
  avatar: "avatar",
  name: "name_",
  handle: "handle",
  headline: "headline",
  cta: "cta",
  captions: "captions",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="studio-label">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "field text-sm";

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  );
}

/** Envia a imagem para o armazenamento da conta (cai para data URL se falhar). */
async function fileToDataUrl(file: File) {
  return uploadFileOrInline("template", file);
}

/** Miniatura que entende tanto link direto quanto arquivo guardado na conta. */
function MediaThumb({ src, className }: { src: string; className?: string }) {
  const url = useMediaUrl(src);
  if (!url) return null;
  return <img src={url} alt="" className={className} />;
}

function DebugPanel({
  t,
  selected,
  grid,
  setGrid,
  safe,
  setSafe,
  boxes,
  setBoxes,
}: {
  t: Template;
  selected: SelId | null;
  grid: number;
  setGrid: (n: number) => void;
  safe: boolean;
  setSafe: (b: boolean) => void;
  boxes: boolean;
  setBoxes: (b: boolean) => void;
}) {
  const l = selected
    ? (layerOf(t, selected) as
        | (Record<string, unknown> & {
            x: number;
            y: number;
            w: number;
            h?: number;
            size?: number;
            visible: boolean;
            rotation?: number;
            opacity?: number;
            z?: number;
          })
        | null)
    : null;
  const h = l ? (l.h ?? Math.round((l.size ?? 0) * 1.2)) : 0;
  const W = t.canvasW ?? 1080;
  const H = t.canvasH ?? 1920;

  const rows: [string, string][] = l
    ? [
        ["X", `${Math.round(l.x)} px (${((l.x / W) * 100).toFixed(1)}%)`],
        ["Y", `${Math.round(l.y)} px (${((l.y / H) * 100).toFixed(1)}%)`],
        ["Larg", `${Math.round(l.w)} px (${((l.w / W) * 100).toFixed(1)}%)`],
        ["Alt", `${Math.round(h)} px (${((h / H) * 100).toFixed(1)}%)`],
        ["Centro", `${Math.round(l.x + l.w / 2)} , ${Math.round(l.y + h / 2)}`],
        ["Rotação", `${Math.round(l.rotation ?? 0)}°`],
        ["Opacidade", (l.opacity ?? 1).toFixed(2)],
        ["Z-index", String(l.z ?? 0)],
        ["Visível", l.visible ? "sim" : "não"],
      ]
    : [];

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="studio-label">Depuração</span>
        <button
          onClick={() => setBoxes(!boxes)}
          className={`rounded-md border px-2 py-1 font-mono text-[11px] ${boxes ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          bounding boxes
        </button>
        <button
          onClick={() => setSafe(!safe)}
          className={`rounded-md border px-2 py-1 font-mono text-[11px] ${safe ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          safe areas
        </button>
        <div className="flex items-center gap-1">
          {[2, 3, 4, 6].map((n) => (
            <button
              key={n}
              onClick={() => setGrid(n)}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] ${grid === n ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {n}×{n}
            </button>
          ))}
        </div>
      </div>

      <div className="font-mono text-[11px] text-muted-foreground">
        canvas {W}×{H} · camadas {selectableIds(t).length}
      </div>

      {l ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-border/50 py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-foreground">{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-mono text-[11px] text-muted-foreground">Selecione uma camada para inspecionar.</p>
      )}
    </div>
  );
}

/** Botão de ferramenta da barra superior, com rótulo curto e dica. */
function ToolButton({
  icon,
  label,
  title,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active ?? undefined}
      className={`interactive flex h-11 w-[58px] flex-col items-center justify-center gap-0.5 rounded-xl border text-muted-foreground disabled:opacity-40 ${
        active ? "border-primary/60 bg-primary/15 text-primary" : "border-border bg-surface-2"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

const LAYER_ICON: Record<string, React.ReactNode> = {
  video: <ImageIcon className="size-4" />,
  watermark: <ImageIcon className="size-4" />,
  avatar: <ImageIcon className="size-4" />,
  name: <TypeIcon className="size-4" />,
  handle: <TypeIcon className="size-4" />,
  headline: <TypeIcon className="size-4" />,
  cta: <TypeIcon className="size-4" />,
  captions: <TypeIcon className="size-4" />,
};

export function TemplateEditor({
  value,
  onCancel,
  onSave,
  onUse,
  previewFile,
}: {
  previewFile?: File | null | undefined;
  value: Template;
  onCancel: () => void;
  onSave: (t: Template) => void;
  onUse: (t: Template) => void;
}) {
  const [t, setTRaw] = useState<Template>(value);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const duration = mediaDuration ?? t.timelineDuration ?? 30;
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now();
    const initial = time;
    let lastUpdate = -Infinity;
    const tick = () => {
      const next = initial + (performance.now() - start) / 1000;
      if (next - lastUpdate >= 0.1 || next >= duration) {
        setTime(Math.min(next, duration));
        lastUpdate = next;
      }
      if (next >= duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The starting position is captured when playback begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration]);
  const [selected, setSelected] = useState<SelId | null>("headline");
  const [tab, setTab] = useState<"layers" | "design" | "effects">("layers");
  const [snap, setSnap] = useState(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const [debug, setDebug] = useState(false);
  const [debugGrid, setDebugGrid] = useState(3);
  const [debugSafe, setDebugSafe] = useState(true);
  const [debugBoxes, setDebugBoxes] = useState(true);
  const [adPreview, setAdPreview] = useState(false);
  const [adSeed, setAdSeed] = useState(() => Math.random().toString(36).slice(2, 8));

  const adVariation = useMemo(
    () => makeVariation({ ...defaultAntiDup(), ...(t.antiDup ?? {}), mirror: t.mirror, speed: t.speed }, adSeed),
    [t.antiDup, t.mirror, t.speed, adSeed],
  );
  const adOpts = useMemo(
    () =>
      adPreview
        ? {
            mirror: adVariation.mirror,
            brightness: adVariation.brightness,
            saturation: adVariation.saturation,
            zoom: adVariation.zoom,
            noise: adVariation.noise,
            rotate: adVariation.rotate,
            border: adVariation.border,
            borderColor: adVariation.borderColor,
          }
        : undefined,
    [adPreview, adVariation],
  );

  const past = useRef<Template[]>([]);
  const future = useRef<Template[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    void registerFonts(value.fonts);
  }, [value.fonts]);

  const setT = useCallback((next: Template | ((cur: Template) => Template)) => {
    setTRaw((cur) => {
      const value_ = typeof next === "function" ? (next as (c: Template) => Template)(cur) : next;
      past.current = [...past.current.slice(-49), cur];
      future.current = [];
      force((n) => n + 1);
      return value_;
    });
  }, []);

  const undo = useCallback(() => {
    setTRaw((cur) => {
      const prev = past.current.pop();
      if (!prev) return cur;
      future.current = [cur, ...future.current.slice(0, 49)];
      force((n) => n + 1);
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setTRaw((cur) => {
      const [next, ...rest] = future.current;
      if (!next) return cur;
      future.current = rest;
      past.current = [...past.current, cur];
      force((n) => n + 1);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const fonts = useMemo(() => [...BUILTIN_FONTS, ...(t.fonts ?? []).map((f) => f.name)], [t.fonts]);

  const patch = (id: LayerId, data: Record<string, unknown>) => {
    const key = KEY_OF[id];
    const cur = (t[key] ?? (id === "captions" ? defaultCaptions() : {})) as object;
    setT({ ...t, [key]: { ...cur, ...data } } as Template);
  };

  const patchExtra = (extraId: string, data: Record<string, unknown>) =>
    setT({
      ...t,
      extras: (t.extras ?? []).map((e) => (e.id === extraId ? ({ ...e, ...data } as typeof e) : e)),
    });

  const addExtra = (kind: "text" | "image", at?: { x: number; y: number }, src?: string) => {
    const extra = makeExtra(kind, (t.extras ?? []).length);
    if (at) {
      extra.x = Math.round(at.x - extra.w / 2);
      extra.y = Math.round(at.y - extra.h / 2);
    }
    if (src && "src" in extra) (extra as ImageLayer).src = src;
    setT({ ...t, extras: [...(t.extras ?? []), extra] });
    setSelected(`extra:${extra.id}`);
    setTab("layers");
    return extra;
  };

  const removeExtra = (extraId: string) => {
    setT({ ...t, extras: (t.extras ?? []).filter((e) => e.id !== extraId) });
    if (selected === `extra:${extraId}`) setSelected(null);
  };

  /** reordena as camadas livres (arraste na lista) e reescreve o z de cada uma */
  const moveExtra = (from: number, to: number) => {
    const list = [...(t.extras ?? [])];
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [item] = list.splice(from, 1);
    if (!item) return;
    list.splice(to, 0, item);
    setT({ ...t, extras: list.map((e, i) => ({ ...e, z: 100 + i })) });
  };

  /** converte um ponto da tela em coordenadas do canvas 1080x1920 */
  const toCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = stageRef.current?.querySelector("canvas");
    const W = t.canvasW ?? 1080;
    const H = t.canvasH ?? 1920;
    if (!canvas) return { x: W / 2, y: H / 2 };
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(W, ((clientX - r.left) / Math.max(1, r.width)) * W)),
      y: Math.max(0, Math.min(H, ((clientY - r.top) / Math.max(1, r.height)) * H)),
    };
  };

  const handleStageDrop = async (dt: DataTransfer, clientX: number, clientY: number) => {
    const at = toCanvasPoint(clientX, clientY);
    const kind = dt.getData("application/x-vaiviral-layer");
    if (kind === "text" || kind === "image") {
      addExtra(kind, at);
      return;
    }
    const files = Array.from(dt.files ?? []);
    if (files.length === 0) return;
    for (const f of files) {
      const name = f.name.toLowerCase();
      if (f.type.startsWith("image/")) {
        addExtra("image", at, await fileToDataUrl(f));
      } else if (/\.(ttf|otf|woff2?)$/.test(name)) {
        await uploadFont(f);
        toast.success(`Fonte "${f.name}" adicionada`);
      } else if (f.type.startsWith("audio/")) {
        toast.info("Som entra no Editor profissional", {
          description: "Aqui você monta o visual; a trilha e o volume ficam na etapa de edição do vídeo.",
        });
      } else if (f.type.startsWith("video/")) {
        toast.info("O vídeo de fundo vem da lista de vídeos importados.");
      }
    }
  };


  const textLayer = (id: LayerId) => t[KEY_OF[id]] as unknown as TextLayer;
  const imgLayer = (id: LayerId) => t[KEY_OF[id]] as unknown as ImageLayer;
  const caps = t.captions ?? defaultCaptions();

  const uploadFont = async (f: File) => {
    const font = await fileToFont(f);
    setT({ ...t, fonts: [...(t.fonts ?? []).filter((x) => x.name !== font.name), font] });
  };

  const timing = (
    layer: { tStart?: number; tEnd?: number | null; fadeIn?: number; fadeOut?: number },
    apply: (data: Record<string, unknown>) => void,
  ) => {
    const start = layer.tStart ?? 0;
    const end = layer.tEnd ?? null;
    return (
      <div className="space-y-2 border-t border-border pt-3">
        <p className="studio-label">Tempo em tela</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Aparece em (s)">
            <input
              type="number"
              min={0}
              step={0.5}
              className={inputCls}
              value={start}
              onChange={(e) => apply({ tStart: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Some em (s)">
            <input
              type="number"
              min={0}
              step={0.5}
              placeholder="até o fim"
              className={inputCls}
              value={end ?? ""}
              onChange={(e) =>
                apply({ tEnd: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </Field>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Deixe “Some em” vazio para o elemento ficar durante o vídeo inteiro.
        </p>
        <Slider
          label="Fade de entrada (s)"
          value={layer.fadeIn ?? 0}
          min={0}
          max={3}
          step={0.1}
          onChange={(v) => apply({ fadeIn: v })}
        />
        <Slider
          label="Fade de saída (s)"
          value={layer.fadeOut ?? 0}
          min={0}
          max={3}
          step={0.1}
          onChange={(v) => apply({ fadeOut: v })}
        />
        <div className="flex flex-wrap gap-2">
          {[
            ["Só 5s", 5],
            ["Só 15s", 15],
            ["Só 30s", 30],
          ].map(([label, secs]) => (
            <button
              key={label as string}
              onClick={() => apply({ tStart: 0, tEnd: secs, fadeIn: 0.4, fadeOut: 0.6 })}
              className="rounded-full border border-border px-3 py-1 text-[11px] hover:border-primary"
            >
              {label as string}
            </button>
          ))}
          <button
            onClick={() => apply({ tStart: 0, tEnd: null, fadeIn: 0, fadeOut: 0 })}
            className="rounded-full border border-border px-3 py-1 text-[11px] hover:border-primary"
          >
            Vídeo todo
          </button>
        </div>
      </div>
    );
  };

  const zOpacity = (
    layer: {
      z?: number;
      opacity?: number;
      tStart?: number;
      tEnd?: number | null;
      fadeIn?: number;
      fadeOut?: number;
    },
    apply: (data: Record<string, unknown>) => void,
  ) => (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="studio-label">Posição e transparência</p>
      <Slider label="Ordem (z-index)" value={layer.z ?? 0} min={0} max={200} onChange={(v) => apply({ z: v })} />
      <Slider
        label="Opacidade"
        value={Math.round((layer.opacity ?? 1) * 100)}
        min={0}
        max={100}
        onChange={(v) => apply({ opacity: v / 100 })}
      />
      <div className="flex gap-2">
        <button
          onClick={() => apply({ z: (layer.z ?? 0) + 10 })}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] hover:border-primary"
        >
          <ArrowUp className="size-3" /> trazer para frente
        </button>
        <button
          onClick={() => apply({ z: Math.max(0, (layer.z ?? 0) - 10) })}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] hover:border-primary"
        >
          <ArrowDown className="size-3" /> enviar para trás
        </button>
      </div>
      {timing(layer, apply)}
    </div>
  );

  const fontSelect = (val: string, onPick: (v: string) => void) => (
    <Field label="Fonte">
      <select className={inputCls} value={val} onChange={(e) => onPick(e.target.value)}>
        {fonts.map((f) => (
          <option key={f} value={f}>
            {f.split(",")[0]}
          </option>
        ))}
      </select>
    </Field>
  );

  /** Propriedades de uma camada fixa do template. */
  const layerProperties = (id: LayerId) => {
    const layer = t[KEY_OF[id]] as unknown as (BoxLayer & { visible: boolean }) | undefined;
    if (!layer) return null;
    return (
      <div className="space-y-3">
        {id === "video" && (
          <>
            <Slider label="X" value={t.video.x} min={-200} max={1080} onChange={(v) => patch(id, { x: v })} />
            <Slider label="Y" value={t.video.y} min={-200} max={1920} onChange={(v) => patch(id, { y: v })} />
            <Slider label="Largura" value={t.video.w} min={200} max={1080} onChange={(v) => patch(id, { w: v })} />
            <Slider label="Altura" value={t.video.h} min={200} max={1920} onChange={(v) => patch(id, { h: v })} />
            <Slider
              label="Cantos arredondados"
              value={t.video.radius}
              min={0}
              max={240}
              onChange={(v) => patch(id, { radius: v })}
            />
            <div className="flex gap-2">
              {[
                ["9:16", 9 / 16],
                ["4:5", 4 / 5],
                ["1:1", 1],
              ].map(([label, ratio]) => (
                <button
                  key={label as string}
                  onClick={() => patch(id, { h: Math.round(t.video.w / (ratio as number)) })}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {id === "captions" && (
          <>
            <p className="text-[11px] text-muted-foreground">
              As legendas são geradas por vídeo na tela principal. Aqui você define o estilo.
            </p>
            <Field label="Estilo">
              <select
                className={inputCls}
                value={caps.mode}
                onChange={(e) => patch(id, { mode: e.target.value as CaptionStyle["mode"] })}
              >
                <option value="karaoke">Karaokê (destaca a palavra falada)</option>
                <option value="word">Uma palavra por vez</option>
                <option value="line">Linha inteira</option>
              </select>
            </Field>
            {fontSelect(caps.font, (v) => patch(id, { font: v }))}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cor">
                <input
                  type="color"
                  className="h-9 w-full rounded-lg border border-border bg-transparent"
                  value={caps.color}
                  onChange={(e) => patch(id, { color: e.target.value })}
                />
              </Field>
              <Field label="Cor do destaque">
                <input
                  type="color"
                  className="h-9 w-full rounded-lg border border-border bg-transparent"
                  value={caps.activeColor}
                  onChange={(e) => patch(id, { activeColor: e.target.value })}
                />
              </Field>
            </div>
            <Slider label="Tamanho" value={caps.size} min={28} max={140} onChange={(v) => patch(id, { size: v })} />
            <Slider label="Contorno" value={caps.stroke} min={0} max={24} onChange={(v) => patch(id, { stroke: v })} />
            <Slider
              label="Palavras por bloco"
              value={caps.maxWords}
              min={1}
              max={8}
              onChange={(v) => patch(id, { maxWords: v })}
            />
            <Slider
              label="Sincronia (s)"
              value={caps.offset ?? 0}
              min={-1}
              max={1}
              step={0.05}
              onChange={(v) => patch(id, { offset: v })}
            />
            <Slider label="X" value={caps.x} min={0} max={1080} onChange={(v) => patch(id, { x: v })} />
            <Slider label="Y" value={caps.y} min={0} max={1920} onChange={(v) => patch(id, { y: v })} />
            <Slider label="Largura" value={caps.w} min={200} max={1080} onChange={(v) => patch(id, { w: v })} />
            <Field label="Fundo">
              <select
                className={inputCls}
                value={caps.bg}
                onChange={(e) => patch(id, { bg: e.target.value as CaptionStyle["bg"] })}
              >
                <option value="shadow">Sombra</option>
                <option value="box">Caixa</option>
                <option value="none">Nenhum</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={caps.uppercase}
                onChange={(e) => patch(id, { uppercase: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              MAIÚSCULAS
            </label>
          </>
        )}

        {(id === "avatar" || id === "watermark") && (
          <>
            <div className="flex items-center gap-2">
              {imgLayer(id).src && <MediaThumb src={imgLayer(id).src!} className="size-10 rounded-md object-cover" />}
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">
                <Upload className="size-3.5" /> Trocar imagem
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) patch(id, { src: await fileToDataUrl(f), visible: true });
                  }}
                />
              </label>
              {imgLayer(id).src && (
                <button
                  onClick={() => patch(id, { src: null })}
                  className="rounded-lg border border-border p-2 text-destructive hover:border-destructive"
                  aria-label="Remover imagem"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
            <Slider label="X" value={imgLayer(id).x} min={-100} max={1080} onChange={(v) => patch(id, { x: v })} />
            <Slider label="Y" value={imgLayer(id).y} min={-100} max={1920} onChange={(v) => patch(id, { y: v })} />
            <Slider
              label="Tamanho"
              value={imgLayer(id).w}
              min={40}
              max={900}
              onChange={(v) => patch(id, { w: v, h: v })}
            />
            <Slider
              label="Opacidade"
              value={Math.round(imgLayer(id).opacity * 100)}
              min={0}
              max={100}
              onChange={(v) => patch(id, { opacity: v / 100 })}
            />
            <Slider
              label="Rotação"
              value={imgLayer(id).rotation}
              min={-45}
              max={45}
              onChange={(v) => patch(id, { rotation: v })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={imgLayer(id).round}
                onChange={(e) => patch(id, { round: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              Recorte circular
            </label>
          </>
        )}

        {["name", "handle", "headline", "cta"].includes(id) && (
          <>
            <Field label="Texto">
              <textarea
                className={inputCls}
                rows={id === "headline" ? 2 : 1}
                value={textLayer(id).text}
                onChange={(e) => patch(id, { text: e.target.value })}
              />
            </Field>
            {fontSelect(textLayer(id).font, (v) => patch(id, { font: v }))}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cor">
                <input
                  type="color"
                  className="h-9 w-full rounded-lg border border-border bg-transparent"
                  value={textLayer(id).color}
                  onChange={(e) => patch(id, { color: e.target.value })}
                />
              </Field>
              <Field label="Tamanho">
                <input
                  type="number"
                  className={inputCls}
                  value={textLayer(id).size}
                  onChange={(e) => patch(id, { size: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso">
                <select
                  className={inputCls}
                  value={textLayer(id).weight}
                  onChange={(e) => patch(id, { weight: e.target.value })}
                >
                  <option value="400">Regular</option>
                  <option value="600">Semibold</option>
                  <option value="700">Bold</option>
                  <option value="800">Black</option>
                </select>
              </Field>
              <Field label="Alinhamento">
                <select
                  className={inputCls}
                  value={textLayer(id).align}
                  onChange={(e) => patch(id, { align: e.target.value })}
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
              </Field>
            </div>
            <Slider label="X" value={textLayer(id).x} min={-100} max={1080} onChange={(v) => patch(id, { x: v })} />
            <Slider label="Y" value={textLayer(id).y} min={-100} max={1920} onChange={(v) => patch(id, { y: v })} />
            <Slider
              label="Largura da caixa"
              value={textLayer(id).w}
              min={100}
              max={1080}
              onChange={(v) => patch(id, { w: v })}
            />
            <Slider
              label="Rotação"
              value={textLayer(id).rotation}
              min={-45}
              max={45}
              onChange={(v) => patch(id, { rotation: v })}
            />

            {id === "name" && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!textLayer(id).badge}
                    onChange={(e) => patch(id, { badge: e.target.checked })}
                    className="size-4 accent-[var(--primary)]"
                  />
                  Mostrar selo azul verificado
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!textLayer(id).accentColor}
                    onChange={(e) =>
                      patch(id, {
                        accentColor: e.target.checked ? "#d75904" : undefined,
                        accentFrom: 0,
                        accentTo: textLayer(id).text.length,
                      })
                    }
                    className="size-4 accent-[var(--primary)]"
                  />
                  Colorir parte do nome
                </label>
                {textLayer(id).accentColor && (
                  <div className="space-y-2">
                    <Slider
                      label="Início"
                      value={textLayer(id).accentFrom ?? 0}
                      min={0}
                      max={textLayer(id).text.length}
                      onChange={(v) => patch(id, { accentFrom: v })}
                    />
                    <Slider
                      label="Fim"
                      value={textLayer(id).accentTo ?? 0}
                      min={0}
                      max={textLayer(id).text.length}
                      onChange={(v) => patch(id, { accentTo: v })}
                    />
                    <input
                      type="color"
                      value={textLayer(id).accentColor}
                      onChange={(e) => patch(id, { accentColor: e.target.value })}
                      className="h-9 w-full rounded-lg border border-border bg-transparent"
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {zOpacity(layer, (data) => patch(id, data))}
      </div>
    );
  };

  /** Propriedades de uma camada livre (texto ou imagem adicionada pelo usuário). */
  const extraProperties = (extraId: string) => {
    const e = (t.extras ?? []).find((x) => x.id === extraId);
    if (!e) return null;
    const isImg = "src" in e;
    return (
      <div className="space-y-3">
        <Field label="Nome da camada">
          <input className={inputCls} value={e.label} onChange={(ev) => patchExtra(e.id, { label: ev.target.value })} />
        </Field>
        {isImg ? (
          <>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">
              <Upload className="size-3.5" /> Enviar imagem
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (ev) => {
                  const f = ev.target.files?.[0];
                  if (f) patchExtra(e.id, { src: await fileToDataUrl(f) });
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(e as ImageLayer).round}
                onChange={(ev) => patchExtra(e.id, { round: ev.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              Recorte circular
            </label>
          </>
        ) : (
          <>
            <Field label="Texto">
              <textarea
                className={inputCls}
                rows={2}
                value={(e as TextLayer).text}
                onChange={(ev) => patchExtra(e.id, { text: ev.target.value })}
              />
            </Field>
            {fontSelect((e as TextLayer).font, (v) => patchExtra(e.id, { font: v }))}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cor">
                <input
                  type="color"
                  className="h-9 w-full rounded-lg border border-border bg-transparent"
                  value={(e as TextLayer).color}
                  onChange={(ev) => patchExtra(e.id, { color: ev.target.value })}
                />
              </Field>
              <Field label="Tamanho">
                <input
                  type="number"
                  className={inputCls}
                  value={(e as TextLayer).size}
                  onChange={(ev) => patchExtra(e.id, { size: Number(ev.target.value) })}
                />
              </Field>
            </div>
          </>
        )}
        <Slider label="X" value={e.x} min={-200} max={1080} onChange={(v) => patchExtra(e.id, { x: v })} />
        <Slider label="Y" value={e.y} min={-200} max={1920} onChange={(v) => patchExtra(e.id, { y: v })} />
        <Slider label="Largura" value={e.w} min={40} max={1080} onChange={(v) => patchExtra(e.id, { w: v })} />
        <Slider label="Altura" value={e.h} min={40} max={1920} onChange={(v) => patchExtra(e.id, { h: v })} />
        <Slider label="Rotação" value={e.rotation} min={-45} max={45} onChange={(v) => patchExtra(e.id, { rotation: v })} />
        {zOpacity(e, (data) => patchExtra(e.id, data))}
        <button
          onClick={() => removeExtra(e.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-destructive hover:border-destructive"
        >
          <Trash2 className="size-3.5" /> Excluir camada
        </button>
      </div>
    );
  };

  const selectedLabel = selected
    ? selected.startsWith("extra:")
      ? ((t.extras ?? []).find((e) => `extra:${e.id}` === selected)?.label ?? "Camada")
      : LAYER_LABELS[selected as LayerId]
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-0 backdrop-blur-md sm:p-4">
      <div className="studio panel glass pop-in flex h-full w-full max-w-[1600px] flex-col overflow-hidden">
        {/* Barra superior: identidade, ferramentas e ações principais */}
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <label className="studio-label block" htmlFor="studio-template-name">
                Nome do template
              </label>

              <input
                id="studio-template-name"
                className="w-full max-w-md truncate border-0 bg-transparent p-0 studio-title text-[19px] text-foreground outline-none placeholder:text-muted-foreground focus:underline focus:decoration-primary/60 focus:underline-offset-4"
                value={t.name}
                placeholder="Sem título"
                onChange={(e) => setT({ ...t, name: e.target.value })}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <ToolButton
              icon={<Undo2 className="size-4" />}
              label="Desfazer"
              title="Desfazer (Ctrl+Z)"
              disabled={!past.current.length}
              onClick={undo}
            />
            <ToolButton
              icon={<Redo2 className="size-4" />}
              label="Refazer"
              title="Refazer (Ctrl+Shift+Z)"
              disabled={!future.current.length}
              onClick={redo}
            />
            <ToolButton
              icon={<Magnet className="size-4" />}
              label="Ímã"
              title="Snap e guias de alinhamento (segure Alt para ignorar)"
              active={snap}
              onClick={() => setSnap((s) => !s)}
            />
            <ToolButton
              icon={<Bug className="size-4" />}
              label="Grade"
              title="Modo de depuração: grade, safe areas e bounding boxes"
              active={debug}
              onClick={() => setDebug((d) => !d)}
            />
            <div className="mx-1 h-8 w-px bg-border" aria-hidden />
            <Button variant="outline" size="sm" onClick={() => onUse(t)}>
              Usar sem salvar
            </Button>
            <Button size="sm" onClick={() => onSave(t)}>
              Salvar template
            </Button>
            <button
              onClick={onCancel}
              className="interactive ml-1 grid size-9 place-items-center rounded-xl border border-border bg-surface-2 text-muted-foreground"
              aria-label="Fechar editor"
              title="Fechar editor"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Área de trabalho: ferramentas · palco · propriedades */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:min-h-[440px] lg:grid-cols-[276px_minmax(0,1fr)_348px] lg:overflow-hidden">
          {/* Coluna esquerda: camadas e ajustes do template */}
          <aside className="flex min-h-0 flex-col border-border lg:border-r">
            <div className="flex gap-1 border-b border-border p-2">
              {[
                { id: "layers" as const, label: "Camadas", icon: <Layers className="size-3.5" /> },
                { id: "design" as const, label: "Design", icon: <Palette className="size-3.5" /> },
                { id: "effects" as const, label: "Efeitos", icon: <Sparkles className="size-3.5" /> },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  aria-pressed={tab === item.id}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition ${
                    tab === item.id
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              {tab === "layers" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(["text", "image"] as const).map((kind) => (
                      <button
                        key={kind}
                        draggable
                        onDragStart={(ev) => ev.dataTransfer.setData("application/x-vaiviral-layer", kind)}
                        onClick={() => addExtra(kind)}
                        title="Clique para adicionar ou arraste até o vídeo"
                        className="interactive flex cursor-grab items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-2 text-xs font-medium active:cursor-grabbing"
                      >
                        <Plus className="size-3.5" /> {kind === "text" ? "Texto" : "Imagem"}
                      </button>
                    ))}
                  </div>
                  <p className="px-1 text-[11px] text-muted-foreground">
                    Arraste estes botões — ou arquivos de imagem e fontes do seu computador — direto para o vídeo.
                  </p>


                  <div className="space-y-1">
                    <p className="studio-label px-1">Elementos do template</p>
                    {LAYER_ORDER.map((id) => {
                      const layer = t[KEY_OF[id]] as unknown as (BoxLayer & { visible: boolean }) | undefined;
                      if (!layer) return null;
                      const active = selected === id;
                      return (
                        <div
                          key={id}
                          className={`studio-item ${active ? "studio-item-active" : ""}`}
                        >
                          <button
                            onClick={() => patch(id, { visible: !layer.visible })}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={layer.visible ? `Ocultar ${LAYER_LABELS[id]}` : `Mostrar ${LAYER_LABELS[id]}`}
                            title={layer.visible ? "Ocultar" : "Mostrar"}
                          >
                            {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                          </button>
                          <button
                            onClick={() => setSelected(id)}
                            className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm ${
                              layer.visible ? "" : "text-muted-foreground line-through"
                            }`}
                          >
                            <span className="text-muted-foreground">{LAYER_ICON[id]}</span>
                            <span className="truncate">{LAYER_LABELS[id]}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-1">
                    <p className="studio-label px-1">Camadas livres</p>
                    {(t.extras ?? []).length === 0 && (
                      <p className="px-1 text-[11px] text-muted-foreground">
                        Nenhuma ainda — use os botões acima para adicionar texto ou imagem.
                      </p>
                    )}
                    {(t.extras ?? []).map((e) => {
                      const active = selected === `extra:${e.id}`;
                      return (
                        <div key={e.id} className={`studio-item ${active ? "studio-item-active" : ""}`}>
                          <button
                            onClick={() => patchExtra(e.id, { visible: !e.visible })}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={e.visible ? `Ocultar ${e.label}` : `Mostrar ${e.label}`}
                            title={e.visible ? "Ocultar" : "Mostrar"}
                          >
                            {e.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                          </button>
                          <button
                            onClick={() => setSelected(`extra:${e.id}`)}
                            className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm ${
                              e.visible ? "" : "text-muted-foreground line-through"
                            }`}
                          >
                            <span className="text-muted-foreground">
                              {"src" in e ? <ImageIcon className="size-4" /> : <TypeIcon className="size-4" />}
                            </span>
                            <span className="truncate">{e.label}</span>
                          </button>
                          <button
                            onClick={() => removeExtra(e.id)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Excluir ${e.label}`}
                            title="Excluir camada"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {tab === "design" && (
                <>
                  <Field label="Cor de fundo">
                    <div className="flex gap-2">
                      {["#ffffff", "#0a0a0a", "#101418"].map((c) => (
                        <button
                          key={c}
                          onClick={() => setT({ ...t, background: c })}
                          className={`size-9 rounded-lg border-2 ${t.background === c ? "border-primary" : "border-border"}`}
                          style={{ background: c }}
                          aria-label={`Fundo ${c}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={t.background}
                        onChange={(e) => setT({ ...t, background: e.target.value })}
                        className="size-9 rounded-lg border border-border bg-transparent"
                        aria-label="Cor de fundo personalizada"
                      />
                    </div>
                  </Field>

                  <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
                    <p className="studio-label">Fontes próprias</p>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">
                      <Upload className="size-3.5" /> Enviar .ttf / .otf / .woff
                      <input
                        type="file"
                        accept=".ttf,.otf,.woff,.woff2,font/*"
                        hidden
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) await uploadFont(f);
                        }}
                      />
                    </label>
                    {(t.fonts ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(t.fonts ?? []).map((f) => (
                          <span
                            key={f.name}
                            className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px]"
                          >
                            {f.name}
                            <button
                              onClick={() => setT({ ...t, fonts: (t.fonts ?? []).filter((x) => x.name !== f.name) })}
                              className="text-destructive"
                              aria-label={`Remover fonte ${f.name}`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {tab === "effects" && (
                <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3">
                  <p className="studio-label">Anti-duplicidade</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={adPreview}
                      onChange={(e) => setAdPreview(e.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Pré-visualizar efeito no preview
                  </label>
                  {adPreview ? (
                    <div className="space-y-2 rounded-lg border border-primary/40 bg-background/40 p-2">
                      <p className="text-xs text-muted-foreground">{describeVariation(adVariation)}</p>
                      <button
                        className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary"
                        onClick={() => setAdSeed(Math.random().toString(36).slice(2, 8))}
                      >
                        Sortear outra variação
                      </button>
                    </div>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={t.mirror}
                      onChange={(e) => setT({ ...t, mirror: e.target.checked })}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Espelhar vídeo horizontalmente
                  </label>
                  <Slider
                    label="Velocidade"
                    value={t.speed}
                    min={0.95}
                    max={1.05}
                    step={0.01}
                    onChange={(v) => setT({ ...t, speed: v })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Muda a duração e o fingerprint do arquivo. Não há garantia de que plataformas tratem o vídeo como
                    novo.
                  </p>
                </div>
              )}
            </div>
          </aside>

          {/* Palco central: preview 9:16 */}
          <section className="flex min-h-0 flex-col items-center justify-center gap-3 bg-background/40 p-4">
            <div className="flex w-full items-center justify-between gap-2">
              <p className="studio-label">Preview em tempo real</p>
              <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {t.canvasW ?? 1080}×{t.canvasH ?? 1920}
              </span>
            </div>
            <div
              ref={stageRef}
              onDragOver={(ev) => {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "copy";
                if (!dropping) setDropping(true);
              }}
              onDragLeave={(ev) => {
                if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDropping(false);
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                setDropping(false);
                void handleStageDrop(ev.dataTransfer, ev.clientX, ev.clientY);
              }}
              className={`grid min-h-0 w-full flex-1 place-items-center rounded-2xl border bg-[repeating-conic-gradient(var(--color-surface-2)_0%_25%,transparent_0%_50%)] bg-[length:22px_22px] p-4 transition ${
                dropping ? "border-primary bg-primary/5 ring-2 ring-primary/40" : "border-border"
              }`}
            >
              <TemplateCanvas
                frameClassName="aspect-[9/16] h-full max-h-[62vh] w-auto max-w-full rounded-xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]"
                template={t}
                previewFile={previewFile ?? null}
                timelineTime={time}
                timelinePlaying={playing}
                onDuration={setMediaDuration}
                selected={selected}
                onSelect={setSelected}
                onChange={setT}
                snap={snap}
                debug={debug}
                debugGrid={debugGrid}
                debugSafeArea={debugSafe}
                debugBoxes={debugBoxes}
                drawOpts={adOpts}
                motionVar={adPreview ? adVariation : null}
                speed={adPreview ? adVariation.speed : 1}
              />
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Arraste para mover · alças nos 8 pontos para redimensionar · Shift mantém proporção · Alt redimensiona
              pelo centro · setas movem 1px (Shift 10px)
            </p>
          </section>

          {/* Coluna direita: propriedades do elemento selecionado */}
          <aside className="flex min-h-0 flex-col border-border lg:border-l">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="studio-title truncate text-sm">
                {selectedLabel ? selectedLabel : "Propriedades"}
              </h3>
              {selectedLabel ? <span className="studio-label">selecionado</span> : null}
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {selected ? (
                selected.startsWith("extra:") ? (
                  extraProperties(selected.slice("extra:".length))
                ) : (
                  layerProperties(selected as LayerId)
                )
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Clique em um elemento do vídeo ou na lista de camadas para editar seus ajustes aqui.
                </p>
              )}

              {debug ? (
                <DebugPanel
                  t={t}
                  selected={selected}
                  grid={debugGrid}
                  setGrid={setDebugGrid}
                  safe={debugSafe}
                  setSafe={setDebugSafe}
                  boxes={debugBoxes}
                  setBoxes={setDebugBoxes}
                />
              ) : null}
            </div>
          </aside>
        </div>

        {/* Linha do tempo em toda a largura */}
        <div className="max-h-[38vh] shrink-0 overflow-y-auto border-t border-border bg-surface-2/40 p-3">
          <TemplateTimeline
            template={t}
            onChange={setT}
            selected={selected}
            onSelect={setSelected}
            time={time}
            onSeek={(n) => {
              setPlaying(false);
              setTime(n);
            }}
            playing={playing}
            onPlay={() => {
              if (time >= duration) setTime(0);
              setPlaying((p) => !p);
            }}
            duration={duration}
            onDuration={(n) => {
              setPlaying(false);
              setMediaDuration(null);
              setTime((v) => Math.min(v, n));
              setT({ ...t, timelineDuration: n });
            }}
          />
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="truncate text-[11px] text-muted-foreground">
            As alterações aparecem no preview — nada é salvo até confirmar.
          </p>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </footer>
      </div>
    </div>
  );
}
