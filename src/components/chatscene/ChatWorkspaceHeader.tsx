import { Copy, Plus, Trash2, Users, MessageSquare } from "lucide-react";
import {
  threadIdOf,
  threadsOf,
  type ChatSceneProject,
  type ChatSceneThread,
} from "@/lib/chatscene/types";

interface Props {
  project: ChatSceneProject;
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUpdate: (changes: Partial<ChatSceneThread>) => void;
  onAvatar: (file: File) => void;
  uploading: boolean;
}

export function ChatWorkspaceHeader({
  project,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onUpdate,
  onAvatar,
  uploading,
}: Props) {
  const threads = threadsOf(project);
  const active = threads.find((t) => t.id === activeId) ?? threads[0]!;
  return (
    <div className="mb-5 border-b border-border pb-5">
      <div className="flex flex-wrap items-center gap-2" aria-label="Conversas do vídeo">
        {threads.map((thread, i) => (
          <button
            type="button"
            key={thread.id}
            onClick={() => onSelect(thread.id)}
            aria-pressed={active.id === thread.id}
            className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring ${active.id === thread.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
          >
            {thread.kind === "group" ? (
              <Users className="size-4" />
            ) : (
              <MessageSquare className="size-4" />
            )}
            Chat {i + 1}
            <span className="max-w-32 truncate text-xs">{thread.name}</span>
            <span className="text-xs">
              ({project.messages.filter((m) => threadIdOf(project, m) === thread.id).length})
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" />
          Adicionar Chat {threads.length + 1}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-xs focus-within:ring-2 focus-within:ring-ring">
          {active.avatarUrl ? (
            <img src={active.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
          ) : (
            <span className="grid size-9 place-items-center rounded-full bg-secondary">
              <Users className="size-4" />
            </span>
          )}
          {uploading ? "Enviando…" : "Foto do chat"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Foto do chat"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAvatar(file);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Nome do contato ou grupo
          <input
            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            value={active.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Tipo de chat
          <select
            value={active.kind ?? "direct"}
            onChange={(e) => onUpdate({ kind: e.target.value as "direct" | "group" })}
            className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="direct">Conversa direta</option>
            <option value="group">Grupo</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <p className="min-w-40 flex-1 text-muted-foreground">
          Chats no mesmo vídeo, em sequência. Cada mensagem define quando a conversa muda.
        </p>
        <button
          type="button"
          onClick={onDuplicate}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Copy className="size-3.5" />
          Duplicar chat
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={threads.length < 2}
          title="As mensagens serão movidas para o primeiro chat restante"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 hover:bg-secondary disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="size-3.5" />
          Remover chat
        </button>
      </div>
    </div>
  );
}
