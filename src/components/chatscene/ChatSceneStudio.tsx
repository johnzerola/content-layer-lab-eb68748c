/**
 * Analogue ChatScene — tela única de criação.
 *
 * Modo Simples: escrever a conversa, escolher o visual, ver e exportar.
 * Modo Estúdio: abre o ajuste fino de ritmo e das mensagens.
 * Todo estado vive no documento `ChatSceneProject`; nenhuma cópia paralela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Mic,
  Palette,
  Paintbrush,
  Download,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Sliders,
  Volume2,
  Copy,
  Sparkle,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui/base";
import { ChatScenePreview } from "@/components/chatscene/ChatScenePreview";
import { ChatSceneTimeline } from "@/components/chatscene/ChatSceneTimeline";
import { CreatorLayouts } from "@/components/chatscene/CreatorLayouts";
import { VoicePanel } from "@/components/chatscene/VoicePanel";
import { BrandPanel } from "@/components/chatscene/BrandPanel";
import { ThemePanel } from "@/components/chatscene/ThemePanel";
import { MusicPanel } from "@/components/chatscene/MusicPanel";
import { buildPlan } from "@/lib/chatscene/clock";
import { encodeFrameSequence, frameEncoderSupported } from "@/lib/chatscene/encode-frames";
import { CanvasConversationRenderer } from "@/lib/chatscene/renderer";
import { saveChatSceneProject } from "@/lib/chatscene/project.service";
import { uploadChatSceneMedia } from "@/lib/chatscene/upload";
import { addFileToLibrary, readLibrary, type LibraryAsset } from "@/lib/chatscene/assets";
import { MESSAGE_KINDS, messageKind, voiceSeconds } from "@/lib/chatscene/message-kinds";
import { synthesizeVoice } from "@/lib/chatscene/voice.functions";
import {
  applyVoiceDurations,
  createGatewayVoiceProvider,
  generateCast,
  previewVoice,
  speakingMessages,
  type VoiceClip,
} from "@/lib/chatscene/voice-cast";
import { loadMusic, mixConversationAudio } from "@/lib/chatscene/audio-mix";
import { CAMERA_MODES, DEFAULT_CAMERA } from "@/lib/chatscene/camera";
import {
  DEFAULT_VOICE,
  DEFAULT_VOICE_MIX,
  PITCH_MAX,
  PITCH_MIN,
  VOICE_PRESETS,
  VOICE_STYLES,
  type VoiceProfile,
} from "@/lib/chatscene/voice";
import { CHAT_THEMES } from "@/lib/chatscene/theme";
import { loadLocalDraft, saveLocalDraft } from "@/lib/chatscene/serialize";
import {
  ANIMATION_PRESETS,
  BACKGROUND_PRESETS,
  DEFAULT_BRANDING,
  DEFAULT_HEADER,
  CREATOR_LAYOUTS,
  LAYOUT_PRESETS,
  createChatSceneProject,
  createDemoChatSceneProject,
  createMessage,
  createParticipant,
  participantOf,
  renderSize,
  type ChatSceneAspect,
  type ChatMessage,
  type ChatSceneProject,
} from "@/lib/chatscene/types";

const PALETTE = ["#7c5cff", "#ff5c8a", "#22c08a", "#f2b705", "#4ec3ff", "#ff8a4c"];

type StudioPanel = "visual" | "tema" | "vozes" | "marca";

/** Barra lateral do estúdio: visual, vozes e marca, sem abrir outra tela. */
const PANEL_TABS: { id: StudioPanel; label: string; icon: typeof Palette }[] = [
  { id: "visual", label: "Visual", icon: Palette },
  { id: "tema", label: "Tema", icon: Paintbrush },
  { id: "vozes", label: "Vozes", icon: Mic },
  { id: "marca", label: "Marca do criador", icon: BadgeCheck },
];

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
  /** mídia já enviada nesta conversa, para reaproveitar sem subir de novo */
  const [library, setLibrary] = useState<LibraryAsset[]>([]);
  /** falas geradas, por mensagem */
  const [clips, setClips] = useState<Map<string, VoiceClip>>(new Map());
  const [castState, setCastState] = useState<"idle" | "running">("idle");
  const [castProgress, setCastProgress] = useState({ done: 0, total: 0 });
  const [panel, setPanel] = useState<StudioPanel>("visual");
  useEffect(() => {
    setLibrary(readLibrary());
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportName, setExportName] = useState("chatscene.mp4");


  const plan = useMemo(() => buildPlan(project), [project]);
  const isGroup = (project.chatKind ?? "direct") === "group";

  // rascunho no próprio navegador: atualizar a página não perde o trabalho
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = loadLocalDraft();
    if (draft) {
      setProject(draft.project);
      setRecordId(draft.recordId);
    }
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    const id = setTimeout(() => saveLocalDraft(project, recordId), 600);
    return () => clearTimeout(id);
  }, [project, recordId]);

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
        const { asset, library: next, reused } = await addFileToLibrary(file, "message");
        setLibrary(next);
        updateMessage(messageId, { mediaUrl: asset.url, mediaAspect: asset.aspect });
        if (reused) toast.success("Arquivo reaproveitado da biblioteca — nada foi enviado de novo.");
        const temporary = asset.temporary;
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

  /** Vídeo em laço atrás da conversa. */
  const handleBackgroundVideo = useCallback(async (file: File) => {
    setUploading("background");
    try {
      const { asset, library: next } = await addFileToLibrary(file, "background");
      setLibrary(next);
      setProject((prev) => ({ ...prev, background: { kind: "video", videoUrl: asset.url, loop: true } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível usar este vídeo.");
    } finally {
      setUploading(null);
    }
  }, []);

  /** Logo do criador mostrada por cima da cena. */
  const handleLogo = useCallback(async (file: File) => {
    setUploading("logo");
    try {
      const { asset, library: next } = await addFileToLibrary(file, "logo");
      setLibrary(next);
      setProject((prev) => ({
        ...prev,
        branding: { ...DEFAULT_BRANDING, ...prev.branding, enabled: true, logoUrl: asset.url },
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível usar esta imagem.");
    } finally {
      setUploading(null);
    }
  }, []);

  /** Logo ou imagem de fundo do cabeçalho do vídeo. */
  const handleHeaderImage = useCallback(async (file: File, slot: "logo" | "background") => {
    setUploading(slot === "logo" ? "header-logo" : "header-bg");
    try {
      const { asset, library: next } = await addFileToLibrary(file, slot === "logo" ? "logo" : "background");
      setLibrary(next);
      setProject((prev) => ({
        ...prev,
        header: {
          ...DEFAULT_HEADER,
          ...prev.header,
          ...(slot === "logo" ? { logoUrl: asset.url } : { bgImageUrl: asset.url }),
        },
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível usar esta imagem.");
    } finally {
      setUploading(null);
    }
  }, []);

  /** Música de fundo do vídeo. */
  const handleMusic = useCallback(async (file: File) => {
    setUploading("music");
    try {
      const { url, temporary } = await uploadChatSceneMedia(file);
      setProject((prev) => ({
        ...prev,
        voiceMix: { ...DEFAULT_VOICE_MIX, ...prev.voiceMix, musicUrl: url },
      }));
      if (temporary) {
        toast.warning("A música ficou só nesta sessão; envie de novo depois de salvar.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível usar esta música.");
    } finally {
      setUploading(null);
    }
  }, []);

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

  const duplicateMessage = useCallback((id: string) => {
    setProject((prev) => {
      const idx = prev.messages.findIndex((m) => m.id === id);
      if (idx < 0) return prev;
      const { id: _omit, ...rest } = prev.messages[idx]!;
      const copy = createMessage(rest.participantId, rest);
      const messages = [...prev.messages];
      messages.splice(idx + 1, 0, copy);
      setSelected(copy.id);
      return { ...prev, messages };
    });
  }, []);

  const addParticipant = useCallback(() => {
    setProject((prev) => {
      if (prev.participants.length >= 12) return prev;
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

  const speakFn = useServerFn(synthesizeVoice);
  const voiceProvider = useMemo(
    () => createGatewayVoiceProvider((input) => speakFn({ data: input })),
    [speakFn],
  );

  /** Ouve uma frase curta com a voz, o jeito de falar e o tom escolhidos. */
  const stopPreviewRef = useRef<(() => void) | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const handlePreviewVoice = useCallback(
    async (participantId: string, profile: VoiceProfile) => {
      stopPreviewRef.current?.();
      stopPreviewRef.current = null;
      setPreviewingVoice(participantId);
      try {
        stopPreviewRef.current = await previewVoice(voiceProvider, profile);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível ouvir esta voz.");
      } finally {
        setPreviewingVoice(null);
      }
    },
    [voiceProvider],
  );
  useEffect(() => () => stopPreviewRef.current?.(), []);

  /** Gera (ou reaproveita) a fala de todas as mensagens com voz escolhida. */
  const handleGenerateVoices = useCallback(async () => {
    const withVoice = speakingMessages(project).filter(
      (m) => project.participants.find((p) => p.id === m.message.participantId)?.voice,
    );
    if (!withVoice.length) {
      toast.error("Escolha uma voz para pelo menos uma pessoa da conversa.");
      return;
    }
    setPlaying(false);
    setCastState("running");
    setCastProgress({ done: 0, total: withVoice.length });
    try {
      const result = await generateCast(project, voiceProvider, {
        batch: 3,
        onProgress: (p) => setCastProgress({ done: p.done, total: p.total }),
      });
      setClips((prev) => {
        const next = new Map(prev);
        for (const [id, clip] of result.clips) next.set(id, clip);
        return next;
      });
      setProject((prev) => applyVoiceDurations(prev, result.durations));
      if (result.failures.length) {
        toast.warning(
          `${result.generated} falas prontas, ${result.failures.length} não saíram: ${result.failures[0]!.reason}`,
        );
      } else {
        toast.success(
          result.reused
            ? `${result.generated} falas novas e ${result.reused} reaproveitadas.`
            : `${result.generated} falas prontas. O ritmo já acompanha a duração real.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar as vozes.");
    } finally {
      setCastState("idle");
    }
  }, [project, voiceProvider]);

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

      // trilha: falas no tempo de cada bolha + música opcional por baixo
      let audio: AudioBuffer | null = null;
      const mix = project.voiceMix ?? DEFAULT_VOICE_MIX;
      if (clips.size || mix.musicUrl) {
        try {
          const music = mix.musicUrl ? await loadMusic(mix.musicUrl) : null;
          audio = await mixConversationAudio({ project, plan, clips, settings: mix, music });
        } catch {
          toast.warning("O vídeo sai sem som: não foi possível montar a trilha.");
        }
      }

      const blob = await encodeFrameSequence({
        width,
        height,
        fps: plan.fps,
        totalFrames: plan.totalFrames,
        signal: controller.signal,
        onProgress: setProgress,
        audio,
        draw: (ctx, index) => renderer.drawFrame(ctx, { width, height, frame: index, plan }),
      });
      const url = URL.createObjectURL(blob);
      const name = `${slugify(project.title)}.mp4`;
      setExportUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      setExportName(name);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      toast.success("Vídeo pronto. Baixou e já dá para assistir aqui.");

    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") toast("Exportação cancelada.");
      else toast.error(err instanceof Error ? err.message : "A exportação falhou.");
    } finally {
      abortRef.current = null;
      setExporting(false);
      setProgress(0);
    }
  }, [project, plan, clips]);

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

      {exportUrl && (
        <section className="mb-5 rounded-xl border border-border bg-background/40 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="mono-label text-muted-foreground">Vídeo pronto</p>
            <a
              href={exportUrl}
              download={exportName}
              className="ml-auto text-sm text-primary underline-offset-4 hover:underline"
            >
              Baixar de novo
            </a>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(exportUrl);
                setExportUrl(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
          <video
            src={exportUrl}
            controls
            playsInline
            aria-label="Vídeo exportado"
            className="mx-auto max-h-[70vh] w-auto rounded-lg border border-border bg-black"
          />
        </section>
      )}


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
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
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
                    placeholder={m.kind === "system" ? "Aviso na conversa" : "Escreva a mensagem"}
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
                            if (file) void handleUpload(m.id, file);
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setProject(createDemoChatSceneProject());
                  setSelected(null);
                  setFrame(0);
                }}
              >
                <Sparkle className="mr-1.5 size-4" />
                Carregar conversa de exemplo
              </Button>
            </div>
          )}

          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addMessage}>
            <Plus className="mr-1.5 size-4" />
            Nova mensagem
          </Button>

          {/* colar a conversa inteira de uma vez */}
          <div className="mt-3 rounded-xl border border-border p-3">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="chatscene-script">
              Colar conversa pronta
            </label>
            <textarea
              id="chatscene-script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={4}
              placeholder={"Ana: oi, tudo bem?\nBruno: tudo! e você?\n* Ana entrou no grupo"}
              className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-2 text-sm"
            />
            <Button
              variant="secondary"
              size="sm"
              className="mt-2 w-full"
              disabled={!script.trim()}
              onClick={importScript}
            >
              <Plus className="mr-1.5 size-4" />
              Adicionar à conversa
            </Button>
          </div>

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
            clips={clips}
          />

          <div className="mt-4 flex gap-3">
            <nav className="flex shrink-0 flex-col gap-1.5" aria-label="Painéis do ChatScene">
              {PANEL_TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.label}
                    aria-label={t.label}
                    aria-pressed={panel === t.id}
                    onClick={() => setPanel(t.id)}
                    className={`flex size-9 items-center justify-center rounded-lg border transition ${
                      panel === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </nav>
            <div className="min-w-0 flex-1">
            {panel === "vozes" && (
              <VoicePanel
                project={project}
                patch={patch}
                clipCount={clips.size}
                castState={castState}
                castProgress={castProgress}
                onGenerate={() => void handleGenerateVoices()}
                previewing={previewingVoice}
                onPreview={(id, profile) => void handlePreviewVoice(id, profile)}
              />
            )}
            {panel === "tema" && <ThemePanel project={project} patch={patch} />}
            {panel === "marca" && (
              <BrandPanel
                project={project}
                patch={patch}
                uploading={uploading}
                onLogo={(file) => void handleLogo(file)}
                onHeaderLogo={(file) => void handleHeaderImage(file, "logo")}
                onHeaderBackground={(file) => void handleHeaderImage(file, "background")}
              />
            )}
            {panel === "visual" && (
              <>
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
              <p className="mono-label mb-1.5 text-muted-foreground">Formato</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["9:16", "16:9", "1:1"] as ChatSceneAspect[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => patch({ render: { ...project.render, aspect: a } })}
                    className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                      project.render.aspect === a
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="mono-label mb-1.5 text-muted-foreground">Fundo</p>
              <div className="grid grid-cols-3 gap-1.5">
                {BACKGROUND_PRESETS.map((b) => {
                  const active =
                    (project.background?.kind ?? "theme") === b.value.kind &&
                    (project.background?.color ?? null) === (b.value.color ?? null);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => patch({ background: { ...b.value } })}
                      className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                        active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
              <input
                value={project.background?.kind === "image" ? project.background.imageUrl ?? "" : ""}
                onChange={(e) =>
                  patch({
                    background: e.target.value
                      ? { kind: "image", imageUrl: e.target.value }
                      : { kind: "theme" },
                  })
                }
                placeholder="ou cole a foto de fundo (https://…)"
                className="mt-1.5 w-full rounded-md border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-primary"
                aria-label="Foto de fundo"
              />
              <div className="mt-1.5 flex items-center gap-1.5">
                <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs hover:border-primary">
                  {uploading === "background" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  Vídeo de fundo
                  <input
                    type="file"
                    className="hidden"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handleBackgroundVideo(file);
                    }}
                  />
                </label>
                <input
                  value={project.background?.kind === "video" ? project.background.videoUrl ?? "" : ""}
                  onChange={(e) =>
                    patch({
                      background: e.target.value
                        ? { kind: "video", videoUrl: e.target.value, loop: true }
                        : { kind: "theme" },
                    })
                  }
                  placeholder="ou endereço do vídeo em laço"
                  className="min-w-[120px] flex-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-primary"
                  aria-label="Vídeo de fundo"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Use apenas vídeos seus ou com permissão de uso.
              </p>
            </div>


            <div className="mt-3">
              <p className="mono-label mb-1.5 text-muted-foreground">Enquadramento</p>
              <div className="grid grid-cols-2 gap-1.5">
                {LAYOUT_PRESETS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => patch({ layout: { ...l.value, preset: l.id } })}
                    className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                      (project.layout?.preset ?? "full-chat") === l.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="mono-label mb-1.5 text-muted-foreground">Câmera</p>
              <div className="grid grid-cols-3 gap-1.5">
                {CAMERA_MODES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.hint}
                    onClick={() =>
                      patch({ camera: { ...DEFAULT_CAMERA, ...project.camera, mode: c.id } })
                    }
                    className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                      (project.camera?.mode ?? "off") === c.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {(project.camera?.mode ?? "off") !== "off" && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="mono-label shrink-0 text-[10px] text-muted-foreground">força</span>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={project.camera?.intensity ?? DEFAULT_CAMERA.intensity}
                    onChange={(e) =>
                      patch({
                        camera: {
                          ...DEFAULT_CAMERA,
                          ...project.camera,
                          intensity: Number(e.target.value),
                        },
                      })
                    }
                    className="flex-1"
                    aria-label="Força do movimento de câmera"
                  />
                  <span className="w-10 text-right text-[11px] text-muted-foreground">
                    {Math.round((project.camera?.intensity ?? DEFAULT_CAMERA.intensity) * 100)}%
                  </span>
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                "Com cortes" alterna meia tela e tela cheia a cada fala.
              </p>
            </div>

            <div className="mt-3">
              <p className="mono-label mb-1.5 text-muted-foreground">Entrada das bolhas</p>
              <div className="grid grid-cols-3 gap-1.5">
                {ANIMATION_PRESETS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => patch({ animation: a.id })}
                    className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                      (project.animation ?? "soft-spring") === a.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
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
              </>
            )}
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
                  checked={project.timing.humanTyping ?? true}
                  onChange={(e) =>
                    patch({ timing: { ...project.timing, humanTyping: e.target.checked } })
                  }
                />
                ritmo humano (calcula pelo texto)
              </label>
              <Range
                label="Respiro ao trocar de pessoa"
                value={project.timing.senderSwitchMs ?? 180}
                min={0}
                max={1500}
                step={20}
                suffix="ms"
                onChange={(v) => patch({ timing: { ...project.timing, senderSwitchMs: v } })}
              />

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
              <MusicPanel
                project={project}
                patch={patch}
                uploading={uploading}
                onUpload={(file) => void handleMusic(file)}
              />
              <div>
                <p className="mb-1 text-muted-foreground">Qualidade do vídeo</p>
                <select
                  value={`${project.render.height}x${project.render.fps}`}
                  onChange={(e) => {
                    const [h, f] = e.target.value.split("x").map(Number);
                    patch({ render: { ...project.render, height: h!, fps: f! } });
                  }}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                  aria-label="Qualidade do vídeo"
                >
                  <option value="1280x30">720p 30 — mais rápido</option>
                  <option value="1920x30">1080p 30 — recomendado</option>
                  <option value="1920x60">1080p 60 — movimento mais suave</option>
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
                <Range
                  label="Respiro depois desta mensagem"
                  value={selectedMessage.pauseAfterMs ?? project.timing.gapMs}
                  min={0}
                  max={6000}
                  step={100}
                  suffix="ms"
                  onChange={(v) => updateMessage(selectedMessage.id, { pauseAfterMs: v })}
                />
                {messageKind(selectedMessage.kind).canReply && (
                  <div>
                    <p className="mb-1 text-muted-foreground">Responder a</p>
                    <select
                      value={selectedMessage.replyToId ?? ""}
                      onChange={(e) =>
                        updateMessage(selectedMessage.id, { replyToId: e.target.value || null })
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                      aria-label="Responder a outra mensagem"
                    >
                      <option value="">nenhuma</option>
                      {project.messages
                        .filter((q) => q.id !== selectedMessage.id && q.kind !== "system")
                        .map((q) => (
                          <option key={q.id} value={q.id}>
                            {(q.text || messageKind(q.kind).label).slice(0, 40)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                {selectedMessage.kind === "voice" && (
                  <Range
                    label="Duração do recado de voz"
                    value={Math.round(voiceSeconds(selectedMessage))}
                    min={1}
                    max={120}
                    step={1}
                    suffix="s"
                    onChange={(v) => updateMessage(selectedMessage.id, { durationSec: v })}
                  />
                )}
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selectedMessage.emphasis ?? false}
                    onChange={(e) => updateMessage(selectedMessage.id, { emphasis: e.target.checked })}
                  />
                  momento de peso (segura mais na tela)
                </label>
                <div>
                  <p className="mb-1 text-muted-foreground">Reação nesta mensagem</p>
                  <div className="flex flex-wrap gap-1">
                    {["", "❤️", "😂", "😮", "😢", "👍", "🔥"].map((emoji) => (
                      <button
                        key={emoji || "none"}
                        type="button"
                        onClick={() => updateMessage(selectedMessage.id, { reaction: emoji || null })}
                        className={`rounded-md border px-2 py-1 ${
                          (selectedMessage.reaction ?? "") === emoji
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                      >
                        {emoji || "nenhuma"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-muted-foreground">Hora desta mensagem</p>
                  <input
                    value={selectedMessage.time ?? ""}
                    onChange={(e) => updateMessage(selectedMessage.id, { time: e.target.value || null })}
                    placeholder="automática"
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                    aria-label="Hora desta mensagem"
                  />
                </div>
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

        {/* ------------------------------------------ layouts de criador */}
        <div className="lg:col-span-2 xl:col-span-3">
          <CreatorLayouts
            project={project}
            plan={plan}
            frame={frame}
            onSelect={(preset) => {
              const option = CREATOR_LAYOUTS.find((l) => l.id === preset);
              if (option) patch({ ...(option.apply ?? {}), layout: { ...option.value, preset } });
            }}
          />
        </div>

        {/* ------------------------------------------------ linha do tempo */}
        <div className="lg:col-span-2 xl:col-span-3">
          <ChatSceneTimeline
            project={project}
            plan={plan}
            frame={frame}
            selected={selected}
            onSeek={(f) => {
              setPlaying(false);
              setFrame(f);
            }}
            onSelect={setSelected}
          />
        </div>
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
