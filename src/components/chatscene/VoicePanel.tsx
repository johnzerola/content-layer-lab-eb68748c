import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/base";
import {
  attachElevenLabsVoice,
  attachPreset,
  preselectLocalVoices,
  voiceProfileOf,
} from "@/lib/chatscene/voice-resolution";
import { PROVIDER_CAPABILITIES } from "@/lib/chatscene/voice-providers";
import { missingSpeakingMessages } from "@/lib/chatscene/voice-cast";
import {
  DEFAULT_VOICE_MIX,
  PITCH_MAX,
  PITCH_MIN,
  VOICE_PRESETS,
  profileFromPreset,
  voiceDisplayLabel,
  voicePreset,
  type VoiceProfile,
} from "@/lib/chatscene/voice";
import { getVoiceEngineStatus } from "@/lib/chatscene/voice.functions";
import type { ChatSceneProject } from "@/lib/chatscene/types";
import {
  VOICE_TRANSFORM_PRESETS,
  effectiveTransformPitch,
  selectionFromTransformPreset,
  voiceTransformPreset,
  type VoiceTransformConfig,
  type VoiceTransformMode,
} from "@/lib/chatscene/voice-transform";
import {
  connectElevenLabs,
  getElevenLabsConnection,
  listElevenLabsVoices,
} from "@/lib/elevenlabs.functions";
import type { ElevenLabsVoice } from "@/lib/elevenlabs.server";

export interface VoicePanelProps {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
  clipCount: number;
  castState: string;
  castProgress: { done: number; total: number };
  onGenerate: () => void;
  previewing: string | null;
  onPreview: (participantId: string, profile: VoiceProfile, text?: string) => void;
  failures: { id: string; reason: string }[];
  onRetry: () => void;
  onContinue: () => void;
  onChangeVoice: () => void;
}

