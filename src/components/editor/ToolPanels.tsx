/**
 * Painéis contextuais migrados do estúdio de edição para o editor profissional.
 * Toda a lógica de vídeo continua em `preedit.ts` / `looks.ts` — aqui só a UI.
 */
import { CROP_PRESETS, LAYOUTS, cropForRatio, defaultPreEdit, type PreEdit } from "@/lib/preedit";
import { LOOKS, applyLook, lookPreviewFilter } from "@/lib/looks";

export type ToolPatch = (patch: Partial<PreEdit>, label?: string) => void;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 py-1 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </label>
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  format,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (n: number) => string;
}) {
  return (
    <>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1"
      />
      <span className="w-12 text-right font-mono text-[11px]">{format ? format(value) : value.toFixed(2)}</span>
    </>
  );
}

/** CORTE — janela de tempo do clipe e remoção de pausas. */
export function CutPanel({
  preedit,
  onChange,
  duration,
  currentTime,
  onSeek,
  silenceCount,
  onCutSilences,
}: {
  preedit: PreEdit;
  onChange: ToolPatch;
  duration: number;
  currentTime: number;
  onSeek: (t: number) => void;
  silenceCount: number;
  onCutSilences: () => void;
}) {
  const seg = preedit.segments[0] ?? { start: 0, end: duration };
  const setSeg = (s: number, e: number) =>
    onChange({ segments: [{ start: Math.max(0, Math.min(s, e - 0.2)), end: Math.min(duration, Math.max(e, s + 0.2)) }] }, "corte");

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setSeg(currentTime, seg.end)} className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs">
          Início aqui
        </button>
        <button type="button" onClick={() => setSeg(seg.start, currentTime)} className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs">
          Fim aqui
        </button>
        <button type="button" onClick={() => onSeek(seg.start)} className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs">
          Ir ao início
        </button>
        <button type="button" onClick={() => onSeek(Math.max(0, seg.end - 0.1))} className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs">
          Ir ao fim
        </button>
      </div>
      <Row label="Início">
        <Slider value={seg.start} onChange={(v) => setSeg(v, seg.end)} min={0} max={Math.max(1, duration)} step={0.05} format={(n) => `${n.toFixed(1)}s`} />
      </Row>
      <Row label="Fim">
        <Slider value={seg.end} onChange={(v) => setSeg(seg.start, v)} min={0} max={Math.max(1, duration)} step={0.05} format={(n) => `${n.toFixed(1)}s`} />
      </Row>
      <div className="rounded-xl border border-border/60 p-2.5">
        <p className="text-xs font-medium">Cortar pausas</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {silenceCount ? `${silenceCount} pausas detectadas na fala.` : "Nenhuma pausa longa detectada."}
        </p>
        <button
          type="button"
          onClick={onCutSilences}
          disabled={!silenceCount}
          className="mt-2 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Remover pausas
        </button>
      </div>
      <button
        type="button"
        onClick={() => onChange({ segments: [] }, "reset-corte")}
        className="text-xs text-muted-foreground underline"
      >
        Restaurar clipe inteiro
      </button>
    </div>
  );
}

/** ENQUADRAR — proporção do recorte, giro e espelho. */
export function FramePanel({
  preedit,
  onChange,
  srcW,
  srcH,
}: {
  preedit: PreEdit;
  onChange: ToolPatch;
  srcW: number;
  srcH: number;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-mono text-[11px] uppercase text-muted-foreground">Recorte</p>
      <div className="grid grid-cols-3 gap-1.5">
        {CROP_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange({ crop: p.ratio ? cropForRatio(p.ratio, srcW, srcH) : null }, "enquadrar")}
            className="rounded-lg border border-border/60 px-2 py-1.5 text-xs hover:border-primary/60"
          >
            {p.label}
          </button>
        ))}
      </div>
      <Row label="Girar">
        <div className="flex gap-1.5">
          {([0, 90, 180, 270] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ rotate: r }, "girar")}
              className={`rounded-lg border px-2 py-1 text-xs ${preedit.rotate === r ? "border-primary bg-primary/20" : "border-border/60"}`}
            >
              {r}°
            </button>
          ))}
        </div>
      </Row>
      <Row label="Espelhar">
        <button
          type="button"
          onClick={() => onChange({ flipH: !preedit.flipH }, "flip-h")}
          className={`rounded-lg border px-2 py-1 text-xs ${preedit.flipH ? "border-primary bg-primary/20" : "border-border/60"}`}
        >
          Horizontal
        </button>
        <button
          type="button"
          onClick={() => onChange({ flipV: !preedit.flipV }, "flip-v")}
          className={`rounded-lg border px-2 py-1 text-xs ${preedit.flipV ? "border-primary bg-primary/20" : "border-border/60"}`}
        >
          Vertical
        </button>
      </Row>
    </div>
  );
}

