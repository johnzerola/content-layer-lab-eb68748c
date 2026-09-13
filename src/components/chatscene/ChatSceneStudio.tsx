/**
 * Analogue ChatScene — tela única de criação.
 *
 * Modo Simples: escrever a conversa, escolher o visual, ver e exportar.
 * Modo Estúdio: abre o ajuste fino de ritmo e das mensagens.
 * Todo estado vive no documento `ChatSceneProject`; nenhuma cópia paralela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProjectHistory } from "./useProjectHistory";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  Mic,
  MessageSquare,
  Palette,
  Download,
  Image as ImageIcon,
  Loader2,
  Redo2,
  Save,
  Undo2,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui/base";
import { ChatScenePreview } from "@/components/chatscene/ChatScenePreview";
import { ChatSceneTimeline } from "@/components/chatscene/ChatSceneTimeline";
import { CreatorLayouts } from "@/components/chatscene/CreatorLayouts";
import { VoicePanel } from "@/components/chatscene/VoicePanel";
import { VoiceUploadPanel } from "@/components/chatscene/VoiceUploadPanel";
import { MessagesPanel } from "@/components/chatscene/MessagesPanel";
import { ParticipantsPanel } from "@/components/chatscene/ParticipantsPanel";
import { BrandPanel } from "@/components/chatscene/BrandPanel";
import { ThemePanel } from "@/components/chatscene/ThemePanel";
import { MusicPanel } from "@/components/chatscene/MusicPanel";
import { StoryPanel } from "@/components/chatscene/StoryPanel";
import { generateStory } from "@/lib/chatscene/story.functions";
import { storyToProject, timingForDuration, type StoryBrief } from "@/lib/chatscene/story";

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
  clipDurationMs,
  createGatewayVoiceProvider,
  decodeClip,
  generateCast,
  playClip,
  previewVoice,
  speakingMessages,
  type VoiceClip,
} from "@/lib/chatscene/voice-cast";
import { effectiveVoice, voiceProfileOf } from "@/lib/chatscene/voice-resolution";

import { loadMusic, mixConversationAudio } from "@/lib/chatscene/audio-mix";
import { CAMERA_MODES, DEFAULT_CAMERA } from "@/lib/chatscene/camera";
import {
  DEFAULT_VOICE,
  DEFAULT_VOICE_MIX,
  PITCH_MAX,
  PITCH_MIN,
  VOICE_PRESETS,
  VOICE_STYLES,
  speakableText,
  voiceKey,
  type VoiceProfile,
} from "@/lib/chatscene/voice";
import { CHAT_THEMES } from "@/lib/chatscene/theme";
import { loadLocalDraft, saveLocalDraft } from "@/lib/chatscene/serialize";
import { parseConversationScript } from "@/lib/chatscene/import-script";
import {
  ANIMATION_PRESETS,
  BACKGROUND_PRESETS,
  DEFAULT_BRANDING,
  DEFAULT_LAYOUT,
  DEFAULT_HEADER,
  CREATOR_LAYOUTS,
  LAYOUT_PRESETS,
  createChatSceneProject,
  createDemoChatSceneProject,
  createMessage,
  createParticipant,
  participantOf,
  renderSize,
  createThread,
  threadsOf,
  type ChatSceneAspect,
  type ChatMessage,
  type ChatSceneProject,
  type ChatSceneThread,
} from "@/lib/chatscene/types";

const PALETTE = ["#7c5cff", "#ff5c8a", "#22c08a", "#f2b705", "#4ec3ff", "#ff8a4c"];

type StudioTab =
  | "historia"
  | "participantes"
  | "mensagens"
  | "tempo"
  | "fundo"
  | "vozes"
  | "estilo"
  | "exportar";

/** Abas do editor: cada assunto em uma tela, com a prévia sempre ao lado. */
const STUDIO_TABS: { id: StudioTab; label: string; icon: typeof Palette }[] = [
  { id: "historia", label: "História", icon: Wand2 },
  { id: "participantes", label: "Participantes", icon: Users },
  { id: "mensagens", label: "Mensagens", icon: MessageSquare },
  { id: "tempo", label: "Linha do tempo", icon: Clock },
  { id: "fundo", label: "Fundo", icon: ImageIcon },
  { id: "vozes", label: "Voice Cast", icon: Mic },
  { id: "estilo", label: "Estilo", icon: Palette },
  { id: "exportar", label: "Exportar", icon: Download },
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
  const [script, setScript] = useState("");
  const [tab, setTab] = useState<StudioTab>("mensagens");
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
  const [castFailures, setCastFailures] = useState<{ id: string; reason: string }[]>([]);
  /** fala tocando agora no painel de vozes */
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  /** história sendo escrita pela IA */
  const [storyBusy, setStoryBusy] = useState(false);

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

  const { undo, redo, canUndo, canRedo } = useProjectHistory(project, setProject);

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

  /** Imagem estática de fundo enviada pelo próprio criador. */
  const handleBackgroundImage = useCallback(async (file: File) => {
    setUploading("background-image");
    try {
      const { asset, library: next } = await addFileToLibrary(file, "background");
      setLibrary(next);
      setProject((prev) => ({
        ...prev,
        background: { kind: "image", imageUrl: asset.url },
      }));
      if (asset.temporary) {
        toast.warning("A imagem ficou só nesta sessão; envie de novo antes de salvar a conversa.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível usar esta imagem.");
    } finally {
      setUploading(null);
    }
  }, []);

  /** Vídeo de fundo enviado pelo próprio criador. */
  const handleBackgroundVideo = useCallback(async (file: File) => {
    setUploading("background-video");
    try {
      const { asset, library: next } = await addFileToLibrary(file, "background");
      setLibrary(next);
      setProject((prev) => ({
        ...prev,
        background: { kind: "video", videoUrl: asset.url, loop: true },
      }));
      if (asset.temporary) {
        toast.warning("O vídeo ficou só nesta sessão; envie de novo antes de salvar a conversa.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível usar este vídeo.");
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

  const importScript = useCallback(() => {
    const text = script;
    if (!text.trim()) return;
    setProject((prev) => {
      const parsed = parseConversationScript(text, prev);
      if (!parsed.messages.length) return prev;
      return {
        ...prev,
        participants: parsed.participants,
        messages: [...prev.messages, ...parsed.messages],
      };
    });
    setScript("");
    toast.success("Conversa adicionada.");
  }, [script]);

  const addThread = useCallback(() => {
    setProject((prev) => {
      const threads = threadsOf(prev);
      return {
        ...prev,
        threads: [...threads, createThread({ name: `Conversa ${threads.length + 1}` })],
      };
    });
  }, []);

  const updateThread = useCallback((id: string, changes: Partial<ChatSceneThread>) => {
    setProject((prev) => ({
      ...prev,
      threads: threadsOf(prev).map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }));
  }, []);

  const removeThread = useCallback((id: string) => {
    setProject((prev) => {
      const threads = threadsOf(prev);
      if (threads.length < 2) return prev;
      const rest = threads.filter((t) => t.id !== id);
      const fallback = rest[0]!.id;
      return {
        ...prev,
        threads: rest,
        messages: prev.messages.map((m) => (m.threadId === id ? { ...m, threadId: fallback } : m)),
      };
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

  /** Arrastar e soltar: leva a mensagem para a posição solta. */
  const reorderMessage = useCallback((from: number, to: number) => {
    setProject((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.messages.length || to >= prev.messages.length) {
        return prev;
      }
      const messages = [...prev.messages];
      const [item] = messages.splice(from, 1);
      messages.splice(to, 0, item!);
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
  const storyFn = useServerFn(generateStory);

  /** Modo simples: a IA escreve a história e o documento inteiro é remontado. */
  const handleGenerateStory = useCallback(
    async (brief: StoryBrief) => {
      setStoryBusy(true);
      try {
        const script = await storyFn({ data: brief });
        setProject((prev) =>
          storyToProject({ ...prev, timing: timingForDuration(brief.durationSec) }, script),
        );
        setSelected(null);
        setFrame(0);
        setPlaying(false);
        setTab("mensagens");
        toast.success("História criada. Ajuste o que quiser nas abas.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível criar a história.");
      } finally {
        setStoryBusy(false);
      }
    },
    [storyFn],
  );
  const voiceProvider = useMemo(
    () => createGatewayVoiceProvider((input) => speakFn({ data: input })),
    [speakFn],
  );
  const effectiveClips = useMemo(() => {
    const next = new Map<string, VoiceClip>();
    for (const message of project.messages) {
      const clip = clips.get(message.id);
      if (!clip) continue;
      if (clip.key.startsWith("upload:")) {
        next.set(message.id, clip);
        continue;
      }
      const voice = effectiveVoice(project, message);
      const text = speakableText(message.kind, message.text);
      if (voice && clip.key === voiceKey(text, voice.profile, voice.direction)) next.set(message.id, clip);
    }
    return next;
  }, [clips, project]);

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
      (m) => {
        const participant = project.participants.find((p) => p.id === m.message.participantId);
        return participant ? voiceProfileOf(project, participant) : null;
      },
    );
    if (!withVoice.length) {
      toast.error("Escolha uma voz para pelo menos uma pessoa da conversa.");
      return;
    }
    setPlaying(false);
    setCastFailures([]);
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
        setCastFailures(result.failures);
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

  /** Áudio próprio: entra no lugar da voz gerada e manda no tempo da mensagem. */
  const handleVoiceFile = useCallback(
    async (messageId: string, file: File) => {
      setUploading(`voice-${messageId}`);
      try {
        const clip = await decodeClip(`upload:${messageId}:${file.name}:${file.size}`, file);
        setClips((prev) => {
          const next = new Map(prev);
          next.set(messageId, clip);
          return next;
        });
        setProject((prev) => {
          const message = prev.messages.find((m) => m.id === messageId);
          const voice = message ? effectiveVoice(prev, message) : null;
          return applyVoiceDurations(prev, {
            [messageId]: clipDurationMs(clip, voice?.profile ?? null),
          });
        });
        toast.success("Áudio aplicado — o tempo da mensagem já acompanha a fala.");
      } catch {
        toast.error("Não foi possível ler este áudio. Use MP3, M4A, WAV ou OGG.");
      } finally {
        setUploading(null);
      }
    },
    [],
  );

  const handleRemoveVoiceClip = useCallback((messageId: string) => {
    setClips((prev) => {
      const next = new Map(prev);
      next.delete(messageId);
      return next;
    });
    updateMessage(messageId, { voiceMs: null });
  }, [updateMessage]);

  const handlePlayClip = useCallback(
    (messageId: string) => {
      const clip = clips.get(messageId);
      if (!clip) return;
      stopPreviewRef.current?.();
      const message = project.messages.find((m) => m.id === messageId);
      const voice = message ? effectiveVoice(project, message) : null;
      const stop = playClip(clip, voice?.profile ?? null);
      setPlayingClip(messageId);
      stopPreviewRef.current = () => {
        stop();
        setPlayingClip(null);
      };
    },
    [clips, project],
  );

  const handleStopClip = useCallback(() => {
    stopPreviewRef.current?.();
    stopPreviewRef.current = null;
    setPlayingClip(null);
  }, []);


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
      if (effectiveClips.size || mix.musicUrl || project.sound?.enabled) {
        try {
          const music = mix.musicUrl ? await loadMusic(mix.musicUrl) : null;
          audio = await mixConversationAudio({ project, plan, clips: effectiveClips, settings: mix, music });
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
  }, [project, plan, effectiveClips]);

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
          <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} aria-label="Desfazer">
            <Undo2 className="mr-1.5 size-4" />
            Desfazer
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} aria-label="Refazer">
            <Redo2 className="mr-1.5 size-4" />
            Refazer
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/chatscene/comparar">Comparar com referência</a>
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* --------------------------------------------------- editor em abas */}
        <section className="glass rounded-2xl border border-border p-4">
          <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Abas do editor">
            {STUDIO_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    tab === t.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {tab === "historia" && (
            <StoryPanel busy={storyBusy} onGenerate={(brief) => void handleGenerateStory(brief)} />
          )}

          {tab === "participantes" && (
            <ParticipantsPanel
              project={project}
              patch={patch}
              uploading={uploading}
              onAvatar={(target, file) => void handleAvatarUpload(target, file)}
              onAdd={addParticipant}
              onRemove={removeParticipant}
            />
          )}

          {tab === "mensagens" && (
            <MessagesPanel
              project={project}
              selected={selected}
              onSelect={setSelected}
              updateMessage={updateMessage}
              removeMessage={removeMessage}
              moveMessage={moveMessage}
              duplicateMessage={duplicateMessage}
              reorderMessage={reorderMessage}
              addMessage={addMessage}
              addThread={addThread}
              updateThread={updateThread}
              removeThread={removeThread}
              loadDemo={() => {
                setProject(createDemoChatSceneProject());
                setSelected(null);
                setFrame(0);
              }}
              uploading={uploading}
              library={library}
              onUpload={(id, file) => void handleUpload(id, file)}
              script={script}
              onScript={setScript}
              onImportScript={importScript}
            />
          )}

          {tab === "tempo" && (
            <div className="flex flex-col gap-4">
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

              <div className="flex flex-col gap-3 text-xs">
                <p className="mono-label text-muted-foreground">Ritmo da conversa</p>
                <div>
                  <label className="mb-1 flex items-center justify-between text-muted-foreground">
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
              </div>

              <div>
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
                    <div className="rounded-lg border border-border bg-background/35 p-2.5">
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedMessage.voiceDirection)}
                          onChange={(e) => updateMessage(selectedMessage.id, {
                            voiceDirection: e.target.checked
                              ? { emotion: "neutral", speedMultiplier: 1, energyMultiplier: 1, pauseBeforeMs: 0, pauseAfterMs: 0 }
                              : null,
                          })}
                        />
                        Direção de voz desta mensagem
                      </label>
                      {selectedMessage.voiceDirection ? (
                        <div className="mt-2 space-y-2">
                          <select
                            value={selectedMessage.voiceDirection.emotion ?? "neutral"}
                            onChange={(e) => updateMessage(selectedMessage.id, { voiceDirection: { ...selectedMessage.voiceDirection, emotion: e.target.value as import("@/lib/chatscene/voice").VoiceEmotion } })}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                            aria-label="Emoção desta mensagem"
                          >
                            <option value="neutral">Neutra</option><option value="happy">Feliz</option><option value="excited">Empolgada</option><option value="serious">Séria</option><option value="nervous">Nervosa</option><option value="annoyed">Incomodada</option><option value="angry-theatrical">Brava teatral</option><option value="sad">Triste</option><option value="sarcastic">Sarcástica</option><option value="surprised">Surpresa</option><option value="whisper-like">Como segredo</option>
                          </select>
                          <Range label="Velocidade da fala" value={selectedMessage.voiceDirection.speedMultiplier ?? 1} min={0.7} max={1.3} step={0.05} suffix="×" onChange={(v) => updateMessage(selectedMessage.id, { voiceDirection: { ...selectedMessage.voiceDirection, speedMultiplier: v } })} />
                          <Range label="Energia da fala" value={selectedMessage.voiceDirection.energyMultiplier ?? 1} min={0.6} max={1.4} step={0.05} suffix="×" onChange={(v) => updateMessage(selectedMessage.id, { voiceDirection: { ...selectedMessage.voiceDirection, energyMultiplier: v } })} />
                          <Range label="Pausa da voz antes" value={selectedMessage.voiceDirection.pauseBeforeMs ?? 0} min={0} max={3000} step={100} suffix="ms" onChange={(v) => updateMessage(selectedMessage.id, { voiceDirection: { ...selectedMessage.voiceDirection, pauseBeforeMs: v } })} />
                          <Range label="Pausa da voz depois" value={selectedMessage.voiceDirection.pauseAfterMs ?? 0} min={0} max={3000} step={100} suffix="ms" onChange={(v) => updateMessage(selectedMessage.id, { voiceDirection: { ...selectedMessage.voiceDirection, pauseAfterMs: v } })} />
                        </div>
                      ) : null}
                    </div>
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
                    Clique em uma barra da linha do tempo para ajustar o tempo daquela mensagem.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "fundo" && (
            <div>
              <p className="mono-label mb-1.5 text-muted-foreground">Galeria de fundos</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="list" aria-label="Fundos prontos">
                {BACKGROUND_PRESETS.map((b) => {
                  const active =
                    (project.background?.kind ?? "theme") === b.value.kind &&
                    (project.background?.color ?? null) === (b.value.color ?? null) &&
                    (project.background?.imageUrl ?? null) === (b.value.imageUrl ?? null) &&
                    (project.background?.videoUrl ?? null) === (b.value.videoUrl ?? null);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => patch({ background: { ...b.value } })}
                      aria-pressed={active}
                      aria-label={`Usar fundo ${b.label}`}
                      role="listitem"
                      className={`group overflow-hidden rounded-lg border text-left text-xs transition ${
                        active ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span className="relative block aspect-[9/16] overflow-hidden bg-muted">
                        {b.value.kind === "video" && b.value.videoUrl ? (
                          <video src={b.value.videoUrl} muted loop autoPlay playsInline preload="auto" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : b.value.kind === "image" && b.value.imageUrl ? (
                          <img src={b.value.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : b.value.kind === "gradient" ? (
                          <span className="block size-full" style={{ background: `linear-gradient(145deg, ${b.value.color}, ${b.value.colorB})` }} />
                        ) : b.value.kind === "solid" ? (
                          <span className="block size-full" style={{ backgroundColor: b.value.color ?? undefined }} />
                        ) : (
                          <span className="grid size-full place-items-center bg-secondary text-muted-foreground">Tema</span>
                        )}
                        {b.value.kind === "video" ? <span className="absolute bottom-1.5 left-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-medium text-foreground">LOOP</span> : null}
                        {b.value.kind === "image" ? <span className="absolute bottom-1.5 left-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-medium text-foreground">PARADO</span> : null}
                        {active ? <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">ATIVO</span> : null}
                      </span>
                      <span className="block px-2 py-1.5 font-medium">{b.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-lg border border-dashed border-border bg-background/35 p-3">
                <p className="text-xs font-medium">Usar meu próprio vídeo ou imagem</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Envie um arquivo vertical (9:16) do seu computador para usar como fundo da conversa.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs hover:border-primary">
                    {uploading === "background-image" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="size-3.5" />
                    )}
                    Escolher imagem
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      aria-label="Enviar imagem de fundo"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleBackgroundImage(file);
                      }}
                    />
                  </label>
                  {project.background?.kind === "image" ? (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline hover:text-primary"
                      onClick={() => patch({ background: { kind: "theme" } })}
                    >
                      tirar minha imagem
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs hover:border-primary">
                    {uploading === "background-video" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="size-3.5" />
                    )}
                    Escolher vídeo
                    <input
                      type="file"
                      className="hidden"
                      accept="video/*"
                      aria-label="Enviar vídeo de fundo"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleBackgroundVideo(file);
                      }}
                    />
                  </label>
                  {project.background?.kind === "video" &&
                  !BACKGROUND_PRESETS.some((b) => b.value.videoUrl === project.background?.videoUrl) ? (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground underline hover:text-primary"
                      onClick={() => patch({ background: { kind: "theme" } })}
                    >
                      tirar meu vídeo
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border bg-background/35 p-3">
                <label className="flex items-center justify-between gap-3 text-xs">
                  Repetir vídeo
                  <input
                    type="checkbox"
                    checked={project.background?.kind === "video" ? project.background.loop !== false : false}
                    disabled={project.background?.kind !== "video"}
                    onChange={(e) => project.background?.kind === "video" && patch({ background: { ...project.background, loop: e.target.checked } })}
                  />
                </label>
              </div>

              <div className="mt-3 rounded-lg border border-border bg-background/35 p-3">
                <p className="mono-label mb-2 text-muted-foreground">Altura da janela de conversa</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Altura da janela de conversa">
                  {[0.4, 0.5, 0.6].map((ratio) => {
                    const active = Math.abs((project.layout?.height ?? 1) - ratio) < 0.02;
                    return (
                      <button
                        key={ratio}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          patch({
                            layout: { ...(project.layout ?? DEFAULT_LAYOUT), height: ratio, autoHeight: false },
                          })
                        }
                        className={`rounded-md border px-2.5 py-1 text-xs ${
                          active
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border text-muted-foreground hover:border-primary"
                        }`}
                      >
                        {Math.round(ratio * 100)}%
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 space-y-2">
                <label className="block text-[11px] text-muted-foreground">
                  Aproximar fundo
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.01}
                    value={project.layout?.backgroundScale ?? 1}
                    onChange={(e) =>
                      patch({
                        layout: {
                          ...(project.layout ?? DEFAULT_LAYOUT),
                          backgroundScale: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-1 w-full"
                    aria-label="Aproximar fundo"
                  />
                </label>
                <label className="block text-[11px] text-muted-foreground">
                  Subir ou descer fundo
                  <input
                    type="range"
                    min={-0.3}
                    max={0.3}
                    step={0.01}
                    value={project.layout?.backgroundOffsetY ?? 0}
                    onChange={(e) =>
                      patch({
                        layout: {
                          ...(project.layout ?? DEFAULT_LAYOUT),
                          backgroundOffsetY: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-1 w-full"
                    aria-label="Subir ou descer fundo"
                  />
                </label>
                <label className="block text-[11px] text-muted-foreground">
                  Desfoque do fundo
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={project.layout?.backgroundBlur ?? 0}
                    onChange={(e) =>
                      patch({
                        layout: {
                          ...(project.layout ?? DEFAULT_LAYOUT),
                          backgroundBlur: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-1 w-full"
                    aria-label="Desfoque do fundo"
                  />
                </label>
              </div>

              <div className="mt-4">
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
            </div>
          )}

          {tab === "vozes" && (
            <div>
              <VoicePanel
                project={project}
                patch={patch}
                clipCount={effectiveClips.size}
                castState={castState}
                castProgress={castProgress}
                onGenerate={() => void handleGenerateVoices()}
                previewing={previewingVoice}
                onPreview={(id, profile) => void handlePreviewVoice(id, profile)}
                failures={castFailures}
                onRetry={() => void handleGenerateVoices()}
                onContinue={() => setCastFailures([])}
                onChangeVoice={() => setCastFailures([])}
              />
              <VoiceUploadPanel
                project={project}
                clips={clips}
                uploading={uploading}
                playingId={playingClip}
                onUpload={(id, file) => void handleVoiceFile(id, file)}
                onRemove={handleRemoveVoiceClip}
                onPlay={handlePlayClip}
                onStop={handleStopClip}
              />
              <div className="mt-4 border-t border-border pt-3 text-xs">
                <MusicPanel
                  project={project}
                  patch={patch}
                  uploading={uploading}
                  onUpload={(file) => void handleMusic(file)}
                />
              </div>
            </div>
          )}

          {tab === "estilo" && (
            <div>
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
                    onChange={(e) => patch({ render: { ...project.render, safeZones: e.target.checked } })}
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
                      onClick={() => patch({ camera: { ...DEFAULT_CAMERA, ...project.camera, mode: c.id } })}
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
                <p className="mono-label mb-1.5 text-muted-foreground">Sons da conversa</p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={project.sound?.enabled ?? false}
                    onChange={(e) =>
                      patch({
                        sound: { enabled: e.target.checked, volume: project.sound?.volume ?? 0.5 },
                      })
                    }
                  />
                  Tocar som quando a mensagem chega
                </label>
                {project.sound?.enabled ? (
                  <label className="mt-1.5 block text-[11px] text-muted-foreground">
                    Volume dos sons
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={project.sound?.volume ?? 0.5}
                      onChange={(e) => patch({ sound: { enabled: true, volume: Number(e.target.value) } })}
                      className="mt-1 w-full"
                      aria-label="Volume dos sons"
                    />
                  </label>
                ) : null}
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <ThemePanel project={project} patch={patch} />
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <BrandPanel
                  project={project}
                  patch={patch}
                  uploading={uploading}
                  onLogo={(file) => void handleLogo(file)}
                  onHeaderLogo={(file) => void handleHeaderImage(file, "logo")}
                  onHeaderBackground={(file) => void handleHeaderImage(file, "background")}
                />
              </div>
            </div>
          )}

          {tab === "exportar" && (
            <div className="flex flex-col gap-3 text-xs">
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
              <p className="text-muted-foreground">
                Duração final: {(plan.durationMs / 1000).toFixed(1)}s · {width}×{height} · {plan.fps} quadros
                por segundo.
              </p>
              <Button onClick={() => void handleExport()} disabled={exporting}>
                {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
                {exporting ? `Exportando ${Math.round(progress * 100)}%` : "Exportar MP4"}
              </Button>

              {exportUrl && (
                <div className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <p className="mono-label text-muted-foreground">Vídeo pronto</p>
                    <a
                      href={exportUrl}
                      download={exportName}
                      className="ml-auto text-primary underline-offset-4 hover:underline"
                    >
                      Baixar de novo
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(exportUrl);
                        setExportUrl(null);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Fechar
                    </button>
                  </div>
                  <video
                    src={exportUrl}
                    controls
                    playsInline
                    aria-label="Vídeo exportado"
                    className="mx-auto max-h-[60vh] w-auto rounded-lg border border-border bg-black"
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* ----------------------------------------------------------- prévia */}
        <section className="glass h-fit rounded-2xl border border-border p-4 lg:sticky lg:top-4">
          <ChatScenePreview
            project={project}
            plan={plan}
            frame={frame}
            playing={playing}
            onFrame={setFrame}
            onPlaying={setPlaying}
            clips={effectiveClips}
          />
        </section>
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
