/** Participants: identity, photo, color, writing style and group settings. */
import { Image as ImageIcon, Loader2, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/base";
import { PERSONALITY_PRESETS } from "@/lib/chatscene/personality";
import type { ChatSceneProject } from "@/lib/chatscene/types";

export interface ParticipantsPanelProps {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
  uploading: string | null;
  onAvatar: (target: string, file: File) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function ParticipantsPanel({
  project,
  patch,
  uploading,
  onAvatar,
  onAdd,
  onRemove,
}: ParticipantsPanelProps) {
  const isGroup = (project.chatKind ?? "direct") === "group";
  const updateParticipant = (
    id: string,
    changes: Partial<ChatSceneProject["participants"][number]>,
  ) =>
    patch({
      participants: project.participants.map((participant) =>
        participant.id === id ? { ...participant, ...changes } : participant,
      ),
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/30 p-3">
        <Button
          variant={isGroup ? "default" : "secondary"}
          size="sm"
          onClick={() =>
            patch({
              chatKind: isGroup ? "direct" : "group",
              groupName: isGroup
                ? (project.groupName ?? null)
                : project.groupName || "Grupo da treta",
            })
          }
        >
          <Users className="mr-1.5 size-4" aria-hidden />
          {isGroup ? "É um grupo" : "Conversa de duas pessoas"}
        </Button>
        {isGroup ? (
          <>
            <input
              value={project.groupName ?? ""}
              onChange={(event) => patch({ groupName: event.target.value })}
              placeholder="Nome do grupo"
              className="h-10 min-w-[140px] flex-1 rounded-md border border-border bg-background/60 px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Nome do grupo"
            />
            <label className="interactive inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:border-primary hover:text-primary focus-within:ring-2 focus-within:ring-ring">
              {uploading === "group" ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Upload className="size-3.5" aria-hidden />
              )}
              {project.groupAvatarUrl ? "Trocar foto do grupo" : "Foto do grupo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading === "group"}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onAvatar("group", file);
                }}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {project.participants.map((participant) => (
          <article
            key={participant.id}
            className="rounded-xl border border-border bg-background/40 p-3"
          >
            <div className="flex items-start gap-3">
              <div
                className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-border text-sm font-bold text-white"
                style={{ backgroundColor: participant.color }}
              >
                {participant.avatarUrl ? (
                  <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  participant.name.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <label className="block text-[10px] font-medium text-muted-foreground">
                  Nome do personagem
                  <input
                    value={participant.name}
                    onChange={(event) =>
                      updateParticipant(participant.id, { name: event.target.value })
                    }
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Nome de ${participant.name}`}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <label className="interactive inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium hover:border-primary hover:text-primary focus-within:ring-2 focus-within:ring-ring">
                    {uploading === participant.id ? (
                      <Loader2
                        className="size-3.5 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      <ImageIcon className="size-3.5" aria-hidden />
                    )}
                    {participant.avatarUrl ? "Trocar foto" : "Adicionar foto"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploading === participant.id}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) onAvatar(participant.id, file);
                      }}
                    />
                  </label>
                  {participant.avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => updateParticipant(participant.id, { avatarUrl: null })}
                      className="min-h-9 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Remover foto
                    </button>
                  ) : null}
                </div>
              </div>
              <input
                type="color"
                value={participant.color}
                onChange={(event) =>
                  updateParticipant(participant.id, { color: event.target.value })
                }
                className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label={`Cor de ${participant.name}`}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="text-[10px] font-medium text-muted-foreground">
                Jeito de escrever
                <select
                  value={participant.personalityPresetId ?? "neutro"}
                  onChange={(event) => {
                    const preset = PERSONALITY_PRESETS.find(
                      (item) => item.id === event.target.value,
                    );
                    updateParticipant(participant.id, {
                      personalityPresetId: preset?.id ?? null,
                      personality: preset?.value ?? null,
                    });
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Jeito de escrever de ${participant.name}`}
                  title={
                    PERSONALITY_PRESETS.find(
                      (item) => item.id === (participant.personalityPresetId ?? "neutro"),
                    )?.hint
                  }
                >
                  {PERSONALITY_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  patch({
                    participants: project.participants.map((item) => ({
                      ...item,
                      isSelf: item.id === participant.id,
                    })),
                  })
                }
                className={`mt-auto min-h-9 rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  participant.isSelf
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
                aria-pressed={participant.isSelf}
              >
                {participant.isSelf ? "Sou eu" : "Marcar como eu"}
              </button>
            </div>

            {project.participants.length > 2 ? (
              <button
                type="button"
                onClick={() => onRemove(participant.id)}
                className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remover ${participant.name}`}
              >
                <Trash2 className="size-3.5" aria-hidden /> Remover personagem
              </button>
            ) : null}
          </article>
        ))}
      </div>

      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onAdd}>
        <UserPlus className="mr-1.5 size-4" aria-hidden />
        Novo participante
      </Button>
    </div>
  );
}
