import { Pause, Play, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/base";
import type { ElevenLabsVoice } from "@/lib/elevenlabs.server";

interface CatalogParticipant {
  id: string;
  name: string;
}

interface ElevenLabsVoiceCatalogProps {
  voices: ElevenLabsVoice[];
  participants: CatalogParticipant[];
  loaded: boolean;
  loading: boolean;
  onAssign: (participantId: string, voice: ElevenLabsVoice) => void;
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    premade: "Pronta",
    cloned: "Clonada",
    generated: "Criada",
    professional: "Profissional",
    voice: "Outra",
  };
  return labels[category] ?? category;
}

export function ElevenLabsVoiceCatalog({
  voices,
  participants,
  loaded,
  loading,
  onAssign,
}: ElevenLabsVoiceCatalogProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [targetId, setTargetId] = useState(participants[0]?.id ?? "");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!participants.some((participant) => participant.id === targetId)) {
      setTargetId(participants[0]?.id ?? "");
    }
  }, [participants, targetId]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  const categories = useMemo(
    () => [...new Set(voices.map((voice) => voice.category))].sort(),
    [voices],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return voices.filter((voice) => {
      if (category !== "all" && voice.category !== category) return false;
      if (!needle) return true;
      return [voice.name, voice.description, voice.category, ...Object.values(voice.labels)]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(needle);
    });
  }, [category, query, voices]);

  const togglePreview = async (voice: ElevenLabsVoice) => {
    const audio = audioRef.current;
    if (!audio || !voice.previewUrl) return;
    if (playingId === voice.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.pause();
    setPreviewError("");
    audio.src = voice.previewUrl;
    try {
      await audio.play();
      setPlayingId(voice.id);
    } catch {
      setPlayingId(null);
      setPreviewError(`Não foi possível reproduzir a amostra de ${voice.name}. Escolha outra voz ou tente novamente.`);
    }
  };

  if (loading || !loaded || !voices.length) {
    return (
      <section className="mt-4 space-y-2" aria-label="Vozes da sua conta">
        <h3 className="text-sm font-semibold">Vozes da sua conta</h3>
        <p className="text-xs text-muted-foreground" role="status">
          {loading
            ? "Carregando as vozes da sua conta…"
            : loaded
              ? "Sua conta não retornou vozes. Adicione uma voz na ElevenLabs e atualize o catálogo."
              : "Carregue o catálogo para buscar e ouvir as vozes da sua conta."}
        </p>
        {loaded && !loading && !voices.length ? (
          <a href="https://elevenlabs.io/app/voice-library" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Abrir biblioteca da ElevenLabs (nova aba)
          </a>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-4 space-y-3" aria-label="Vozes da sua conta">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Vozes da sua conta</h3>
        <p className="text-xs text-muted-foreground">
          {voices.length} {voices.length === 1 ? "voz disponível" : "vozes disponíveis"}. São locutores do seu catálogo ElevenLabs, não variações de um único preset.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)]">
        <label className="relative block">
          <span className="sr-only">Buscar vozes</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar vozes"
            placeholder="Buscar nome, idioma ou estilo"
            className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block">
          <span className="sr-only">Filtrar tipo de voz</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filtrar tipo de voz"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Todos os tipos</option>
            {categories.map((item) => (
              <option key={item} value={item}>{categoryLabel(item)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">Usar voz em</span>
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          aria-label="Personagem que receberá a voz"
          className="h-11 min-w-40 flex-1 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>{participant.name}</option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
      </p>
      {previewError ? <p className="text-xs text-destructive" role="alert">{previewError}</p> : null}
      <audio ref={audioRef} preload="none" onEnded={() => setPlayingId(null)} onError={() => {
        setPlayingId(null);
        setPreviewError("A amostra desta voz não está disponível. Você ainda pode selecioná-la para gerar uma fala.");
      }} />
      {filtered.length ? (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Resultados do catálogo ElevenLabs">
          {filtered.map((voice) => (
            <li key={voice.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/50 p-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={voice.name}>{voice.name}</p>
                <p className="truncate text-xs text-muted-foreground" title={voice.description || undefined}>
                  {[categoryLabel(voice.category), voice.labels["language"], voice.labels["accent"], voice.labels["age"], voice.labels["gender"]].filter(Boolean).join(" · ")}
                </p>
                {voice.description ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{voice.description}</p> : null}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                {voice.previewUrl ? (
                  <Button type="button" size="sm" variant="secondary" className="min-h-11 flex-1 sm:flex-none" onClick={() => void togglePreview(voice)} aria-label={`${playingId === voice.id ? "Pausar" : "Ouvir"} amostra de ${voice.name}`}>
                    {playingId === voice.id ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                    {playingId === voice.id ? "Pausar" : "Ouvir"}
                  </Button>
                ) : <span className="self-center text-xs text-muted-foreground">Sem amostra</span>}
                <Button type="button" size="sm" className="min-h-11 flex-1 sm:flex-none" disabled={!targetId} onClick={() => onAssign(targetId, voice)} aria-label={`Usar ${voice.name} para ${participants.find((participant) => participant.id === targetId)?.name ?? "personagem"}`}>
                  Usar voz
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-border p-4 text-xs text-muted-foreground">
          Nenhuma voz corresponde à busca. Tente outro nome ou selecione todos os tipos.
        </p>
      )}
    </section>
  );
}
