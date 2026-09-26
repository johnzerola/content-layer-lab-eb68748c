import { useState } from "react";
import { Check, Loader2, Play, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VOICE_PRESETS, voiceDisplayLabel, type VoicePreset } from "@/lib/chatscene/voice";

interface Props {
  name: string;
  selected?: string | undefined;
  previewing: boolean;
  unavailable: (voice: VoicePreset) => boolean;
  onChoose: (id: string) => void;
  onPreview: (id: string) => void;
}

const ages = {
  juvenil: "Criança sintética",
  teen: "Adolescente",
  adulta: "Adulto",
  madura: "Maduro / idoso",
};

export function VoiceCatalog({
  name,
  selected,
  previewing,
  unavailable,
  onChoose,
  onPreview,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [collection, setCollection] = useState("");
  const voices = VOICE_PRESETS.filter(
    (v) =>
      (!gender || v.gender === gender) &&
      (!age || v.age === age) &&
      (!collection || v.group === collection) &&
      `${v.label} ${v.description} ${v.group}`
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
          <Search className="size-4" />
          Explorar catálogo de vozes
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden rounded-xl bg-card p-4 sm:p-6 motion-reduce:animate-none">
        <DialogTitle>Escolher voz de {name}</DialogTitle>
        <DialogDescription>
          Filtre, escute uma amostra e escolha. Os presets de atuação podem compartilhar a mesma
          voz-base; o catálogo PT-BR contém identidades sintéticas próprias.
        </DialogDescription>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
          <Search className="size-4" />
          <input
            autoFocus
            aria-label="Buscar vozes"
            placeholder="Buscar nome, narração, terror…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            aria-label="Filtrar gênero da voz"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
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
            onChange={(e) => setAge(e.target.value)}
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
            onChange={(e) => setCollection(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">Todas as coleções</option>
            {Array.from(new Set(VOICE_PRESETS.map((v) => v.group))).map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {voices.length} opções encontradas. A pré-escuta gera uma amostra e pode consumir créditos
          do provedor.
        </p>
        <div className="grid min-h-0 max-h-[48dvh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((v) => {
            const disabled = unavailable(v);
            return (
              <article
                key={v.id}
                className={`flex flex-col rounded-xl border p-4 ${selected === v.id ? "border-primary bg-primary/10" : "border-border bg-background/30"}`}
              >
                <h3 className="text-sm font-semibold">{voiceDisplayLabel(v)}</h3>
                <p className="mt-2 text-xs text-primary">
                  {ages[v.age]} · {v.gender}
                </p>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {v.description}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {disabled ? "Indisponível no servidor" : v.group}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={disabled || previewing}
                    aria-label={`Ouvir ${v.label}`}
                    onClick={() => onPreview(v.id)}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-secondary disabled:opacity-40"
                  >
                    {previewing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    Ouvir
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChoose(v.id);
                      setOpen(false);
                    }}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    {selected === v.id && <Check className="size-3" />}
                    {selected === v.id ? "Selecionada" : "Usar voz"}
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