export function VoicePanel(props: VoicePanelProps) {
  const {
    project,
    patch,
    clipCount,
    castState,
    castProgress,
    onGenerate,
    previewing,
    onPreview,
    failures,
    onRetry,
    onContinue,
    onChangeVoice,
  } = props;
  const setProject = (next: ChatSceneProject) => patch(next);
  const connectionFn = useServerFn(getElevenLabsConnection);
  const connectFn = useServerFn(connectElevenLabs);
  const voicesFn = useServerFn(listElevenLabsVoices);
  const engineStatusFn = useServerFn(getVoiceEngineStatus);
  const [installedLocalVoices, setInstalledLocalVoices] = useState<string[] | null>(null);
  const [pitchTransformAvailable, setPitchTransformAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void engineStatusFn().then((status) => {
      if (active) {
        setInstalledLocalVoices(status.piperVoices);
        setPitchTransformAvailable(status.pitchTransform);
      }
    }).catch(() => {
      if (active) {
        setInstalledLocalVoices([]);
        setPitchTransformAvailable(false);
      }
    });
    return () => { active = false; };
  }, [engineStatusFn]);
  const [elevenConnection, setElevenConnection] = useState<
    "checking" | "connected" | "disconnected" | "error"
  >("checking");
  const [elevenConnectionError, setElevenConnectionError] = useState("");
  const [elevenVoices, setElevenVoices] = useState<ElevenLabsVoice[]>([]);
  const [elevenCatalogLoaded, setElevenCatalogLoaded] = useState(false);
  const [elevenLoading, setElevenLoading] = useState(false);
  const [elevenError, setElevenError] = useState("");
  const [elevenApiKey, setElevenApiKey] = useState("");
  const [elevenConnecting, setElevenConnecting] = useState(false);
  const [showElevenKey, setShowElevenKey] = useState(false);
  const [showElevenForm, setShowElevenForm] = useState(true);
  const connectionRequest = useRef(0);
  const latestProject = useRef(project);
  latestProject.current = project;
  const assignedProject = useRef<string | null>(null);
  useEffect(() => {
    if (assignedProject.current === project.id) return;
    assignedProject.current = project.id;
    const next = preselectLocalVoices(project);
    if (next !== project) patch(next);
  }, [project, patch]);
  const checkElevenLabsConnection = useCallback(async () => {
    const request = ++connectionRequest.current;
    setElevenConnection("checking");
    setElevenConnectionError("");
    try {
      const status = await connectionFn();
      if (request !== connectionRequest.current) return;
      setElevenConnection(status.connected ? "connected" : "disconnected");
      if (!status.connected) {
        setElevenVoices([]);
        setElevenCatalogLoaded(false);
      }
    } catch (error) {
      if (request !== connectionRequest.current) return;
      setElevenConnection("error");
      setElevenConnectionError(
        error instanceof Error
          ? error.message
          : "Não foi possível verificar sua conexão ElevenLabs.",
      );
    }
  }, [connectionFn]);
  useEffect(() => {
    void checkElevenLabsConnection();
    return () => {
      connectionRequest.current += 1;
    };
  }, [checkElevenLabsConnection]);
  const loadElevenLabsVoices = async () => {
    if (elevenLoading) return;
    setElevenLoading(true);
    setElevenError("");
    try {
      const voices = await voicesFn();
      setElevenVoices(voices);
      setElevenCatalogLoaded(true);
    } catch (error) {
      setElevenError(
        error instanceof Error ? error.message : "Não foi possível carregar as vozes.",
      );
    } finally {
      setElevenLoading(false);
    }
  };
  const connectElevenLabsAccount = async () => {
    const apiKey = elevenApiKey.trim();
    if (elevenConnecting || apiKey.length < 12) {
      if (apiKey.length < 12) setElevenError("Cole uma chave de API válida da ElevenLabs.");
      return;
    }
    setElevenConnecting(true);
    setElevenError("");
    try {
      await connectFn({ data: { apiKey, accountLabel: "Minha ElevenLabs" } });
      const voices = await voicesFn();
      setElevenConnection("connected");
      setElevenConnectionError("");
      setElevenVoices(voices);
      setElevenCatalogLoaded(true);
      setElevenApiKey("");
      setShowElevenKey(false);
      setShowElevenForm(false);
    } catch (error) {
      setElevenError(
        error instanceof Error ? error.message : "Não foi possível conectar sua ElevenLabs.",
      );
    } finally {
      setElevenConnecting(false);
    }
  };
  const applyAnimatedElevenLabsCast = () => {
    if (!elevenVoices.length) return;
    const used = new Set<string>();
    let next = latestProject.current;
    for (const participant of next.participants) {
      const current = voiceProfileOf(next, participant);
      const choice = bestElevenLabsVoice(elevenVoices, current, used);
      if (!choice) continue;
      used.add(choice.id);
      next = attachElevenLabsVoice(next, participant.id, choice);
    }
    setProject(next);
  };
  const updateProfile = (id: string, changes: Partial<VoiceProfile>) => {
    const profiles = (project.voiceProfiles ?? []).map((profile) =>
      profile.id === id ? { ...profile, ...changes } : profile,
    );
    const participantIds = new Set(
      project.participants.filter((p) => p.voiceProfileId === id).map((p) => p.id),
    );
    patch({
      voiceProfiles: profiles,
      participants: project.participants.map((p) =>
        p.voiceProfileId === id
          ? {
              ...p,
              voice: {
                ...voiceProfileOf({ ...project, voiceProfiles: profiles }, p),
                ...changes,
              } as VoiceProfile,
            }
          : p,
      ),
      messages: project.messages.map((message) =>
        participantIds.has(message.participantId) ? { ...message, voiceMs: null } : message,
      ),
    });
  };
  const missingItems = missingSpeakingMessages(project);
  const missing = missingItems.length;
  const characters = missingItems.reduce((sum, item) => sum + item.text.length, 0);
  const simpleTransformIds = [
    "dialogue_fast",
    "adam_natural",
    "adam_young",
    "adam_roblox_teen",
    "adam_child_male",
    "adam_deep",
    "adam_mature_character",
  ];
  const labTransformIds = [
    "dialogue_fast",
    "adam_natural",
    "adam_young",
    "adam_roblox_teen",
    "adam_child_male",
    "adam_child_pitch_only",
  ];
  const updateTransform = (voice: VoiceProfile, changes: Partial<VoiceTransformConfig>) => {
    if (!voice.id) return;
    const current = voice.transform ?? selectionFromTransformPreset("adam_natural");
    updateProfile(voice.id, {
      transform: {
        ...current,
        presetId: current.presetId,
        config: { ...current.config, ...changes },
      },
    });
  };
  const setVoicePitch = (voice: VoiceProfile, semitones: number) => {
    if (!voice.id) return;
    const current = voice.transform ?? selectionFromTransformPreset("adam_natural");
    const speed = current.config.speedMultiplier;
    updateProfile(voice.id, {
      pitch: 0,
      transform: semitones === 0 && (!voice.transform || voice.transform.presetId === "user-pitch")
        ? undefined
        : {
            ...current,
            presetId: "user-pitch",
            config: {
              ...current.config,
              mode: speed === 1 ? "PITCH_ONLY" : "SPEED_AND_PITCH",
              pitchSemitones: semitones,
              linkedPitchToSpeed: false,
              preservePitch: false,
            },
          },
    });
  };

  if (project.participants.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background/30 p-4">
        <p className="text-sm font-semibold">Nenhum personagem na cena</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Adicione uma pessoa na etapa de personagens para escolher, transformar e comparar vozes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono-label text-muted-foreground">Vozes dos personagens</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Escolha a voz base e aplique um estilo. Tudo faz parte da mesma voz do personagem.
          </p>
        </div>
        <span className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground">
          PT-BR
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Presets prontos em português: Natural, Viral, Jovem, Grave e variações experimentais. A voz
        Faber é sintética; os estilos usam os ajustes de velocidade e tom do seu template.
      </p>
      <p className="text-xs text-muted-foreground">
        Cadu e Jeff são vozes-base distintas do{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/OHF-Voice/piper1-gpl" target="_blank" rel="noopener noreferrer">Piper</a>
        {" "}e exigem instalação no servidor. A clonagem autorizada usa o{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/resemble-ai/chatterbox" target="_blank" rel="noopener noreferrer">Chatterbox Multilingual</a>.
      </p>
      <section
        className="rounded-lg border border-primary/25 bg-primary/5 p-3"
        aria-label="ElevenLabs"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Sparkles className="size-3.5 text-primary" aria-hidden /> Minha ElevenLabs
            </p>
            <p role="status" className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {elevenConnection === "checking"
                ? "Verificando sua conexão…"
                : elevenConnection === "error"
                  ? "A verificação da conexão não foi concluída."
                  : elevenConnection === "connected"
                    ? elevenVoices.length
                      ? `${elevenVoices.length} vozes carregadas. Escolha abaixo ou monte um elenco variado.`
                      : elevenCatalogLoaded
                        ? "Sua conta está conectada, mas o catálogo retornou vazio. Adicione uma voz na ElevenLabs e atualize aqui."
                        : "Conexão salva. Carregue seu catálogo quando quiser usar essas vozes."
                    : "Conecte uma chave restrita para usar as vozes disponíveis na sua conta."}
            </p>
          </div>
          {elevenConnection === "connected" ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11 shrink-0"
              disabled={elevenLoading}
              onClick={() => void loadElevenLabsVoices()}
            >
              {elevenLoading ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              {elevenLoading
                ? "Carregando vozes…"
                : elevenError
                  ? "Tentar carregar novamente"
                  : elevenCatalogLoaded
                    ? "Atualizar catálogo"
                    : "Carregar vozes"}
            </Button>
          ) : elevenConnection === "disconnected" ? (
            <Button
              type="button"
              size="sm"
              className="min-h-11 shrink-0"
              onClick={() => setShowElevenForm((value) => !value)}
              aria-expanded={showElevenForm}
            >
              <KeyRound className="size-3.5" aria-hidden />
              Conectar minha chave
            </Button>
          ) : elevenConnection === "error" ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11 shrink-0"
              onClick={() => void checkElevenLabsConnection()}
            >
              Tentar verificar novamente
            </Button>
          ) : null}
        </div>
        {elevenConnectionError ? (
          <p role="alert" className="mt-2 break-words text-xs text-destructive">
            {elevenConnectionError}
          </p>
        ) : null}
        {elevenError ? (
          <p role="alert" className="mt-2 break-words text-xs text-destructive">
            {elevenError}
          </p>
        ) : null}
        {(elevenConnection === "disconnected" || elevenConnection === "error") && showElevenForm ? (
          <form
            className="mt-3 space-y-3 border-t border-primary/15 pt-3"
            aria-busy={elevenConnecting}
            onSubmit={(event) => {
              event.preventDefault();
              void connectElevenLabsAccount();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">Use sua própria conta</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  O consumo e os limites ficam na sua ElevenLabs, não na conta da plataforma.
                </p>
              </div>
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noreferrer"
                className="interactive inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Criar/ver chave <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
            <label className="block text-xs font-medium">
              Chave de API da ElevenLabs
              <span className="relative mt-1 block">
                <input
                  type={showElevenKey ? "text" : "password"}
                  value={elevenApiKey}
                  onChange={(event) => setElevenApiKey(event.target.value)}
                  minLength={12}
                  maxLength={300}
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-11 w-full rounded-md border border-border bg-background px-3 pr-11 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-describedby="elevenlabs-inline-key-help"
                />
                <button
                  type="button"
                  onClick={() => setShowElevenKey((value) => !value)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  aria-label={showElevenKey ? "Ocultar chave" : "Mostrar chave"}
                  aria-pressed={showElevenKey}
                >
                  {showElevenKey ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </span>
            </label>
            <p id="elevenlabs-inline-key-help" className="text-[11px] text-muted-foreground">
              A chave é validada e criptografada no servidor. Ela não é salva no projeto nem volta
              para o navegador.
            </p>
            <Button type="submit" className="min-h-11 w-full" disabled={elevenConnecting}>
              {elevenConnecting ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <KeyRound className="size-4" aria-hidden />
              )}
              {elevenConnecting ? "Validando chave…" : "Conectar e carregar minhas vozes"}
            </Button>
          </form>
        ) : null}
        {elevenConnection === "connected" && elevenCatalogLoaded && !elevenVoices.length ? (
          <a
            href="https://elevenlabs.io/app/voice-library"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-11 items-center rounded-sm text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Abrir biblioteca da ElevenLabs (nova aba)
          </a>
        ) : null}
        {elevenVoices.length ? (
          <div className="mt-3 border-t border-primary/15 pt-3">
            <Button
              type="button"
              size="sm"
              className="min-h-11 w-full gap-1.5"
              onClick={applyAnimatedElevenLabsCast}
            >
              <Sparkles className="size-3.5" /> Montar elenco · conversa animada
            </Button>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Combina vozes distintas e ritmo rápido por características genéricas; não copia a
              identidade vocal de canal ou pessoa real.
            </p>
          </div>
        ) : null}
      </section>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11"
        onClick={() => setProject(preselectLocalVoices(latestProject.current))}
      >
        Preencher personagens sem voz
      </Button>
      <div className="space-y-2">
        {project.participants.map((participant) => {
          const voice = voiceProfileOf(project, participant);
          const selectedPreset = voice ? voicePreset(voice.presetId) : null;
          const caps =
            PROVIDER_CAPABILITIES[voice?.provider ?? "lovable-ai"] ??
            PROVIDER_CAPABILITIES["lovable-ai"];
          return (
            <article
              key={participant.id}
              className="rounded-lg border border-border bg-background/45 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-primary-foreground"
                  style={{ backgroundColor: participant.color }}
                >
                  {participant.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{participant.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {voice?.name ?? selectedPreset?.description ?? "Sem voz definida"}
                  </p>
                </div>
                {voice ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Check className="size-3" aria-hidden /> configurada
                  </span>
                ) : null}
              </div>

              <label
                htmlFor={`voice-base-${participant.id}`}
                className="mt-3 block text-[10px] font-medium text-muted-foreground"
              >
                Voz base
              </label>
              <div className="relative mt-1">
                <select
                  id={`voice-base-${participant.id}`}
                  value={
                    voice?.reference
                      ? "cloned-reference"
                      : voice?.provider === "elevenlabs" && voice.providerVoiceId
                        ? `elevenlabs:${voice.providerVoiceId}`
                        : (voice?.presetId ?? "")
                  }
                  disabled={!!voice?.reference}
                  onChange={(e) =>
                    setProject(
                      e.target.value.startsWith("elevenlabs:")
                        ? attachElevenLabsVoice(
                            project,
                            participant.id,
                            elevenVoices.find(
                              (item) => item.id === e.target.value.slice("elevenlabs:".length),
                            ) ?? {
                              id: e.target.value.slice("elevenlabs:".length),
                              name: "Voz ElevenLabs",
                            },
                          )
                        : e.target.value
                          ? attachPreset(project, participant.id, e.target.value)
                          : {
                              ...project,
                              participants: project.participants.map((p) =>
                                p.id === participant.id
                                  ? { ...p, voice: null, voiceProfileId: null }
                                  : p,
                              ),
                            },
                    )
                  }
                  className="h-10 w-full appearance-none rounded-md border border-border bg-background px-2 pr-8 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Voz de ${participant.name}`}
                >
                  <option value="">Escolher voz</option>
                  {voice?.reference ? (
                    <option value="cloned-reference">Voz clonada — {participant.name}</option>
                  ) : null}
                  {voice?.provider === "elevenlabs" &&
                  voice.providerVoiceId &&
                  !elevenVoices.some((item) => item.id === voice.providerVoiceId) ? (
                    <option value={`elevenlabs:${voice.providerVoiceId}`}>{voice.name}</option>
                  ) : null}
                  {elevenVoices.length ? (
                    <optgroup label="Minha ElevenLabs">
                      {elevenVoices.map((item) => (
                        <option key={item.id} value={`elevenlabs:${item.id}`}>
                          {item.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {Array.from(new Set(VOICE_PRESETS.map((p) => p.group))).map((group) => (
                    <optgroup key={group} label={group}>
                      {VOICE_PRESETS.filter((p) => p.group === group).map((preset) => (
                          <option
                            key={preset.id}
                            value={preset.id}
                            disabled={preset.provider === "piper" && preset.providerVoice !== "pt_BR-faber-medium" && !installedLocalVoices?.includes(preset.providerVoice)}
                          >
                            {voiceDisplayLabel(preset)}
                            {preset.provider === "piper" && preset.providerVoice !== "pt_BR-faber-medium" && !installedLocalVoices?.includes(preset.providerVoice) ? " (instalar no servidor)" : ""}
                          </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
              </div>

              {voice ? (
                <>
                  <label
                    htmlFor={`voice-style-${participant.id}`}
                    className="mt-3 block text-[10px] font-medium text-muted-foreground"
                  >
                    Estilo da voz
                  </label>
                  <div className="relative mt-1">
                    <select
                      id={`voice-style-${participant.id}`}
                      value={voice.transform?.presetId ?? "adam_natural"}
                      onChange={(event) =>
                        voice.id &&
                        updateProfile(voice.id, {
                          transform:
                            event.target.value === "adam_natural"
                              ? undefined
                              : selectionFromTransformPreset(event.target.value),
                          pitch: 0,
                        })
                      }
                      className="h-10 w-full appearance-none rounded-md border border-border bg-background px-2 pr-8 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Estilo da voz de ${participant.name}`}
                    >
                      {voice.transform?.presetId === "user-pitch" ? (
                        <option value="user-pitch">Tom personalizado</option>
                      ) : null}
                      {simpleTransformIds.map((id) => {
                        const item = voiceTransformPreset(id);
                        return (
                          <option key={id} value={id}>
                            {simpleTransformUiLabel(item.id)}
                            {item.evidenceLevel.includes("EXPERIMENTAL") ? " · experimental" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                  {voice.transform ? (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {voice.transform.presetId === "user-pitch"
                        ? "Tom ajustado para este personagem sem acelerar a fala."
                        : voiceTransformPreset(voice.transform.presetId).description}
                    </p>
                  ) : null}
                  <div className="mt-3" role="group" aria-label={`Altura da voz de ${participant.name}`}>
                    <p className="mb-1.5 text-[11px] font-medium">Altura da voz</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { label: "Grave", pitch: -4 },
                        { label: "Original", pitch: 0 },
                        { label: "Fina", pitch: 4 },
                      ] as const).map(({ label, pitch }) => {
                        const selectedPitch = voice.transform
                          ? effectiveTransformPitch(voice.transform.config) + (voice.pitch ?? 0)
                          : (voice.pitch ?? 0);
                        const selected = Math.abs(selectedPitch - pitch) < 0.1;
                        return (
                          <Button
                            key={label}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "secondary"}
                            className="min-h-10"
                            disabled={pitch !== 0 && pitchTransformAvailable !== true}
                            aria-pressed={selected}
                            onClick={() => setVoicePitch(voice, pitch)}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">Muda o tom sem acelerar a fala. Clique em Ouvir para testar; a alteração gera novo áudio.</p>
                    {pitchTransformAvailable !== true ? (
                      <p role="status" className="mt-1 text-[10px] text-muted-foreground">
                        {pitchTransformAvailable === null
                          ? "Verificando o serviço de voz…"
                          : "O ajuste fino precisa da versão nova do serviço de voz."}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 has-[details[open]]:grid-cols-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10 gap-1.5"
                      disabled={previewing === participant.id}
                      onClick={() => onPreview(participant.id, voice)}
                      aria-label={`Ouvir a voz de ${participant.name}`}
                    >
                      {previewing === participant.id ? (
                        <Loader2
                          className="size-3.5 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                      ) : (
                        <Play className="size-3.5" />
                      )}{" "}
                      Ouvir
                    </Button>
                    <details className="group">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <SlidersHorizontal className="size-3.5" /> Editar
                      </summary>
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <VoiceRange
                          label="Velocidade na geração"
                          value={voice.speed}
                          min={0.7}
                          max={voice.provider === "elevenlabs" ? 1.2 : 1.3}
                          step={0.05}
                          suffix="×"
                          onChange={(speed) => voice.id && updateProfile(voice.id, { speed })}
                        />
                        {caps?.controls.energy ? (
                          <VoiceRange
                            label="Energia"
                            value={voice.energy ?? 0.5}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(energy) => voice.id && updateProfile(voice.id, { energy })}
                          />
                        ) : null}
                        {caps?.controls.pitch ? (
                          <VoiceRange
                            label="Tom fino ou grave"
                            value={voice.transform ? effectiveTransformPitch(voice.transform.config) + (voice.pitch ?? 0) : (voice.pitch ?? 0)}
                            min={PITCH_MIN}
                            max={PITCH_MAX}
                            step={0.5}
                            suffix=" st"
                            disabled={pitchTransformAvailable !== true}
                            onChange={(pitch) => setVoicePitch(voice, pitch)}
                          />
                        ) : null}
                        {caps?.controls.expressiveness ? (
                          <VoiceRange
                            label="Expressividade"
                            value={voice.expressiveness ?? 0.5}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(expressiveness) =>
                              voice.id && updateProfile(voice.id, { expressiveness })
                            }
                          />
                        ) : null}
                        {caps?.controls.warmth ? (
                          <VoiceRange
                            label="Calor do timbre"
                            value={voice.warmth ?? 0.5}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(warmth) => voice.id && updateProfile(voice.id, { warmth })}
                          />
                        ) : null}
                        {caps?.controls.brightness ? (
                          <VoiceRange
                            label="Brilho"
                            value={voice.brightness ?? 0.5}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(brightness) =>
                              voice.id && updateProfile(voice.id, { brightness })
                            }
                          />
                        ) : null}
                        {caps?.controls.roughness ? (
                          <VoiceRange
                            label="Aspereza"
                            value={voice.roughness ?? 0}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(roughness) =>
                              voice.id && updateProfile(voice.id, { roughness })
                            }
                          />
                        ) : null}
                        {voice.transform ? (
                          <details className="rounded-md border border-border bg-background/40 p-2">
                            <summary className="cursor-pointer rounded-sm text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              Transformação avançada
                            </summary>
                            <div className="mt-2 space-y-2 border-t border-border pt-2">
                              <VoiceRange
                                label="Velocidade transformada"
                                value={voice.transform.config.speedMultiplier}
                                min={0.75}
                                max={1.5}
                                step={0.01}
                                suffix="×"
                                onChange={(speedMultiplier) =>
                                  updateTransform(voice, { speedMultiplier })
                                }
                              />
                              <label className="block text-[11px] text-muted-foreground">
                                <span className="mb-1 block">Modo</span>
                                <select
                                  className="h-10 w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  value={voice.transform.config.mode}
                                  onChange={(event) =>
                                    updateTransform(voice, {
                                      mode: event.target.value as VoiceTransformMode,
                                    })
                                  }
                                >
                                  <option value="VARISPEED">Varispeed</option>
                                  <option value="TEMPO_ONLY">Somente tempo</option>
                                  <option value="PITCH_ONLY">Somente tom</option>
                                  <option value="SPEED_AND_PITCH">Independente</option>
                                  <option value="VARISPEED_THEN_RESTORE_TEMPO">
                                    Varispeed + restaurar tempo
                                  </option>
                                </select>
                              </label>
                              <label className="flex min-h-10 items-center gap-2 text-[11px]">
                                <input
                                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  type="checkbox"
                                  checked={voice.transform.config.preservePitch}
                                  onChange={(event) =>
                                    updateTransform(voice, { preservePitch: event.target.checked })
                                  }
                                />{" "}
                                Preservar tom
                              </label>
                              <label
                                className="flex min-h-10 items-center gap-2 text-[11px] text-muted-foreground"
                                title="O backend FFmpeg baseline V1 não preserva formantes."
                              >
                                <input
                                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  type="checkbox"
                                  checked={false}
                                  disabled
                                />{" "}
                                Preservar formantes (indisponível no baseline)
                              </label>
                              <label className="flex min-h-10 items-center gap-2 text-[11px]">
                                <input
                                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  type="checkbox"
                                  checked={voice.transform.config.normalization.enabled}
                                  onChange={(event) =>
                                    updateTransform(voice, {
                                      normalization: {
                                        ...voice.transform!.config.normalization,
                                        enabled: event.target.checked,
                                      },
                                    })
                                  }
                                />{" "}
                                Normalização de fala
                              </label>
                            </div>
                          </details>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11 w-full gap-1 text-[11px]"
                          onClick={() =>
                            updateProfile(
                              voice.id ?? `voice_${participant.id}`,
                              voice.reference
                                ? { speed: 1, pitch: 0, transform: undefined }
                                : voice.provider === "elevenlabs"
                                  ? { speed: 1.04, pitch: 0, transform: undefined }
                                  : profileFromPreset(voice.presetId, {
                                      id: voice.id ?? `voice_${participant.id}`,
                                    }),
                            )
                          }
                        >
                          <RotateCcw className="size-3" aria-hidden />{" "}
                          {voice.provider === "elevenlabs" || voice.reference
                            ? "Restaurar ajustes"
                            : "Restaurar preset"}
                        </Button>
                      </div>
                    </details>
                  </div>
                  <details className="mt-2 rounded-md border border-border bg-background/30 p-2">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <FlaskConical className="size-3.5" aria-hidden /> Comparar estilos desta voz
                    </summary>
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="rounded-md bg-background/60 p-2 text-[11px]">
                        “Você não vai acreditar no que aconteceu hoje.”
                      </p>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {labTransformIds.map((id, index) => {
                          const item = voiceTransformPreset(id);
                          const previewId = `voice-lab-${participant.id}-${id}`;
                          return (
                            <Button
                              key={id}
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-auto min-h-12 justify-start gap-2 whitespace-normal py-2 text-left text-[10px]"
                              disabled={previewing === previewId}
                              onClick={() =>
                                props.onPreview(
                                  previewId,
                                  {
                                    ...voice,
                                    speed: 1,
                                    pitch: 0,
                                    transform: selectionFromTransformPreset(id),
                                  },
                                  "Você não vai acreditar no que aconteceu hoje.",
                                )
                              }
                            >
                              {previewing === previewId ? (
                                <Loader2
                                  className="size-3.5 animate-spin motion-reduce:animate-none"
                                  aria-hidden
                                />
                              ) : (
                                <Play className="size-3.5" aria-hidden />
                              )}
                              <span>
                                <strong>{String.fromCharCode(65 + index)}</strong> ·{" "}
                                {transformUiLabel(
                                  item.id,
                                  voice.provider === "piper"
                                    ? "Faber"
                                    : voice.reference
                                      ? participant.name
                                      : "Voz base",
                                )}
                                {item.evidenceLevel.includes("EXPERIMENTAL")
                                  ? " · experimental"
                                  : ""}
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    A voz base e o estilo selecionado geram um único áudio final para a cena.
                  </p>
                </>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-background/30 p-3">
        <div className="mb-2 flex justify-between text-[11px]">
          <span>{missing} mensagens precisam de voz</span>
          <span className="text-muted-foreground">{characters} caracteres</span>
        </div>
        <Button
          size="sm"
          className="w-full gap-1.5"
          disabled={castState === "running" || missing === 0}
          onClick={onGenerate}
        >
          {castState === "running" ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />{" "}
              Gerando {castProgress.done}/{castProgress.total}
            </>
          ) : (
            <>
              <Volume2 className="size-4" /> Gerar vozes ausentes
            </>
          )}
        </Button>
        {clipCount > 0 ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {clipCount} falas prontas nesta cena; o cache também permanece neste navegador.
          </p>
        ) : null}
        {failures.length ? (
          <div
            className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2"
            role="alert"
          >
            <p className="text-[11px] font-medium text-destructive">
              Falha ao gerar {failures.length === 1 ? "uma voz" : `${failures.length} vozes`}.
            </p>
            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
              {failures[0]?.reason}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={onRetry}>
                Tentar novamente
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onChangeVoice}>
                Trocar voz
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onContinue}>
                Continuar sem voz
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <label className="flex min-h-10 items-center gap-2 text-xs">
        <input
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="checkbox"
          checked={project.voiceMix?.normalize ?? true}
          onChange={(e) =>
            patch({
              voiceMix: { ...DEFAULT_VOICE_MIX, ...project.voiceMix, normalize: e.target.checked },
            })
          }
        />{" "}
        normalizar volume sem achatar a dinâmica
      </label>
    </div>
  );
}

function bestElevenLabsVoice(
  voices: ElevenLabsVoice[],
  profile: VoiceProfile | null,
  used: Set<string>,
): ElevenLabsVoice | undefined {
  const desiredGender = profile?.genderStyle;
  const desiredAge = profile?.ageStyle;
  const score = (voice: ElevenLabsVoice) => {
    const labels = Object.values(voice.labels).join(" ").toLowerCase();
    let value = used.has(voice.id) ? -20 : 0;
    if (desiredGender === "masculina" && /\b(male|masculin)/.test(labels)) value += 5;
    if (desiredGender === "feminina" && /\b(female|feminin)/.test(labels)) value += 5;
    if (desiredAge === "juvenil" && /(child|young|youth)/.test(labels)) value += 4;
    if (desiredAge === "teen" && /(teen|young|youth)/.test(labels)) value += 4;
    if (desiredAge === "madura" && /(old|mature|senior)/.test(labels)) value += 4;
    if (/(conversational|casual|animated|energetic|characters)/.test(labels)) value += 2;
    return value;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

function transformUiLabel(id: string, baseName: string): string {
  return (
    (
      {
        dialogue_fast: `${baseName} · Conversa rápida`,
        adam_natural: `${baseName} · Natural`,
        adam_young: `${baseName} · Jovem`,
        adam_roblox_teen: `${baseName} · Adolescente / Viral`,
        adam_child_male: `${baseName} · Masculino infantilizado`,
        adam_child_cartoon: `${baseName} · Cartoon infantilizado`,
        adam_deep: `${baseName} · Adulto grave`,
        adam_mature_character: `${baseName} · Personagem maduro`,
        adam_child_pitch_only: `${baseName} · Tom agudo em velocidade normal`,
      } as Record<string, string>
    )[id] ?? id
  );
}

function simpleTransformUiLabel(id: string): string {
  return (
    (
      {
        dialogue_fast: "Conversa rápida",
        adam_natural: "Natural",
        adam_young: "Jovem",
        adam_roblox_teen: "Adolescente / Viral",
        adam_child_male: "Masculino infantilizado",
        adam_deep: "Grave",
        adam_mature_character: "Personagem maduro",
      } as Record<string, string>
    )[id] ?? id
  );
}

function VoiceRange({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      <span className="mb-1 flex justify-between">
        <span>{label}</span>
        <span>
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </span>
      <input
        className="w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
