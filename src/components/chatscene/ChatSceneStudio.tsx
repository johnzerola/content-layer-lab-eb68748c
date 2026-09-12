/**
 * Analogue ChatScene — tela única de criação.
 *
 * Modo Simples: escrever a conversa, escolher o visual, ver e exportar.
 * Modo Estúdio: abre o ajuste fino de ritmo e das mensagens.
 * Todo estado vive no documento `ChatSceneProject`; nenhuma cópia paralela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Sliders,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui/base";
import { ChatScenePreview } from "@/components/chatscene/ChatScenePreview";
import { buildPlan } from "@/lib/chatscene/clock";
import { encodeFrameSequence, frameEncoderSupported } from "@/lib/chatscene/encode-frames";
import { CanvasConversationRenderer } from "@/lib/chatscene/renderer";
import { saveChatSceneProject } from "@/lib/chatscene/project.service";
import { uploadChatSceneMedia } from "@/lib/chatscene/upload";
import { CHAT_THEMES } from "@/lib/chatscene/theme";
import {
  createChatSceneProject,
  createMessage,
  createParticipant,
  participantOf,
  renderSize,
  type ChatMessage,
  type ChatSceneProject,
} from "@/lib/chatscene/types";

const PALETTE = ["#7c5cff", "#ff5c8a", "#22c08a", "#f2b705", "#4ec3ff", "#ff8a4c"];

function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "chatscene"
  );
}

export function ChatSceneStudio() {
  const [project, setProject] = useState<ChatSceneProject>(() => createChatSceneProject());
  const [recordId, setRecordId] = useState<string | null>(null);
  const [studio, setStudio] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const plan = useMemo(() => buildPlan(project), [project]);
  const isGroup = (project.chatKind ?? "direct") === "group";

  useEffect(() => {
    if (frame > plan.totalFrames - 1) setFrame(plan.totalFrames - 1);
  }, [plan.totalFrames, frame]);

  const patch = useCallback((changes: Partial<ChatSceneProject>) => {
    setProject((prev) => ({ ...prev, ...changes }));
  }, []);

  const updateMessage = useCallback((id: string, changes: Partial<ChatMessage>) => {
    setProject((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.id === id ? { ...m, ...changes } : m)),
    }));
  }, []);

  /** Envia um arquivo do computador e aponta a mensagem para ele. */
  const handleUpload = useCallback(
    async (messageId: string, file: File) => {
      setUploading(messageId);
      try {
        const { url, aspect, temporary } = await uploadChatSceneMedia(file);
        updateMessage(messageId, { mediaUrl: url, mediaAspect: aspect });
        if (temporary) {
          toast.warning("O arquivo ficou só nesta sessão; salve a conversa depois de enviá-lo de novo.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível usar este arquivo.");
      } finally {
        setUploading(null);
      }
    },
    [updateMessage],
  );

  /** Foto de um participante ou do grupo. */
  const handleAvatarUpload = useCallback(async (target: string, file: File) => {
    setUploading(target);
    try {
      const { url } = await uploadChatSceneMedia(file);
      setProject((prev) =>
        target === "group"
          ? { ...prev, groupAvatarUrl: url }
          : {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === target ? { ...p, avatarUrl: url } : p,
              ),
            },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível usar esta foto.");
    } finally {
      setUploading(null);
    }
  }, []);

  const addMessage = useCallback(() => {
    setProject((prev) => {
      const last = prev.messages.at(-1);
      const lastAuthor = last ? participantOf(prev, last.participantId) : null;
      const next =
        prev.participants.find((p) => p.id !== lastAuthor?.id) ?? prev.participants[0]!;
      const message = createMessage(next.id, { text: "" });
      setSelected(message.id);
      return { ...prev, messages: [...prev.messages, message] };
    });
  }, []);

  const removeMessage = useCallback((id: string) => {
    setProject((prev) => ({ ...prev, messages: prev.messages.filter((m) => m.id !== id) }));
  }, []);

  const moveMessage = useCallback((id: string, dir: -1 | 1) => {
    setProject((prev) => {
      const idx = prev.messages.findIndex((m) => m.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.messages.length) return prev;
      const messages = [...prev.messages];
      const [item] = messages.splice(idx, 1);
      messages.splice(target, 0, item!);
      return { ...prev, messages };
    });
  }, []);

  const addParticipant = useCallback(() => {
    setProject((prev) => {
      if (prev.participants.length >= 8) return prev;
      const color = PALETTE[prev.participants.length % PALETTE.length]!;
      return {
        ...prev,
        participants: [
          ...prev.participants,
          createParticipant({ name: `Pessoa ${prev.participants.length + 1}`, color }),
        ],
      };
    });
  }, []);

  const removeParticipant = useCallback((id: string) => {
    setProject((prev) => {
      if (prev.participants.length <= 2) return prev;
      const participants = prev.participants.filter((p) => p.id !== id);
      const fallback = participants[0]!.id;
      return {
        ...prev,
        participants,
        messages: prev.messages.map((m) =>
          m.participantId === id ? { ...m, participantId: fallback } : m,
        ),
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const id = await saveChatSceneProject(project, recordId);
      setRecordId(id);
      toast.success("Conversa salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a conversa.");
    } finally {
      setSaving(false);
    }
  }, [project, recordId]);

  const handleExport = useCallback(async () => {
    if (!frameEncoderSupported()) {
      toast.error("Este navegador não exporta vídeo. Use o Chrome ou o Edge no computador.");
      return;
    }
    if (!project.messages.some((m) => m.text.trim() || m.mediaUrl)) {
      toast.error("Escreva pelo menos uma mensagem antes de exportar.");
      return;
    }
    setPlaying(false);
    setExporting(true);
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const renderer = new CanvasConversationRenderer({ safeZones: false });
      await renderer.prepare(project);
      const { width, height } = renderSize(project.render);
      const blob = await encodeFrameSequence({
        width,
        height,
        fps: plan.fps,
        totalFrames: plan.totalFrames,
        signal: controller.signal,
        onProgress: setProgress,
        draw: (ctx, index) => renderer.drawFrame(ctx, { width, height, frame: index, plan }),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(project.title)}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      toast.success("Vídeo pronto. O download começou.");
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") toast("Exportação cancelada.");
      else toast.error(err instanceof Error ? err.message : "A exportação falhou.");
    } finally {
      abortRef.current = null;
      setExporting(false);
      setProgress(0);
    }
  }, [project, plan]);

  const selectedMessage = project.messages.find((m) => m.id === selected) ?? null;
  const { width, height } = renderSize(project.render);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <p className="mono-label text-muted-foreground">Analogue ChatScene</p>
          <Input
            value={project.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Título da história"
            className="mt-1 h-9 text-base font-semibold"
            aria-label="Título da história"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={studio ? "default" : "secondary"}
            size="sm"
            onClick={() => setStudio((v) => !v)}
          >
            <Sliders className="mr-1.5 size-4" />
            {studio ? "Modo estúdio" : "Modo simples"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            Salvar
          </Button>
          <Button size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
            {exporting ? `${Math.round(progress * 100)}%` : "Exportar MP4"}
          </Button>
          {exporting && (
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              Cancelar
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px_300px]">
        {/* ---------------------------------------------------------- roteiro */}
        <section className="glass rounded-2xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Conversa</h2>
            <Button variant="ghost" size="sm" onClick={addParticipant}>
              <UserPlus className="mr-1.5 size-4" />
              Participante
            </Button>
          </div>

          {/* grupo */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/30 p-2">
            <Button
              variant={isGroup ? "default" : "secondary"}
              size="sm"
              onClick={() =>
                patch({
                  chatKind: isGroup ? "direct" : "group",
                  groupName: isGroup ? project.groupName : project.groupName || "Grupo da treta",
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
                      if (file) void handleAvatarUpload("group", file);
                    }}
                  />
                </label>
              </>
            )}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {project.participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background/40 px-2 py-1.5"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
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
                      participants: project.participants.map((x) => ({
                        ...x,
                        isSelf: x.id === p.id,
                      })),
                    })
                  }
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    p.isSelf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                  title="Marcar como quem escreve a história"
                >
                  eu
                </button>
                <label
                  className="cursor-pointer text-muted-foreground hover:text-primary"
                  title={`Foto de ${p.name}`}
                >
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
                      if (file) void handleAvatarUpload(p.id, file);
                    }}
                  />
                </label>
                {project.participants.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(p.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${p.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <ul className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1">
            {project.messages.map((m, i) => {
              const author = participantOf(project, m.participantId);
              const active = m.id === selected;
              return (
                <li
                  key={m.id}
                  className={`rounded-xl border p-2.5 transition ${
                    active ? "border-primary/70 bg-primary/5" : "border-border bg-background/30"
                  }`}
                  onFocus={() => setSelected(m.id)}
                  onClick={() => setSelected(m.id)}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <select
                      value={m.participantId}
                      onChange={(e) => updateMessage(m.id, { participantId: e.target.value })}
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
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
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-muted-foreground"
                      aria-label="Tipo de mensagem"
                    >
                      <option value="text">texto</option>
                      <option value="emoji">emoji</option>
                      <option value="image">foto</option>
                      <option value="sticker">figurinha</option>
                      <option value="video">vídeo / meme</option>
                      <option value="system">aviso</option>
                    </select>
                    <span className="ml-auto flex items-center gap-0.5">
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
                    placeholder={m.kind === "system" ? "Aviso na conversa" : "Escreva a mensagem"}
                    className="w-full resize-none rounded-lg border border-border bg-background/60 px-2.5 py-2 text-sm outline-none focus:border-primary"
                    aria-label="Texto da mensagem"
                  />

                  {(m.kind === "image" || m.kind === "sticker" || m.kind === "video") && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs hover:border-primary">
                        {uploading === m.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Upload className="size-3.5" />
                        )}
                        {m.kind === "video" ? "Enviar vídeo" : m.kind === "sticker" ? "Enviar figurinha" : "Enviar foto"}
                        <input
                          type="file"
                          className="hidden"
                          accept={m.kind === "video" ? "video/*" : "image/*"}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void handleUpload(m.id, file);
                          }}
                        />
                      </label>
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

          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addMessage}>
            <Plus className="mr-1.5 size-4" />
            Nova mensagem
          </Button>
        </section>

        {/* ----------------------------------------------------------- prévia */}
        <section className="glass rounded-2xl border border-border p-4">
          <ChatScenePreview
            project={project}
            plan={plan}
            frame={frame}
            playing={playing}
            onFrame={setFrame}
            onPlaying={setPlaying}
          />

          <div className="mt-4">
            <p className="mono-label mb-2 text-muted-foreground">Visual</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CHAT_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => patch({ themeId: t.id })}
                  title={t.description}
                  className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                    project.themeId === t.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{t.description}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={project.dark}
                  onChange={(e) => patch({ dark: e.target.checked })}
                />
                modo escuro
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={project.render.safeZones}
                  onChange={(e) =>
                    patch({ render: { ...project.render, safeZones: e.target.checked } })
                  }
                />
                margens seguras
              </label>
              <span className="mono-label ml-auto text-muted-foreground">
                {width}×{height}
              </span>
            </div>

            <div className="mt-3">
              <label className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                Velocidade
                <span className="mono-label">{project.timing.speed.toFixed(1)}×</span>
              </label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={project.timing.speed}
                onChange={(e) => patch({ timing: { ...project.timing, speed: Number(e.target.value) } })}
                className="h-1.5 w-full accent-primary"
                aria-label="Velocidade da conversa"
              />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- estúdio */}
        {studio && (
          <section className="glass rounded-2xl border border-border p-4 xl:max-h-[80vh] xl:overflow-y-auto">
            <h2 className="mb-3 text-sm font-semibold">Ajuste fino</h2>

            <div className="flex flex-col gap-3 text-xs">
              <Range
                label="Pausa entre mensagens"
                value={project.timing.gapMs}
                min={0}
                max={2000}
                step={50}
                suffix="ms"
                onChange={(v) => patch({ timing: { ...project.timing, gapMs: v } })}
              />
              <Range
                label="Leitura por caractere"
                value={project.timing.msPerChar}
                min={10}
                max={120}
                step={2}
                suffix="ms"
                onChange={(v) => patch({ timing: { ...project.timing, msPerChar: v } })}
              />
              <Range
                label="Tempo de “digitando…”"
                value={project.timing.typingMs}
                min={0}
                max={3000}
                step={100}
                suffix="ms"
                onChange={(v) => patch({ timing: { ...project.timing, typingMs: v } })}
              />
              <Range
                label="Sobra no final"
                value={project.timing.tailMs}
                min={0}
                max={5000}
                step={100}
                suffix="ms"
                onChange={(v) => patch({ timing: { ...project.timing, tailMs: v } })}
              />
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={project.timing.typing}
                  onChange={(e) => patch({ timing: { ...project.timing, typing: e.target.checked } })}
                />
                mostrar “digitando…”
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={project.receipts ?? true}
                  onChange={(e) => patch({ receipts: e.target.checked })}
                />
                tiques de mensagem lida
              </label>
              <div>
                <p className="mb-1 text-muted-foreground">Hora inicial da conversa</p>
                <input
                  value={project.startClock ?? "21:14"}
                  onChange={(e) => patch({ startClock: e.target.value })}
                  placeholder="21:14"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                  aria-label="Hora inicial da conversa"
                />
              </div>
              <div>
                <p className="mb-1 text-muted-foreground">Qualidade do vídeo</p>
                <select
                  value={project.render.height}
                  onChange={(e) =>
                    patch({ render: { ...project.render, height: Number(e.target.value) } })
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                  aria-label="Qualidade do vídeo"
                >
                  <option value={1280}>720p — rápido</option>
                  <option value={1920}>1080p — recomendado</option>
                </select>
              </div>
            </div>

            <hr className="my-4 border-border" />

            <h3 className="mb-2 text-sm font-semibold">Mensagem selecionada</h3>
            {selectedMessage ? (
              <div className="flex flex-col gap-3 text-xs">
                <p className="line-clamp-2 text-muted-foreground">
                  {selectedMessage.text || "(sem texto)"}
                </p>
                <Range
                  label="Pausa antes desta mensagem"
                  value={selectedMessage.delayMs ?? 0}
                  min={0}
                  max={5000}
                  step={100}
                  suffix="ms"
                  onChange={(v) => updateMessage(selectedMessage.id, { delayMs: v || null })}
                />
                <Range
                  label="“Digitando…” só desta mensagem"
                  value={selectedMessage.typingMs ?? project.timing.typingMs}
                  min={0}
                  max={4000}
                  step={100}
                  suffix="ms"
                  onChange={(v) => updateMessage(selectedMessage.id, { typingMs: v })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateMessage(selectedMessage.id, { delayMs: null, typingMs: null })}
                >
                  Voltar ao ritmo automático
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPlaying(false);
                    setFrame(plan.byId[selectedMessage.id]?.appearFrame ?? 0);
                  }}
                >
                  Ver na prévia
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Clique em uma mensagem à esquerda para ajustar o tempo dela.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-muted-foreground">
        {label}
        <span className="mono-label">
          {value}
          {suffix}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full accent-primary"
        aria-label={label}
      />
    </div>
  );
}
