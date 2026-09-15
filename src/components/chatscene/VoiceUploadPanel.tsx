/**
 * Envio de áudio próprio por personagem.
 *
 * O usuário grava/escolhe o arquivo de cada fala e ele entra no lugar da voz
 * gerada por IA: a duração medida do áudio vira o tempo da bolha na linha do
 * tempo, então prévia e vídeo exportado ficam sincronizados.
 */
import { Loader2, Play, Square, Trash2, Upload } from "lucide-react";
import { participantOf, type ChatSceneProject } from "@/lib/chatscene/types";
import type { VoiceClip } from "@/lib/chatscene/voice-cast";

export interface VoiceUploadPanelProps {
  project: ChatSceneProject;
  clips: Map<string, VoiceClip>;
  uploading: string | null;
  playingId: string | null;
  onUpload: (messageId: string, file: File) => void;
  onRemove: (messageId: string) => void;
  onPlay: (messageId: string) => void;
  onStop: () => void;
}

export function VoiceUploadPanel({
  project,
  clips,
  uploading,
  playingId,
  onUpload,
  onRemove,
  onPlay,
  onStop,
}: VoiceUploadPanelProps) {
  const speaking = project.messages.filter((m) => m.kind !== "system");

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mono-label mb-1.5 text-muted-foreground">Áudio próprio</p>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Envie um arquivo de áudio para qualquer fala. Ele substitui a voz gerada e o tempo da
        mensagem passa a seguir a duração real do arquivo.
      </p>

      {speaking.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Escreva mensagens para enviar os áudios.</p>
      )}

      <ul className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {speaking.map((m) => {
          const author = participantOf(project, m.participantId);
          const clip = clips.get(m.id);
          const busy = uploading === `voice-${m.id}`;
          return (
            <li
              key={m.id}
              className="rounded-lg border border-border bg-background/40 p-2 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: author.color }} />
                <span className="min-w-0 flex-1 truncate">
                  <strong className="font-medium">{author.name}</strong>{" "}
                  <span className="text-muted-foreground">{m.text || "(sem texto)"}</span>
                </span>
                {clip && (
                  <span className="mono-label shrink-0 text-[10px] text-muted-foreground">
                    {clip.durationSec.toFixed(1)}s
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 hover:border-primary">
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {clip ? "Trocar áudio" : "Enviar áudio"}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) onUpload(m.id, file);
                    }}
                  />
                </label>
                {clip && (
                  <>
                    <button
                      type="button"
                      onClick={() => (playingId === m.id ? onStop() : onPlay(m.id))}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:border-primary"
                      aria-label={playingId === m.id ? "Parar" : `Ouvir a fala de ${author.name}`}
                    >
                      {playingId === m.id ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
                      {playingId === m.id ? "Parar" : "Ouvir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(m.id)}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-destructive"
                      aria-label="Remover este áudio"
                    >
                      <Trash2 className="size-3.5" />
                      Remover
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
