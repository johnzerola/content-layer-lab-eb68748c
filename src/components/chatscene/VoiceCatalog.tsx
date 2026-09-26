import { useState } from "react";
import { Check, Library, Loader2, Mic2, Play, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VOICE_PRESETS, voiceDisplayLabel, type VoicePreset } from "@/lib/chatscene/voice";
import type { SavedVoiceReference } from "@/lib/chatscene/voice.functions";

interface Props {
  name: string;
  selected?: string | undefined;
  selectedReferenceId?: string | undefined;
  previewing: string | null;
  references: SavedVoiceReference[];
  referencesLoading: boolean;
  referencesError?: string | null;
  unavailable: (voice: VoicePreset) => boolean;
  onChoose: (id: string) => void;
  onPreview: (id: string, previewId: string) => void;
  onChooseReference: (reference: SavedVoiceReference) => void;
  onPreviewReference: (reference: SavedVoiceReference, previewId: string) => void;
  onManageReferences: () => void;
}

const ages = {
  juvenil: "Criança sintética",
  teen: "Adolescente",
  adulta: "Adulto",
  madura: "Maduro / idoso",
};

export function VoiceCatalog(props: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [collection, setCollection] = useState("");
  const voices = VOICE_PRESETS.filter(
    (voice) =>
      (!gender || voice.gender === gender) &&
      (!age || voice.age === age) &&
      (!collection || voice.group === collection) &&
      `${voice.label} ${voice.description} ${voice.group}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 text-xs font-semibold hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4" aria-hidden /> Explorar catálogo e minhas vozes
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden rounded-xl bg-card p-4 sm:p-6 motion-reduce:animate-none">
        <DialogTitle>Escolher voz de {props.name}</DialogTitle>
        <DialogDescription>
          Escolha primeiro entre suas vozes privadas ou explore o catálogo sintético PT-BR.
        </DialogDescription>

        <section
          className="rounded-xl border border-primary/25 bg-primary/5 p-3"
          aria-labelledby="private-voices-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3
                id="private-voices-title"
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <Library className="size-4 text-primary" aria-hidden /> Minhas vozes clonadas
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Privadas desta conta e reutilizáveis em qualquer personagem.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                props.onManageReferences();
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-3.5" aria-hidden /> Gerenciar vozes
            </button>
          </div>

          {props.referencesLoading ? (
            <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />{" "}
              Carregando suas vozes…
            </p>
          ) : props.references.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {props.references.map((reference) => {
                const previewId = `reference-${reference.id}`;
                const isPreviewing = props.previewing === previewId;
                const isSelected = props.selectedReferenceId === reference.id;
                return (
                  <article
                    key={reference.id}
                    className={`rounded-lg border p-3 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-background/70"}`}
                  >
                    <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
                      <Mic2 className="size-3.5 shrink-0 text-primary" aria-hidden />
                      {reference.name}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Amostra de {reference.durationSec.toFixed(1)} s
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={props.previewing !== null}
                        onClick={() => props.onPreviewReference(reference, previewId)}
                        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
                      >
                        {isPreviewing ? (
                          <Loader2
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                        ) : (
                          <Play className="size-4" aria-hidden />
                        )}{" "}
                        Ouvir
                      </button>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          props.onChooseReference(reference);
                          setOpen(false);
                        }}
                        className="min-h-10 flex-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isSelected ? "Selecionada" : "Usar voz"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border bg-background/50 p-3">
              <p className="text-xs font-medium">Nenhuma voz clonada disponível nesta conta.</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {props.referencesError ??
                  "Abra Gerenciar vozes para enviar ou recuperar uma amostra autorizada."}
              </p>
            </div>
          )}
        </section>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="h-px flex-1 bg-border" />
          <span>Catálogo sintético PT-BR</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
          <Search className="size-4" aria-hidden />
          <input
            autoFocus
            aria-label="Buscar vozes"
            placeholder="Buscar nome, narração, terror…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            aria-label="Filtrar gênero da voz"
            value={gender}
            onChange={(event) => setGender(event.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Todos os gêneros</option>
            <option value="feminina">Feminina</option>
            <option value="masculina">Masculina</option>
            <option value="neutra">Neutra</option>
          </select>
          <select
            aria-label="Filtrar idade da voz"
            value={age}
            onChange={(event) => setAge(event.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Todas as idades</option>
            {Object.entries(ages).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar coleção de vozes"
            value={collection}
            onChange={(event) => setCollection(event.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Todas as coleções</option>
            {Array.from(new Set(VOICE_PRESETS.map((voice) => voice.group))).map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {voices.length} opções encontradas. A primeira prévia pode demorar; as seguintes ficam em
          cache neste navegador.
        </p>
        <div className="grid min-h-0 max-h-[42dvh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((voice) => {
            const disabled = props.unavailable(voice);
            const previewId = `catalog-${voice.id}`;
            const isPreviewing = props.previewing === previewId;
            return (
              <article
                key={voice.id}
                className={`flex flex-col rounded-xl border p-4 ${props.selected === voice.id ? "border-primary bg-primary/10" : "border-border bg-background/30"}`}
              >
                <h3 className="text-sm font-semibold">{voiceDisplayLabel(voice)}</h3>
                <p className="mt-2 text-xs text-primary">
                  {ages[voice.age]} · {voice.gender}
                </p>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {voice.description}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {disabled ? "Indisponível no servidor" : voice.group}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={disabled || props.previewing !== null}
                    aria-label={`Ouvir ${voice.label}`}
                    onClick={() => props.onPreview(voice.id, previewId)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  >
                    {isPreviewing ? (
                      <Loader2
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      <Play className="size-4" aria-hidden />
                    )}{" "}
                    Ouvir
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={props.selected === voice.id}
                    onClick={() => {
                      props.onChoose(voice.id);
                      setOpen(false);
                    }}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  >
                    {props.selected === voice.id && <Check className="size-3" aria-hidden />}
                    {props.selected === voice.id ? "Selecionada" : "Usar voz"}
                  </button>
                </div>
              </article>
            );
          })}
          {!voices.length && (
            <p className="p-4 text-sm text-muted-foreground sm:col-span-2">
              Nenhuma voz com esses filtros. Tente outra busca.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
