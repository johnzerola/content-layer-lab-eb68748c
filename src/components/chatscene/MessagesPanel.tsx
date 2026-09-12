/**
 * Aba "Mensagens": lista do roteiro, com arrastar para reordenar.
 * Só apresentação — toda mudança volta pelo documento `ChatSceneProject`.
 */
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkle,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/base";
import { MESSAGE_KINDS, messageKind } from "@/lib/chatscene/message-kinds";
import type { LibraryAsset } from "@/lib/chatscene/assets";
import { participantOf, type ChatMessage, type ChatSceneProject } from "@/lib/chatscene/types";

export interface MessagesPanelProps {
  project: ChatSceneProject;
  selected: string | null;
  onSelect: (id: string | null) => void;
  updateMessage: (id: string, changes: Partial<ChatMessage>) => void;
  removeMessage: (id: string) => void;
  moveMessage: (id: string, dir: -1 | 1) => void;
  duplicateMessage: (id: string) => void;
  reorderMessage: (fromIndex: number, toIndex: number) => void;
  addMessage: () => void;
  loadDemo: () => void;
  uploading: string | null;
  library: LibraryAsset[];
  onUpload: (messageId: string, file: File) => void;
  script: string;
  onScript: (value: string) => void;
  onImportScript: () => void;
}

export function MessagesPanel({
  project,
  selected,
  onSelect,
  updateMessage,
  removeMessage,
  moveMessage,
  duplicateMessage,
  reorderMessage,
  addMessage,
  loadDemo,
  uploading,
  library,
  onUpload,
  script,
  onScript,
  onImportScript,
}: MessagesPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div>
      <ul className="flex max-h-[56vh] flex-col gap-2 overflow-y-auto pr-1">
        {project.messages.map((m, i) => {
          const author = participantOf(project, m.participantId);
          const active = m.id === selected;
          const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
          return (
            <li
              key={m.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) reorderMessage(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`rounded-xl border p-2.5 transition ${
                active ? "border-primary/70 bg-primary/5" : "border-border bg-background/30"
              } ${isOver ? "ring-2 ring-primary/60" : ""} ${dragIndex === i ? "opacity-50" : ""}`}
              onFocus={() => onSelect(m.id)}
              onClick={() => onSelect(m.id)}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className="cursor-grab text-muted-foreground active:cursor-grabbing"
                  title="Arraste para mudar a ordem"
                  aria-label={`Arrastar mensagem ${i + 1}`}
                >
                  <GripVertical className="size-3.5" />
                </span>
                <select
                  value={m.participantId}
                  onChange={(e) => updateMessage(m.id, { participantId: e.target.value })}
                  className="min-w-0 max-w-[7.5rem] flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                  aria-label="Quem envia"
                  style={{ color: author.color }}
                >
                  {project.participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={m.kind}
                  onChange={(e) => updateMessage(m.id, { kind: e.target.value as ChatMessage["kind"] })}
                  className="min-w-0 max-w-[7.5rem] flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-muted-foreground"
                  aria-label="Tipo de mensagem"
                >
                  {MESSAGE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveMessage(m.id, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMessage(m.id, 1)}
                    disabled={i === project.messages.length - 1}
                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateMessage(m.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Duplicar mensagem"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMessage(m.id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Apagar mensagem"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>

              <textarea
                value={m.text}
                onChange={(e) => updateMessage(m.id, { text: e.target.value })}
                rows={Math.min(5, Math.max(2, Math.ceil(m.text.length / 34)))}
                placeholder={m.kind === "system" ? "Aviso na conversa" : m.kind === "card" ? "Texto do cartão de cena" : "Escreva a mensagem"}
                className="w-full resize-none rounded-lg border border-border bg-background/60 px-2.5 py-2 text-sm outline-none focus:border-primary"
                aria-label="Texto da mensagem"
              />

              {messageKind(m.kind).needsMedia && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs hover:border-primary">
                    {uploading === m.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    Enviar {messageKind(m.kind).label.toLowerCase()}
                    <input
                      type="file"
                      className="hidden"
                      accept={messageKind(m.kind).accept ?? "image/*"}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) onUpload(m.id, file);
                      }}
                    />
                  </label>
                  {library.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const asset = library.find((a) => a.hash === e.target.value);
                        if (asset) updateMessage(m.id, { mediaUrl: asset.url, mediaAspect: asset.aspect });
                      }}
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-muted-foreground"
                      aria-label="Reaproveitar da biblioteca"
                    >
                      <option value="">da biblioteca…</option>
                      {library.map((a) => (
                        <option key={a.hash} value={a.hash}>
                          {a.name.slice(0, 24)}
                        </option>
                      ))}
                    </select>
                  )}
                  <ImageIcon className="size-3.5 text-muted-foreground" />
                  <input
                    value={m.mediaUrl?.startsWith("blob:") ? "arquivo do computador" : m.mediaUrl ?? ""}
                    onChange={(e) => updateMessage(m.id, { mediaUrl: e.target.value || null })}
                    placeholder="ou cole um endereço (https://…)"
                    className="min-w-[140px] flex-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs outline-none"
                    aria-label="Endereço da mídia"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {project.messages.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          <p className="mb-2">Nenhuma mensagem ainda.</p>
          <Button variant="secondary" size="sm" onClick={loadDemo}>
            <Sparkle className="mr-1.5 size-4" />
            Carregar conversa de exemplo
          </Button>
        </div>
      )}

      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addMessage}>
        <Plus className="mr-1.5 size-4" />
        Nova mensagem
      </Button>

      <div className="mt-3 rounded-xl border border-border p-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="chatscene-script">
          Colar conversa pronta
        </label>
        <textarea
          id="chatscene-script"
          value={script}
          onChange={(e) => onScript(e.target.value)}
          rows={4}
          placeholder={"Ana: oi, tudo bem?\nBruno: tudo! e você?\n* Ana entrou no grupo"}
          className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-2 text-sm"
        />
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 w-full"
          disabled={!script.trim()}
          onClick={onImportScript}
        >
          <Plus className="mr-1.5 size-4" />
          Adicionar à conversa
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Arraste pelo símbolo à esquerda para mudar a ordem das mensagens.
      </p>
    </div>
  );
}
