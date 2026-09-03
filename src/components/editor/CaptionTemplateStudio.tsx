/**
 * ESTÚDIO DO TEMPLATE DE LEGENDA (autoral): edita texto e duração de cada
 * bloco, mostra a prévia rodando em 9:16 e aplica junto com um layout pronto.
 * Painel independente — não precisa do painel de legendas do editor.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Play, Pause, Trash2, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  blockId,
  captionTemplateDuration,
  defaultCaptionTemplate,
  deleteCaptionTemplate,
  listCaptionTemplates,
  saveCaptionTemplate,
  setPendingCaptionTemplate,
  withBrand,
  type CaptionTemplate,
} from "@/lib/editor/caption-template";
import { READY_TEMPLATES } from "@/lib/editor/template-presets";
import { setPendingLayout } from "@/lib/editor/style-presets";
import { loadBrandKit } from "@/lib/brand-kit";

export function CaptionTemplateStudio() {
  const [tpl, setTpl] = useState<CaptionTemplate>(() => defaultCaptionTemplate());
  const [saved, setSaved] = useState<CaptionTemplate[]>([]);
  const [layoutId, setLayoutId] = useState<string>("");
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => setSaved(listCaptionTemplates()), []);

  const total = useMemo(() => Math.max(0.5, captionTemplateDuration(tpl)), [tpl]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => (t + dt) % total);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, total]);

  /** bloco visível no instante atual da prévia */
  const current = useMemo(() => {
    let cursor = Math.max(0, tpl.startAt);
    for (const b of tpl.blocks) {
      const dur = Math.max(0.2, b.dur);
      if (time >= cursor && time < cursor + dur) return b;
      cursor += dur;
    }
    return null;
  }, [tpl, time]);

  const patch = (p: Partial<CaptionTemplate>) => setTpl((t) => ({ ...t, ...p }));
  const patchStyle = (p: Partial<CaptionTemplate["style"]>) =>
    setTpl((t) => ({ ...t, style: { ...t.style, ...p } }));
  const patchBlock = (id: string, p: Partial<CaptionTemplate["blocks"][number]>) =>
    setTpl((t) => ({ ...t, blocks: t.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) }));

  const apply = () => {
    setPendingCaptionTemplate(tpl);
    if (layoutId) setPendingLayout(layoutId);
    toast.success(
      layoutId
        ? "Legenda + layout prontos — abra um projeto no editor para aplicar."
        : "Template de legenda pronto — abra um projeto no editor para aplicar.",
    );
  };

  const s = tpl.style;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* editor de blocos */}
      <div className="space-y-4">
        <div className="glass space-y-3 rounded-2xl border border-border/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={tpl.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="flex-1 rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
              placeholder="Nome do template de legenda"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Atraso inicial
              <input
                type="number"
                step={0.1}
                min={0}
                value={tpl.startAt}
                onChange={(e) => patch({ startAt: Math.max(0, Number(e.target.value) || 0) })}
                className="w-20 rounded-lg border border-border/60 bg-transparent px-2 py-1"
              />
              s
            </label>
          </div>

          <div className="space-y-2">
            {tpl.blocks.map((b, i) => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="mono-label w-6 text-center text-[10px]">{i + 1}</span>
                <input
                  value={b.text}
                  onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                  className="flex-1 rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm"
                  placeholder="Texto do bloco"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="number"
                    step={0.1}
                    min={0.2}
                    value={b.dur}
                    onChange={(e) => patchBlock(b.id, { dur: Math.max(0.2, Number(e.target.value) || 0.2) })}
                    className="w-16 rounded-lg border border-border/60 bg-transparent px-2 py-1"
                    aria-label={`Duração do bloco ${i + 1}`}
                  />
                  s
                </label>
                <button
                  type="button"
                  aria-label={`Remover bloco ${i + 1}`}
                  onClick={() => setTpl((t) => ({ ...t, blocks: t.blocks.filter((x) => x.id !== b.id) }))}
                  className="interactive rounded-lg border border-border/60 p-2 text-muted-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setTpl((t) => ({ ...t, blocks: [...t.blocks, { id: blockId(), text: "Novo bloco", dur: 1.6 }] }))
              }
              className="interactive inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-xs"
            >
              <Plus className="size-3.5" /> Adicionar bloco
            </button>
            <button
              type="button"
              onClick={() => setTpl((t) => withBrand(t, loadBrandKit()))}
              className="interactive inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-xs"
            >
              <Wand2 className="size-3.5" /> Usar cores do Brand Kit
            </button>
            <span className="ml-auto self-center text-xs text-muted-foreground">
              Duração total {total.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* estilo do template */}
        <div className="glass grid gap-3 rounded-2xl border border-border/60 p-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="mono-label">Tamanho</span>
            <input
              type="range"
              min={40}
              max={130}
              value={s.fontSize}
              onChange={(e) => patchStyle({ fontSize: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="mono-label">Altura na tela</span>
            <input
              type="range"
              min={10}
              max={88}
              value={s.y}
              onChange={(e) => patchStyle({ y: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="mono-label">Texto</span>
            <input
              type="color"
              value={s.color}
              onChange={(e) => patchStyle({ color: e.target.value })}
              className="h-8 w-full rounded-lg border border-border/60 bg-transparent"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="mono-label">Caixa</span>
            <input
              type="color"
              value={s.background ?? "#101014"}
              onChange={(e) => patchStyle({ background: e.target.value })}
              className="h-8 w-full rounded-lg border border-border/60 bg-transparent"
            />
          </label>
          <label className="flex items-center gap-2 self-end text-xs">
            <input
              type="checkbox"
              checked={Boolean(s.background)}
              onChange={(e) => patchStyle({ background: e.target.checked ? "#101014" : null })}
            />
            Com caixa
          </label>
          <label className="flex items-center gap-2 self-end text-xs">
            <input
              type="checkbox"
              checked={s.uppercase}
              onChange={(e) => patchStyle({ uppercase: e.target.checked })}
            />
            Maiúsculas
          </label>
        </div>

        {/* aplicar */}
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 p-4">
          <select
            value={layoutId}
            onChange={(e) => setLayoutId(e.target.value)}
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-xs"
          >
            <option value="">Sem layout (só a legenda)</option>
            {READY_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={apply}
            className="interactive rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Aplicar no layout
          </button>
          <button
            type="button"
            onClick={() => {
              const item = saveCaptionTemplate(tpl);
              setSaved(listCaptionTemplates());
              setTpl(item);
              toast.success("Template de legenda salvo.");
            }}
            className="interactive inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-2 text-sm"
          >
            <Save className="size-4" /> Salvar
          </button>
        </div>

        {saved.length > 0 && (
          <div className="space-y-2">
            <p className="mono-label">Meus templates de legenda</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {saved.map((t) => (
                <div key={t.id} className="glass flex items-center gap-2 rounded-xl border border-border/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.blocks.length} blocos · {captionTemplateDuration(t).toFixed(1)}s
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTpl(t)}
                    className="interactive rounded-lg bg-primary/20 px-2 py-1 text-xs"
                  >
                    Carregar
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${t.name}`}
                    onClick={() => {
                      deleteCaptionTemplate(t.id);
                      setSaved(listCaptionTemplates());
                    }}
                    className="interactive rounded-lg border border-border/60 p-1.5 text-muted-foreground"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* prévia 9:16 */}
      <div className="space-y-2">
        <div
          className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-border/60 bg-[#0b0b10]"
          style={{ aspectRatio: "9 / 16", containerType: "inline-size" }}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-primary/60" style={{ width: `${(time / total) * 100}%` }} />
          {current && (
            <div
              key={current.id}
              className="pop-in absolute inset-x-[8%] text-center"
              style={{ top: `${s.y}%`, transform: "translateY(-50%)" }}
            >
              <span
                className="inline-block"
                style={{
                  fontFamily: s.fontFamily,
                  fontWeight: s.fontWeight,
                  fontSize: `${(s.fontSize / 1080) * 100}cqw`,
                  lineHeight: 1.15,
                  color: s.color,
                  background: s.background ?? "transparent",
                  padding: s.background ? `${(s.padding / 1080) * 60}cqw ${(s.padding / 1080) * 120}cqw` : 0,
                  borderRadius: `${(s.radius / 1080) * 100}cqw`,
                  textTransform: s.uppercase ? "uppercase" : "none",
                  textShadow: "0 2px 8px rgba(0,0,0,.55)",
                }}
              >
                {current.text}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="interactive inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-xs"
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {playing ? "Pausar" : "Tocar"}
          </button>
          <span className="text-xs text-muted-foreground">
            {time.toFixed(1)}s / {total.toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}
