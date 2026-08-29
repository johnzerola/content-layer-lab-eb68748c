import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ImagePlus,
  Loader2,
  MapPin,
  Settings2,
  ShieldCheck,
  Sliders,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { PhotoAdjustModal, type PhotoAdjustTarget } from "@/components/photo/PhotoAdjustModal";
import { PHOTO_FORMATS, PHOTO_PRESETS, type PhotoFormat } from "@/lib/photo/presets";
import {
  DEFAULT_ADJUST,
  DEFAULT_TEXT,
  PHOTO_FONTS,
  renderPhoto,
  type PhotoAdjust,
  type PhotoRenderOptions,
  type PhotoResult,
  type PhotoTextOverlay,
} from "@/lib/photo/render";
import { downloadAsZip, formatBytes } from "@/lib/zip";


interface PhotoItem {
  id: string;
  file: File;
  preview: string;
  adjust: PhotoAdjust;
}

interface OutputItem extends PhotoResult {
  id: string;
  sourceId: string;
  url: string;
}

const MAX_FILES = 400;
const MAX_BYTES = 40 * 1024 * 1024;

export function PhotoBatchStudio() {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [presetId, setPresetId] = useState("story");
  const [format, setFormat] = useState<PhotoFormat>("image/jpeg");
  const [intensity, setIntensity] = useState(0.6);
  const [allowMirror, setAllowMirror] = useState(false);
  const [variations, setVariations] = useState(1);
  const [metaEnabled, setMetaEnabled] = useState(true);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [artist, setArtist] = useState("");
  const [globalAdjust, setGlobalAdjust] = useState<PhotoAdjust>({ ...DEFAULT_ADJUST });
  const [text, setText] = useState<PhotoTextOverlay>({ ...DEFAULT_TEXT });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [adjustTarget, setAdjustTarget] = useState<PhotoAdjustTarget | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const accepted: PhotoItem[] = [];
    let rejected = 0;
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) {
        rejected += 1;
        continue;
      }
      if (file.size > MAX_BYTES) {
        rejected += 1;
        continue;
      }
      const preview = URL.createObjectURL(file);
      urlsRef.current.push(preview);
      accepted.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        preview,
        adjust: { ...DEFAULT_ADJUST },
      });
    }
    setItems((prev) => [...prev, ...accepted].slice(0, MAX_FILES));
    if (rejected) toast.warning(`${rejected} arquivo(s) ignorado(s): só imagens de até 40 MB.`);
  }, []);

  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  /** Combina a edição global com o ajuste individual de cada foto. */
  const mergeAdjust = useCallback(
    (adjust: PhotoAdjust): PhotoAdjust => ({
      rotate90: adjust.rotate90,
      brightness: globalAdjust.brightness * adjust.brightness,
      contrast: globalAdjust.contrast * adjust.contrast,
      saturation: globalAdjust.saturation * adjust.saturation,
      sharpness: Math.min(1, globalAdjust.sharpness + adjust.sharpness),
      zoom: globalAdjust.zoom * adjust.zoom,
    }),
    [globalAdjust],
  );

  const hasText = Boolean(text.headline?.trim() || text.cta?.trim());

  const options = useMemo<Omit<PhotoRenderOptions, "adjust">>(
    () => ({
      presetId,
      format,
      intensity,
      allowMirror,
      seed: "fotoviral",
      ...(hasText ? { text } : {}),
      metadata: {
        enabled: metaEnabled,
        artist: artist || undefined,
        days: 21,
        ...(gpsEnabled ? { gps: { lat: -23.55052, lon: -46.633308 } } : {}),
      },
    }),
    [presetId, format, intensity, allowMirror, hasText, text, metaEnabled, artist, gpsEnabled],
  );

  // prévia ao vivo da primeira foto (baixa resolução, com debounce)
  const first = items[0];
  useEffect(() => {
    if (!first) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    const timer = setTimeout(() => {
      renderPhoto(
        first.file,
        { ...options, maxSide: 640, adjust: mergeAdjust(first.adjust) },
        0,
      )
        .then((result) => {
          if (cancelled) return;
          url = URL.createObjectURL(result.blob);
          setPreviewUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return url;
          });
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [first, options, mergeAdjust]);


  const process = async () => {
    if (!items.length) {
      toast.error("Adicione pelo menos uma foto.");
      return;
    }
    setBusy(true);
    setProgress(0);
    outputs.forEach((out) => URL.revokeObjectURL(out.url));
    const produced: OutputItem[] = [];
    const total = items.length * variations;
    let done = 0;
    try {
      for (const item of items) {
        for (let v = 0; v < variations; v += 1) {
          const result = await renderPhoto(
            item.file,
            { ...options, adjust: mergeAdjust(item.adjust) },
            v,
          );

          const url = URL.createObjectURL(result.blob);
          urlsRef.current.push(url);
          produced.push({ ...result, id: `${item.id}-${v}`, sourceId: item.id, url });
          done += 1;
          setProgress(Math.round((done / total) * 100));
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      setOutputs(produced);
      toast.success(`${produced.length} imagem(ns) pronta(s) com metadados novos.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Falha ao processar as fotos.");
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = async () => {
    if (!outputs.length) return;
    await downloadAsZip(
      outputs.map((out) => ({ name: out.name, blob: out.blob })),
      "fotoviral.zip",
    );
  };

  const outputBytes = outputs.reduce((n, out) => n + out.blob.size, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-6 rounded-2xl border border-border bg-surface/60 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Settings2 className="size-4 text-primary" /> Saída
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {PHOTO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                className={`rounded-xl border p-2 text-left text-xs transition ${
                  presetId === preset.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span className="block font-semibold">{preset.label}</span>
                <span className="block text-[11px] opacity-70">{preset.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {PHOTO_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] ${
                  format === f.id
                    ? "border-primary bg-primary/10"
                    : "border-border text-muted-foreground"
                }`}
              >
                {f.ext.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Anti-duplicidade
          </h2>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Intensidade</span>
            <span className="tabular-nums">{Math.round(intensity * 100)}%</span>
          </div>
          <Slider
            value={[intensity]}
            min={0.1}
            max={1}
            step={0.05}
            onValueChange={([v]) => setIntensity(v ?? 0.6)}
          />
          <label className="flex items-center justify-between text-xs">
            <span>Permitir espelhar</span>
            <Switch checked={allowMirror} onCheckedChange={setAllowMirror} />
          </label>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Variações por foto</span>
            <span className="tabular-nums">{variations}</span>
          </div>
          <Slider
            value={[variations]}
            min={1}
            max={5}
            step={1}
            onValueChange={([v]) => setVariations(v ?? 1)}
          />
        </div>

        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Wand2 className="size-4 text-primary" /> Metadados novos
          </h2>
          <label className="flex items-center justify-between text-xs">
            <span>Gravar EXIF novo</span>
            <Switch checked={metaEnabled} onCheckedChange={setMetaEnabled} />
          </label>
          <label className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" /> GPS aproximado
            </span>
            <Switch checked={gpsEnabled} onCheckedChange={setGpsEnabled} disabled={!metaEnabled} />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="photo-artist" className="text-xs text-muted-foreground">
              Autor (opcional)
            </Label>
            <Input
              id="photo-artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Seu nome ou marca"
              disabled={!metaEnabled}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Os metadados originais (EXIF, GPS, câmera e software) são sempre descartados no
            reprocessamento. O EXIF gravado vale só para JPEG.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Sliders className="size-4 text-primary" /> Edição (todas as fotos)
          </h2>
          {(
            [
              ["Brilho", "brightness", 0.6, 1.5],
              ["Contraste", "contrast", 0.6, 1.5],
              ["Saturação", "saturation", 0.6, 1.8],
              ["Nitidez", "sharpness", 0, 1],
              ["Zoom (corta bordas)", "zoom", 1, 1.5],
            ] as const
          ).map(([label, key, min, max]) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <span className="tabular-nums">{Math.round(globalAdjust[key] * 100)}%</span>
              </div>
              <Slider
                value={[globalAdjust[key]]}
                min={min}
                max={max}
                step={0.01}
                onValueChange={([v]) =>
                  setGlobalAdjust((a) => ({ ...a, [key]: v ?? min }) as PhotoAdjust)
                }
              />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGlobalAdjust({ ...DEFAULT_ADJUST })}
            className="w-full"
          >
            Redefinir edição
          </Button>
        </div>


        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Type className="size-4 text-primary" /> Texto na imagem
          </h2>
          <Input
            value={text.headline ?? ""}
            onChange={(e) => setText((t) => ({ ...t, headline: e.target.value }))}
            placeholder="Frase principal"
          />
          <Input
            value={text.cta ?? ""}
            onChange={(e) => setText((t) => ({ ...t, cta: e.target.value }))}
            placeholder="Segunda linha / CTA"
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fonte</Label>
            <div className="grid grid-cols-2 gap-2">
              {PHOTO_FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => setText((t) => ({ ...t, fontFamily: font.id }))}
                  style={{ fontFamily: font.id }}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${
                    text.fontFamily === font.id
                      ? "border-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tamanho da letra</span>
            <span className="tabular-nums">{Math.round(text.fontScale * 1000) / 10}</span>
          </div>
          <Slider
            value={[text.fontScale]}
            min={0.025}
            max={0.13}
            step={0.005}
            onValueChange={([v]) => setText((t) => ({ ...t, fontScale: v ?? 0.055 }))}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Peso</span>
            <span className="tabular-nums">{text.weight}</span>
          </div>
          <Slider
            value={[text.weight]}
            min={400}
            max={900}
            step={100}
            onValueChange={([v]) => setText((t) => ({ ...t, weight: v ?? 700 }))}
          />
          <div className="grid grid-cols-3 gap-2">
            {(["top", "center", "bottom"] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setText((t) => ({ ...t, position: pos }))}
                className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                  text.position === pos
                    ? "border-primary bg-primary/10"
                    : "border-border text-muted-foreground"
                }`}
              >
                {pos === "top" ? "Topo" : pos === "center" ? "Centro" : "Base"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Cor</span>
              <input
                type="color"
                value={text.color}
                onChange={(e) => setText((t) => ({ ...t, color: e.target.value }))}
                className="size-7 cursor-pointer rounded border border-border bg-transparent"
                aria-label="Cor do texto"
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Caixa</span>
              <input
                type="color"
                value={text.background}
                onChange={(e) => setText((t) => ({ ...t, background: e.target.value }))}
                className="size-7 cursor-pointer rounded border border-border bg-transparent"
                aria-label="Cor da caixa"
              />
            </label>
          </div>
          <label className="flex items-center justify-between text-xs">
            <span>Fundo atrás do texto</span>
            <Switch
              checked={text.boxed}
              onCheckedChange={(v) => setText((t) => ({ ...t, boxed: v }))}
            />
          </label>
          <label className="flex items-center justify-between text-xs">
            <span>MAIÚSCULAS</span>
            <Switch
              checked={text.uppercase}
              onCheckedChange={(v) => setText((t) => ({ ...t, uppercase: v }))}
            />
          </label>
        </div>

      </aside>

      <section className="space-y-5">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center"
        >
          <ImagePlus className="mx-auto size-8 text-primary" />
          <p className="mt-3 text-sm font-medium">Arraste suas fotos aqui</p>
          <p className="text-xs text-muted-foreground">
            JPG, PNG ou WebP até 40 MB — até {MAX_FILES} arquivos por lote
          </p>
          <Button className="mt-4" variant="outline" onClick={() => inputRef.current?.click()}>
            Selecionar fotos
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {previewUrl && (
          <div className="space-y-3 rounded-2xl border border-border bg-surface/60 p-5">
            <div>
              <h2 className="font-display text-sm font-semibold">Prévia ao vivo</h2>
              <p className="text-xs text-muted-foreground">
                Como a primeira foto vai sair com a edição e o texto atuais.
              </p>
            </div>
            <img
              src={previewUrl}
              alt="Prévia da primeira foto processada"
              className="mx-auto max-h-[420px] rounded-xl border border-border object-contain"
            />
          </div>
        )}

        {items.length > 0 && (

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {items.length} foto(s) · {items.length * variations} saída(s)
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setItems([])} disabled={busy}>
                  Limpar
                </Button>
                <Button onClick={process} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  Processar lote
                </Button>
              </div>
            </div>
            {busy && <Progress value={progress} />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-xl border border-border bg-black/30"
                >
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1.5">
                    <button
                      type="button"
                      className="rounded px-1.5 py-1 text-[11px] hover:text-primary"
                      onClick={() =>
                        setAdjustTarget({
                          id: item.id,
                          name: item.file.name,
                          preview: item.preview,
                          adjust: item.adjust,
                        })
                      }
                    >
                      Ajustar
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${item.file.name}`}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {outputs.length > 0 && (
          <div className="space-y-3 rounded-2xl border border-border bg-surface/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold">Prontas para postar</h2>
                <p className="text-xs text-muted-foreground">
                  {outputs.length} arquivo(s) · {formatBytes(outputBytes)}
                </p>
              </div>
              <Button onClick={downloadAll} className="gap-2">
                <Download className="size-4" /> Baixar tudo
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {outputs.map((out) => (
                <a
                  key={out.id}
                  href={out.url}
                  download={out.name}
                  className="overflow-hidden rounded-xl border border-border bg-black/30"
                >
                  <img
                    src={out.url}
                    alt={out.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <span className="block truncate p-1.5 text-[11px] text-muted-foreground">
                    {out.name} · {out.width}×{out.height}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <PhotoAdjustModal
        target={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onApply={(id, adjust) =>
          setItems((prev) => prev.map((item) => (item.id === id ? { ...item, adjust } : item)))
        }
      />
    </div>
  );
}
