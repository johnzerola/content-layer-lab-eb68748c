/** Brand Kit: logo, cores e tipografia aplicáveis às camadas do template. */
import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import { BRAND_FONTS, extractBrandFromLogo, loadBrandKit, saveBrandKit, type BrandKit } from "@/lib/brand-kit";
import type { TemplateDoc, TemplateLayer } from "@/lib/video-template/types";

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Label className="w-24 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-8 w-10 cursor-pointer rounded border border-border/70 bg-transparent"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 flex-1 text-xs" />
    </div>
  );
}

export function BrandKitPanel({
  doc,
  onUpdateLayer,
  onSelectLogoLayer,
  value,
  onChange,
}: {
  doc: TemplateDoc;
  onUpdateLayer: (id: string, patch: Partial<TemplateLayer>) => void;
  onSelectLogoLayer?: (src: string) => void;
  /** kit persistido no projeto (quando ausente, usa o kit local do navegador) */
  value?: BrandKit | undefined;
  onChange?: ((kit: BrandKit) => void) | undefined;
}) {
  const [local, setLocal] = useState<BrandKit>(() => value ?? loadBrandKit());
  const kit = value ?? local;
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveBrandKit(kit);
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(t);
  }, [kit]);

  const patch = (p: Partial<BrandKit>) => {
    const next = { ...kit, ...p };
    setLocal(next);
    onChange?.(next);
  };

  /** Gera paleta + tipografia a partir do logo, tudo no navegador. */
  const generateFromLogo = async (src: string) => {
    setGenError(null);
    setGenerating(true);
    try {
      const s = await extractBrandFromLogo(src);
      setPalette(s.palette);
      patch({
        primary: s.primary,
        secondary: s.secondary,
        text: s.text,
        background: s.background,
        headingFont: s.headingFont,
        bodyFont: s.bodyFont,
      });
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "não consegui analisar o logo");
    } finally {
      setGenerating(false);
    }
  };

  const pickLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      patch({ logoUrl: src });
      void generateFromLogo(src);
    };
    reader.readAsDataURL(file);
  };


  /** Aplica cores e fontes da marca em todas as camadas compatíveis. */
  const applyToLayers = () => {
    for (const layer of doc.layers) {
      if (layer.type === "text") {
        onUpdateLayer(layer.id, { fontFamily: kit.headingFont, color: kit.text } as Partial<TemplateLayer>);
      } else if (layer.type === "caption") {
        onUpdateLayer(layer.id, {
          style: { ...layer.style, fontFamily: kit.bodyFont, color: kit.text, highlightColor: kit.primary },
        } as Partial<TemplateLayer>);
      } else if (layer.type === "shape") {
        onUpdateLayer(layer.id, { fill: kit.primary, stroke: kit.secondary } as Partial<TemplateLayer>);
      } else if (
        layer.type === "image" &&
        kit.logoUrl &&
        (layer.bindingType === "USER_LOGO" || layer.bindingType === "BRAND_LOGO")
      ) {
        onUpdateLayer(layer.id, { src: kit.logoUrl } as Partial<TemplateLayer>);
      }
    }
  };

  return (
    <section className="space-y-3 border-t border-border/70 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand Kit</h3>
        {saved && <span className="font-mono text-[10px] text-muted-foreground">salvo</span>}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card/60">
          {kit.logoUrl ? (
            <img src={kit.logoUrl} alt="Logo da marca" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-muted-foreground">logo</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Button size="sm" variant="outline" className="h-7" onClick={() => fileRef.current?.click()}>
            Enviar logo
          </Button>
          {kit.logoUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => onSelectLogoLayer?.(kit.logoUrl as string)}
            >
              Inserir no template
            </Button>
          )}
          {kit.logoUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={generating}
              onClick={() => void generateFromLogo(kit.logoUrl as string)}
            >
              {generating ? "Analisando logo…" : "Gerar paleta do logo"}
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Arquivo do logo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickLogo(f);
            e.target.value = "";
          }}
        />
      </div>

      {genError && <p className="text-[11px] text-destructive">{genError}</p>}
      {palette.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Paleta extraída do logo</p>
          <div className="flex gap-1">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Usar ${c} como cor primária`}
                onClick={() => patch({ primary: c })}
                className="h-7 flex-1 rounded border border-border/60"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      <ColorRow label="Primária" value={kit.primary} onChange={(v) => patch({ primary: v })} />
      <ColorRow label="Secundária" value={kit.secondary} onChange={(v) => patch({ secondary: v })} />
      <ColorRow label="Texto" value={kit.text} onChange={(v) => patch({ text: v })} />
      <ColorRow label="Fundo" value={kit.background} onChange={(v) => patch({ background: v })} />

      <div className="flex items-center gap-2 py-1">
        <Label className="w-24 shrink-0 text-xs text-muted-foreground">Títulos</Label>
        <select
          value={kit.headingFont}
          onChange={(e) => patch({ headingFont: e.target.value })}
          aria-label="Fonte dos títulos"
          className="h-8 flex-1 rounded-md border border-border/70 bg-card/60 px-2 text-xs"
        >
          {BRAND_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 py-1">
        <Label className="w-24 shrink-0 text-xs text-muted-foreground">Corpo</Label>
        <select
          value={kit.bodyFont}
          onChange={(e) => patch({ bodyFont: e.target.value })}
          aria-label="Fonte do corpo"
          className="h-8 flex-1 rounded-md border border-border/70 bg-card/60 px-2 text-xs"
        >
          {BRAND_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <Button size="sm" className="w-full" onClick={applyToLayers}>
        Aplicar marca nas camadas
      </Button>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Aplica cores, fontes e logo automaticamente em textos, legendas, formas e camadas de logo.
      </p>
    </section>
  );
}