/** LAYOUT — composição do quadro vertical e fundo. */
export function LayoutPanel({ preedit, onChange }: { preedit: PreEdit; onChange: ToolPatch }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-1.5">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onChange({ layout: l.id }, "layout")}
            className={`rounded-xl border px-2.5 py-2 text-left ${
              preedit.layout === l.id ? "border-primary bg-primary/10" : "border-border/60"
            }`}
          >
            <span className="text-xs font-medium">{l.label}</span>
            <span className="block text-[11px] text-muted-foreground">{l.hint}</span>
          </button>
        ))}
      </div>
      <Row label="Fundo">
        <select
          value={preedit.bgMode}
          onChange={(e) => onChange({ bgMode: e.target.value as PreEdit["bgMode"] }, "bg")}
          className="rounded-md border border-border/60 bg-card/60 px-2 py-1 text-xs"
        >
          <option value="blur">Desfoque do vídeo</option>
          <option value="color">Cor sólida</option>
        </select>
      </Row>
      {preedit.bgMode === "blur" ? (
        <Row label="Desfoque">
          <Slider value={preedit.bgBlur} onChange={(v) => onChange({ bgBlur: v }, "bg-blur")} min={0} max={2} step={0.05} />
        </Row>
      ) : (
        <Row label="Cor">
          <input
            type="color"
            value={preedit.bgColor}
            onChange={(e) => onChange({ bgColor: e.target.value }, "bg-color")}
            className="h-8 w-10 rounded border border-border/60 bg-transparent"
            aria-label="Cor de fundo"
          />
        </Row>
      )}
    </div>
  );
}

/** AJUSTES — estilos de edição prontos + controles finos de cor. */
export function GradePanel({
  preedit,
  onChange,
  onPreviewLook,
}: {
  preedit: PreEdit;
  onChange: ToolPatch;
  onPreviewLook?: (patch: Partial<PreEdit> | null) => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-mono text-[11px] uppercase text-muted-foreground">Estilos de edição</p>
      <div className="grid grid-cols-3 gap-1.5">
        {LOOKS.map((l) => (
          <button
            key={l.id}
            type="button"
            onPointerEnter={() => onPreviewLook?.(applyLook(l.id))}
            onPointerLeave={() => onPreviewLook?.(null)}
            onFocus={() => onPreviewLook?.(applyLook(l.id))}
            onBlur={() => onPreviewLook?.(null)}
            onClick={() => {
              onPreviewLook?.(null);
              onChange({ ...applyLook(l.id), look: l.id }, "look");
            }}
            title={l.hint}
            className={`overflow-hidden rounded-lg border text-left ${
              preedit.look === l.id ? "border-primary" : "border-border/60"
            }`}
          >
            <span
              className="block h-8 w-full"
              style={{
                background: `linear-gradient(135deg, ${l.swatch[0]}, ${l.swatch[1]})`,
                filter: lookPreviewFilter(l),
              }}
            />
            <span className="block px-1.5 py-1 text-[10px]">{l.label}</span>
          </button>
        ))}
      </div>
      <Row label="Brilho">
        <Slider value={preedit.brightness} onChange={(v) => onChange({ brightness: v }, "brilho")} min={0.5} max={1.6} />
      </Row>
      <Row label="Contraste">
        <Slider value={preedit.contrast} onChange={(v) => onChange({ contrast: v }, "contraste")} min={0.5} max={1.8} />
      </Row>
      <Row label="Saturação">
        <Slider value={preedit.saturation} onChange={(v) => onChange({ saturation: v }, "saturacao")} min={0} max={2} />
      </Row>
      <Row label="Matiz">
        <Slider value={preedit.hue} onChange={(v) => onChange({ hue: v }, "matiz")} min={-180} max={180} step={1} format={(n) => `${n}°`} />
      </Row>
      <Row label="Temperatura">
        <Slider value={preedit.temp ?? 0} onChange={(v) => onChange({ temp: v }, "temp")} min={-1} max={1} />
      </Row>
      <Row label="Vinheta">
        <Slider value={preedit.vignette ?? 0} onChange={(v) => onChange({ vignette: v }, "vinheta")} min={0} max={1} />
      </Row>
      <Row label="Granulado">
        <Slider value={preedit.grain ?? 0} onChange={(v) => onChange({ grain: v }, "grain")} min={0} max={1} />
      </Row>
      <Row label="Desfoque">
        <Slider value={preedit.blur} onChange={(v) => onChange({ blur: v }, "blur")} min={0} max={8} step={0.1} format={(n) => `${n.toFixed(1)}px`} />
      </Row>
      <button
        type="button"
        onClick={() => onChange(defaultPreEdit(), "reset-ajustes")}
        className="text-xs text-muted-foreground underline"
      >
        Restaurar ajustes
      </button>
    </div>
  );
}

/** TÍTULOS — hook, título e CTA usados pelas variáveis do template. */
export function TitlesPanel({
  title,
  hook,
  cta,
  onChange,
}: {
  title: string;
  hook: string;
  cta: string;
  onChange: (patch: { title?: string; hook?: string; cta?: string }, label?: string) => void;
}) {
  return (
    <div className="space-y-2.5 text-sm">
      <label className="block text-xs">
        <span className="text-muted-foreground">Título {"{{title}}"}</span>
        <input
          value={title}
          onChange={(e) => onChange({ title: e.target.value }, "titulo")}
          className="mt-1 w-full rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs">
        <span className="text-muted-foreground">Hook {"{{hook}}"}</span>
        <textarea
          value={hook}
          rows={2}
          onChange={(e) => onChange({ hook: e.target.value }, "hook")}
          className="mt-1 w-full rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs">
        <span className="text-muted-foreground">CTA {"{{cta}}"}</span>
        <input
          value={cta}
          onChange={(e) => onChange({ cta: e.target.value }, "cta")}
          className="mt-1 w-full rounded-lg border border-border/60 bg-card/60 px-2 py-1.5 text-sm"
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        Essas variáveis são substituídas automaticamente nas camadas de texto do template.
      </p>
    </div>
  );
}
