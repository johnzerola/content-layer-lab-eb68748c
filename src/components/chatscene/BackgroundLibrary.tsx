import { useState } from "react";
import { Check, Film, Search, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BACKGROUND_PRESETS,
  BACKGROUND_CATEGORY_LABELS,
  type ChatSceneBackground,
} from "@/lib/chatscene/types";

export function BackgroundLibrary({
  value,
  onChange,
  onUpload,
  busy,
}: {
  value?: ChatSceneBackground | undefined;
  onChange: (value: ChatSceneBackground) => void;
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState<string[]>([]);
  const selected = BACKGROUND_PRESETS.find(
    (b) =>
      b.value.kind === (value?.kind ?? "theme") &&
      b.value.videoUrl === value?.videoUrl &&
      b.value.imageUrl === value?.imageUrl &&
      b.value.color === value?.color,
  );
  const presets = BACKGROUND_PRESETS.filter(
    (b) =>
      (!category || b.category === category) &&
      b.label.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <div>
      <h2 className="text-sm font-semibold">Vídeo de fundo</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Escolha um fundo da biblioteca ou envie seu vídeo. Ele acompanha todos os chats da história.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-4 flex min-h-20 w-full items-center gap-4 rounded-xl border border-primary/50 bg-primary/5 p-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Film className="size-7 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-semibold">{selected?.label ?? "Meu fundo"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Abrir biblioteca de fundos
              </span>
            </span>
            <Search className="size-5" />
          </button>
        </DialogTrigger>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden rounded-xl bg-card p-4 sm:p-6 motion-reduce:animate-none">
          <DialogTitle>Escolher fundo do vídeo</DialogTitle>
          <DialogDescription>
            Os loops marcados “Original VaiViral” são criados para este projeto. Para outros
            arquivos, consulte a licença da origem.
          </DialogDescription>
          <div className="flex flex-wrap gap-2">
            <input
              aria-label="Buscar fundos"
              placeholder="Buscar fundo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <select
              aria-label="Categoria do fundo"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">Todas as categorias</option>
              {Object.entries(BACKGROUND_CATEGORY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-h-0 max-h-[60dvh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 p-5 text-sm focus-within:ring-2 focus-within:ring-ring">
              <Upload className="size-8 text-primary" />
              <span>{busy ? "Enviando…" : "Enviar meu vídeo"}</span>
              <input
                type="file"
                accept="video/*"
                disabled={busy}
                className="sr-only"
                aria-label="Enviar vídeo pela biblioteca"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUpload(file);
                    setOpen(false);
                  }
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {presets.map((b) => (
              <button
                type="button"
                key={b.id}
                disabled={failed.includes(b.id)}
                aria-pressed={selected?.id === b.id}
                onClick={() => {
                  onChange({ ...b.value });
                  setOpen(false);
                }}
                className={`overflow-hidden rounded-xl border text-left disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === b.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}`}
              >
                <span className="relative block aspect-video overflow-hidden bg-secondary">
                  {b.value.kind === "video" ? (
                    <video
                      src={b.value.videoUrl ?? undefined}
                      poster={
                        b.id.startsWith("original-")
                          ? `/chatscene/backgrounds/${b.id}.jpg`
                          : undefined
                      }
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                      onError={() =>
                        setFailed((prev) => (prev.includes(b.id) ? prev : [...prev, b.id]))
                      }
                    />
                  ) : b.value.kind === "image" ? (
                    <img
                      src={b.value.imageUrl ?? undefined}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                      onError={() =>
                        setFailed((prev) => (prev.includes(b.id) ? prev : [...prev, b.id]))
                      }
                    />
                  ) : (
                    <span
                      className="grid size-full place-items-center text-sm text-muted-foreground"
                      style={{
                        background:
                          b.value.kind === "gradient"
                            ? `linear-gradient(135deg, ${b.value.color}, ${b.value.colorB})`
                            : (b.value.color ?? undefined),
                      }}
                    >
                      {b.value.kind === "theme" ? "Papel de parede do chat" : ""}
                    </span>
                  )}
                  {selected?.id === b.id && (
                    <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                      <Check className="size-4" />
                    </span>
                  )}
                </span>
                <span className="block p-3 text-sm font-semibold">
                  {b.label}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {failed.includes(b.id)
                      ? "Arquivo indisponível"
                      : b.id.startsWith("original-")
                        ? "Original VaiViral · uso liberado"
                        : b.value.kind === "video"
                          ? "Vídeo em loop"
                          : "Fundo da biblioteca"}
                  </span>
                </span>
              </button>
            ))}
            {!presets.length && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum fundo encontrado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
