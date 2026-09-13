/**
 * Aba "Participantes": quem está na conversa, foto, cor e se é um grupo.
 */
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
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/30 p-2">
        <Button
          variant={isGroup ? "default" : "secondary"}
          size="sm"
          onClick={() =>
            patch({
              chatKind: isGroup ? "direct" : "group",
              groupName: isGroup ? project.groupName ?? null : project.groupName || "Grupo da treta",
            })
          }
        >
          <Users className="mr-1.5 size-4" />
          {isGroup ? "É um grupo" : "Conversa de duas pessoas"}
        </Button>
        {isGroup && (
          <>
            <input
              value={project.groupName ?? ""}
              onChange={(e) => patch({ groupName: e.target.value })}
              placeholder="Nome do grupo"
              className="min-w-[140px] flex-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs outline-none"
              aria-label="Nome do grupo"
            />
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-primary">
              {uploading === "group" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Foto do grupo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onAvatar("group", file);
                }}
              />
            </label>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {project.participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background/40 px-2 py-1.5"
          >
            <input
              type="color"
              value={p.color}
              onChange={(e) =>
                patch({
                  participants: project.participants.map((x) =>
                    x.id === p.id ? { ...x, color: e.target.value } : x,
                  ),
                })
              }
              className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
              aria-label={`Cor de ${p.name}`}
            />
            <input
              value={p.name}
              onChange={(e) =>
                patch({
                  participants: project.participants.map((x) =>
                    x.id === p.id ? { ...x, name: e.target.value } : x,
                  ),
                })
              }
              className="w-24 bg-transparent text-xs outline-none"
              aria-label={`Nome de ${p.name}`}
            />
            <button
              type="button"
              onClick={() =>
                patch({
                  participants: project.participants.map((x) => ({ ...x, isSelf: x.id === p.id })),
                })
              }
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                p.isSelf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              title="Marcar como quem escreve a história"
            >
              eu
            </button>
            <select
              value={p.personalityPresetId ?? "neutro"}
              onChange={(e) => {
                const preset = PERSONALITY_PRESETS.find((x) => x.id === e.target.value);
                patch({
                  participants: project.participants.map((x) =>
                    x.id === p.id
                      ? { ...x, personalityPresetId: preset?.id ?? null, personality: preset?.value ?? null }
                      : x,
                  ),
                });
              }}
              className="rounded-md border border-border bg-background px-1 py-0.5 text-[10px] text-muted-foreground"
              aria-label={`Jeito de escrever de ${p.name}`}
              title={PERSONALITY_PRESETS.find((x) => x.id === (p.personalityPresetId ?? "neutro"))?.hint}
            >
              {PERSONALITY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <label className="cursor-pointer text-muted-foreground hover:text-primary" title={`Foto de ${p.name}`}>
              {uploading === p.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ImageIcon className="size-3.5" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onAvatar(p.id, file);
                }}
              />
            </label>
            {project.participants.length > 2 && (
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${p.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onAdd}>
        <UserPlus className="mr-1.5 size-4" />
        Novo participante
      </Button>
    </div>
  );
}
