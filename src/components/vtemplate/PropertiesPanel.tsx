/** Painel de propriedades da camada selecionada + filtros e animações. */
import { Button, Input } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import {
  ANIMATION_CATEGORIES,
  ANIMATION_PRESETS,
  CAPTION_STYLE_PRESETS,
  FILTER_CATEGORIES,
  FILTER_PRESETS,
} from "@/lib/video-template/factory";
import { BINDING_LABELS, NEUTRAL_FILTER, type BindingType, type FilterValues, type TemplateLayer } from "@/lib/video-template/types";
import { useState } from "react";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Label className="w-24 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

function Num({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <>
      <input
        type="range"
        value={value}
        min={min ?? 0}
        max={max ?? 100}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1"
      />
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-20 text-xs"
      />
    </>
  );
}

const BINDINGS: BindingType[] = [
  "STATIC",
  "MAIN_VIDEO",
  "CUT_VIDEO",
  "CUT_COVER",
  "THUMBNAIL",
  "TITLE",
  "CAPTIONS",
  "USER_LOGO",
  "BRAND_LOGO",
  "USER_MEDIA",
];

export function PropertiesPanel({
  layer,
  onUpdate,
}: {
  layer: TemplateLayer | null;
  onUpdate: (patch: Partial<TemplateLayer>) => void;
}) {
  const [filterCat, setFilterCat] = useState("Todos");
  const [animCat, setAnimCat] = useState("Todas");

  if (!layer) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">Selecione uma camada para editar as propriedades.</p>;
  }

  const f: FilterValues = { ...NEUTRAL_FILTER, ...(layer.filter ?? {}) };
  const setF = (patch: Partial<FilterValues>) => onUpdate({ filter: { ...f, ...patch } } as Partial<TemplateLayer>);

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <section>
        <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Camada</h4>
        <Row label="Nome">
          <Input value={layer.name} onChange={(e) => onUpdate({ name: e.target.value })} className="h-8 text-xs" />
        </Row>
        <Row label="Conteúdo">
          <select
            aria-label="Origem do conteúdo"
            value={layer.bindingType}
            onChange={(e) => onUpdate({ bindingType: e.target.value as BindingType } as Partial<TemplateLayer>)}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
          >
            {BINDINGS.map((b) => (
              <option key={b} value={b}>
                {BINDING_LABELS[b]}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section>
        <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Posição e tamanho</h4>
        <Row label="X (%)"><Num value={layer.x} min={-50} max={150} step={0.5} onChange={(x) => onUpdate({ x })} /></Row>
        <Row label="Y (%)"><Num value={layer.y} min={-50} max={150} step={0.5} onChange={(y) => onUpdate({ y })} /></Row>
        <Row label="Largura"><Num value={layer.width} min={1} max={150} step={0.5} onChange={(width) => onUpdate({ width })} /></Row>
        <Row label="Altura"><Num value={layer.height} min={1} max={150} step={0.5} onChange={(height) => onUpdate({ height })} /></Row>
        <Row label="Rotação"><Num value={layer.rotation} min={-180} max={180} onChange={(rotation) => onUpdate({ rotation })} /></Row>
        <Row label="Opacidade"><Num value={layer.opacity} min={0} max={1} step={0.05} onChange={(opacity) => onUpdate({ opacity })} /></Row>
        <Row label="Espelhar">
          <Button size="sm" variant={layer.flipX ? "default" : "outline"} onClick={() => onUpdate({ flipX: !layer.flipX })}>
            Horizontal
          </Button>
          <Button size="sm" variant={layer.flipY ? "default" : "outline"} onClick={() => onUpdate({ flipY: !layer.flipY })}>
            Vertical
          </Button>
        </Row>
      </section>

      {layer.type === "text" && (
        <section>
          <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Texto</h4>
          <Row label="Conteúdo">
            <textarea
              aria-label="Conteúdo do texto"
              value={layer.text}
              onChange={(e) => onUpdate({ text: e.target.value } as Partial<TemplateLayer>)}
              className="min-h-16 w-full rounded-md border border-border bg-background p-2 text-xs"
            />
          </Row>
          <Row label="Fonte">
            <select
              aria-label="Fonte"
              value={layer.fontFamily}
              onChange={(e) => onUpdate({ fontFamily: e.target.value } as Partial<TemplateLayer>)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            >
              {["Outfit, sans-serif", "Figtree, sans-serif", "JetBrains Mono, monospace", "Instrument Serif, serif", "Impact, sans-serif"].map((ff) => (
                <option key={ff} value={ff}>{ff.split(",")[0]}</option>
              ))}
            </select>
          </Row>
          <Row label="Tamanho"><Num value={layer.fontSize} min={16} max={200} onChange={(fontSize) => onUpdate({ fontSize } as Partial<TemplateLayer>)} /></Row>
          <Row label="Peso"><Num value={layer.fontWeight} min={100} max={900} step={100} onChange={(fontWeight) => onUpdate({ fontWeight } as Partial<TemplateLayer>)} /></Row>
          <Row label="Cor">
            <input type="color" aria-label="Cor do texto" value={layer.color} onChange={(e) => onUpdate({ color: e.target.value } as Partial<TemplateLayer>)} className="h-8 w-12 rounded" />
            <Button size="sm" variant={layer.uppercase ? "default" : "outline"} onClick={() => onUpdate({ uppercase: !layer.uppercase } as Partial<TemplateLayer>)}>AA</Button>
            <Button size="sm" variant={layer.shadow ? "default" : "outline"} onClick={() => onUpdate({ shadow: !layer.shadow } as Partial<TemplateLayer>)}>Sombra</Button>
          </Row>
          <Row label="Contorno">
            <input type="color" aria-label="Cor do contorno" value={layer.strokeColor} onChange={(e) => onUpdate({ strokeColor: e.target.value } as Partial<TemplateLayer>)} className="h-8 w-12 rounded" />
            <Num value={layer.strokeWidth} min={0} max={30} onChange={(strokeWidth) => onUpdate({ strokeWidth } as Partial<TemplateLayer>)} />
          </Row>
          <Row label="Alinhar">
            {(["left", "center", "right"] as const).map((a) => (
              <Button key={a} size="sm" variant={layer.align === a ? "default" : "outline"} onClick={() => onUpdate({ align: a } as Partial<TemplateLayer>)}>
                {a === "left" ? "Esq." : a === "center" ? "Centro" : "Dir."}
              </Button>
            ))}
          </Row>
        </section>
      )}

      {(layer.type === "image" || layer.type === "video") && (
        <section>
          <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Mídia</h4>
          <Row label="URL">
            <Input
              value={layer.src ?? ""}
              placeholder="https://..."
              onChange={(e) => onUpdate({ src: e.target.value || null } as Partial<TemplateLayer>)}
              className="h-8 text-xs"
            />
          </Row>
          <Row label="Ajuste">
            {(["cover", "contain", "fill"] as const).map((fit) => (
              <Button key={fit} size="sm" variant={layer.fit === fit ? "default" : "outline"} onClick={() => onUpdate({ fit } as Partial<TemplateLayer>)}>
                {fit}
              </Button>
            ))}
          </Row>
          <Row label="Cantos"><Num value={layer.radius} min={0} max={200} onChange={(radius) => onUpdate({ radius } as Partial<TemplateLayer>)} /></Row>
          {layer.type === "video" && (
            <>
              <Row label="Velocidade"><Num value={layer.speed} min={0.25} max={4} step={0.05} onChange={(speed) => onUpdate({ speed } as Partial<TemplateLayer>)} /></Row>
              <Row label="Volume"><Num value={layer.volume} min={0} max={1} step={0.05} onChange={(volume) => onUpdate({ volume } as Partial<TemplateLayer>)} /></Row>
              <Row label="Máscara">
                {(["none", "circle", "rounded"] as const).map((m) => (
                  <Button key={m} size="sm" variant={layer.mask === m ? "default" : "outline"} onClick={() => onUpdate({ mask: m } as Partial<TemplateLayer>)}>
                    {m}
                  </Button>
                ))}
              </Row>
            </>
          )}
        </section>
      )}

      {layer.type === "shape" && (
        <section>
          <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Forma</h4>
          <Row label="Tipo">
            {(["rect", "rounded", "circle", "line"] as const).map((s) => (
              <Button key={s} size="sm" variant={layer.shape === s ? "default" : "outline"} onClick={() => onUpdate({ shape: s } as Partial<TemplateLayer>)}>
                {s}
              </Button>
            ))}
          </Row>
          <Row label="Preenchim.">
            <input type="color" aria-label="Cor de preenchimento" value={layer.fill} onChange={(e) => onUpdate({ fill: e.target.value } as Partial<TemplateLayer>)} className="h-8 w-12 rounded" />
          </Row>
          <Row label="Cantos"><Num value={layer.radius} min={0} max={200} onChange={(radius) => onUpdate({ radius } as Partial<TemplateLayer>)} /></Row>
        </section>
      )}

      {layer.type === "caption" && (
        <section>
          <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Estilo da legenda</h4>
          <div className="grid grid-cols-2 gap-1.5">
            {CAPTION_STYLE_PRESETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={layer.presetId === p.id ? "default" : "outline"}
                onClick={() => onUpdate({ presetId: p.id, style: { ...layer.style, ...p.style } } as Partial<TemplateLayer>)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Row label="Palavras"><Num value={layer.style.maxWords} min={1} max={10} onChange={(maxWords) => onUpdate({ style: { ...layer.style, maxWords } } as Partial<TemplateLayer>)} /></Row>
          <Row label="Destaque">
            <input
              type="color"
              aria-label="Cor de destaque"
              value={layer.style.highlightColor}
              onChange={(e) => onUpdate({ style: { ...layer.style, highlightColor: e.target.value } } as Partial<TemplateLayer>)}
              className="h-8 w-12 rounded"
            />
          </Row>
        </section>
      )}

      <section>
        <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Filtros</h4>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {FILTER_CATEGORIES.map((c) => (
            <Button key={c} size="sm" variant={filterCat === c ? "default" : "ghost"} onClick={() => setFilterCat(c)}>
              {c}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {FILTER_PRESETS.filter((p) => filterCat === "Todos" || p.category === filterCat || p.id === "none").map((p) => (
            <Button key={p.id} size="sm" variant="outline" onClick={() => onUpdate({ filter: p.values } as Partial<TemplateLayer>)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Row label="Brilho"><Num value={f.brightness} min={0.2} max={2} step={0.01} onChange={(brightness) => setF({ brightness })} /></Row>
        <Row label="Contraste"><Num value={f.contrast} min={0.2} max={2} step={0.01} onChange={(contrast) => setF({ contrast })} /></Row>
        <Row label="Saturação"><Num value={f.saturation} min={0} max={2} step={0.01} onChange={(saturation) => setF({ saturation })} /></Row>
        <Row label="Temperatura"><Num value={f.temperature} min={-50} max={50} onChange={(temperature) => setF({ temperature })} /></Row>
      </section>

      <section>
        <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Animação de entrada</h4>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {ANIMATION_CATEGORIES.map((c) => (
            <Button key={c} size="sm" variant={animCat === c ? "default" : "ghost"} onClick={() => setAnimCat(c)}>
              {c}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant={layer.animationIn ? "outline" : "default"} onClick={() => onUpdate({ animationIn: null })}>
            Nenhuma
          </Button>
          {ANIMATION_PRESETS.filter((a) => animCat === "Todas" || a.category === animCat).map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={layer.animationIn?.type === a.type ? "default" : "outline"}
              onClick={() => onUpdate({ animationIn: { type: a.type, duration: 0.5, delay: 0, easing: "easeOut" } })}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {layer.animationIn && (
          <>
            <Row label="Duração"><Num value={layer.animationIn.duration} min={0.1} max={3} step={0.05} onChange={(duration) => onUpdate({ animationIn: { ...layer.animationIn!, duration } })} /></Row>
            <Row label="Atraso"><Num value={layer.animationIn.delay} min={0} max={5} step={0.05} onChange={(delay) => onUpdate({ animationIn: { ...layer.animationIn!, delay } })} /></Row>
          </>
        )}
      </section>

      <section>
        <h4 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Tempo</h4>
        <Row label="Início (s)"><Num value={layer.startTime} min={0} max={120} step={0.1} onChange={(startTime) => onUpdate({ startTime })} /></Row>
        <Row label="Fim (s)">
          <Input
            type="number"
            value={layer.endTime ?? ""}
            placeholder="até o fim"
            onChange={(e) => onUpdate({ endTime: e.target.value === "" ? null : Number(e.target.value) })}
            className="h-8 text-xs"
          />
        </Row>
      </section>
    </div>
  );
}
