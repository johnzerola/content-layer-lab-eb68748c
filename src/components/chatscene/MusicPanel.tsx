/**
 * Música de fundo do ChatScene: arquivo, volume e abaixar durante as falas.
 * Fica junto das opções de exportação, porque afeta o áudio do vídeo final.
 */
import { Loader2, Music, Upload } from "lucide-react";
import { DEFAULT_VOICE_MIX } from "@/lib/chatscene/voice";
import type { ChatSceneProject } from "@/lib/chatscene/types";

export interface MusicPanelProps {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
  uploading: string | null;
  onUpload: (file: File) => void;
}

export function MusicPanel({ project, patch, uploading, onUpload }: MusicPanelProps) {
  const mix = { ...DEFAULT_VOICE_MIX, ...project.voiceMix };
  const set = (changes: Partial<typeof mix>) => patch({ voiceMix: { ...mix, ...changes } });

  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Music className="size-3.5" />
        Música de fundo
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 hover:border-primary">
          {uploading === "music" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Enviar música
          <input
            type="file"
            className="hidden"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
        {mix.musicUrl && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline hover:text-primary"
            onClick={() => set({ musicUrl: null })}
          >
            tirar música
          </button>
        )}
      </div>
      <input
        value={mix.musicUrl ?? ""}
        onChange={(e) => set({ musicUrl: e.target.value || null })}
        placeholder="ou endereço da música (uso permitido)"
        className="mt-1.5 w-full rounded-md border border-border bg-background/60 px-2 py-1 outline-none focus:border-primary"
        aria-label="Endereço da música de fundo"
      />
      {mix.musicUrl && (
        <audio
          controls
          src={mix.musicUrl}
          className="mt-1.5 w-full"
          aria-label="Ouvir a música de fundo"
        />
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="mono-label shrink-0 text-[10px] text-muted-foreground">volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={mix.musicGain}
          onChange={(e) => set({ musicGain: Number(e.target.value) })}
          className="flex-1 accent-primary"
          aria-label="Volume da música de fundo"
        />
        <span className="w-10 text-right text-[11px] text-muted-foreground">
          {Math.round(mix.musicGain * 100)}%
        </span>
      </div>
      <label className="mt-1 flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={mix.ducking}
          onChange={(e) => set({ ducking: e.target.checked })}
        />
        abaixar a música enquanto alguém fala
      </label>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Use apenas músicas suas ou com permissão de uso.
      </p>
    </div>
  );
}
