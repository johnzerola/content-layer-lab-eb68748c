import {
  Check,
  ChevronDown,
  FlaskConical,
  Loader2,
  Mic2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVoiceEngineStatus } from "@/lib/chatscene/voice.functions";
import { VoiceReferenceControl } from "./VoiceReferenceControl";
import { Button } from "@/components/ui/base";
import {
  attachPreset,
  attachVoiceReference,
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
import type { ChatSceneProject } from "@/lib/chatscene/types";
import {
  VOICE_TRANSFORM_PRESETS,
  effectiveTransformPitch,
  selectionFromTransformPreset,
  voiceTransformPreset,
  type VoiceTransformConfig,
  type VoiceTransformMode,
} from "@/lib/chatscene/voice-transform";

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
  const latestProject = useRef(project);
  latestProject.current = project;
  const statusFn = useServerFn(getVoiceEngineStatus);
  const [cloneAvailable, setCloneAvailable] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [cloneTargetId, setCloneTargetId] = useState<string | null>(
    project.participants[0]?.id ?? null,
  );
  const assignedProject = useRef<string | null>(null);
  useEffect(() => {
    if (
      !cloneTargetId ||
      !project.participants.some((participant) => participant.id === cloneTargetId)
    ) {
      setCloneTargetId(project.participants[0]?.id ?? null);
    }
  }, [cloneTargetId, project.participants]);
  useEffect(() => {
    if (assignedProject.current === project.id) return;
    assignedProject.current = project.id;
    const next = preselectLocalVoices(project);
    if (next !== project) patch(next);
  }, [project, patch]);
  useEffect(() => {
    let active = true;
    statusFn()
      .then((status) => {
        if (active) setCloneAvailable(status.clone.installed);
      })
      .catch(() => {
        if (active) {
          setCloneAvailable(false);
          setStatusError(
            "Não foi possível verificar o motor de clonagem. Atualize a página para tentar novamente.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [statusFn]);
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
  const cloneTarget =
    project.participants.find((participant) => participant.id === cloneTargetId) ??
    project.participants[0];
  const cloneTargetVoice = cloneTarget ? voiceProfileOf(project, cloneTarget) : null;
  const removeCloneFromTarget = () => {
    if (!cloneTarget) return;
    const current = latestProject.current;
    const referenceId = voiceProfileOf(current, cloneTarget)?.reference?.id;
    if (!referenceId) return;
    setProject(
      current.participants.reduce(
        (next, person) =>
          voiceProfileOf(next, person)?.reference?.id === referenceId
            ? attachPreset(next, person.id, "faber-natural")
            : next,
        current,
      ),
    );
  };
  const simpleTransformIds = [
    "adam_natural",
    "adam_young",
    "adam_roblox_teen",
    "adam_child_male",
    "adam_deep",
    "adam_mature_character",
  ];
  const labTransformIds = [
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
      <Button
        type="button"
        variant="secondary"
        className="min-h-11"
        onClick={() => setProject(preselectLocalVoices(latestProject.current))}
      >
        Preencher personagens sem voz
      </Button>
      {statusError ? (
        <p role="alert" className="text-xs text-destructive">
          {statusError}
        </p>
      ) : null}

      {cloneTarget ? (
        <section
          className="rounded-lg border border-primary/45 bg-primary/5 p-3"
          aria-labelledby="voice-clone-title"
        >
          <div className="flex items-start gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
              <Mic2 className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p id="voice-clone-title" className="text-sm font-semibold">
                Enviar amostra e clonar voz
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Envie 3 a 30 segundos de fala limpa. A voz será clonada e usada automaticamente nos
                textos do personagem escolhido.
              </p>
            </div>
          </div>
          <label
            className="mt-3 block text-[10px] font-medium text-muted-foreground"
            htmlFor="chatscene-clone-target"
          >
            Aplicar ao personagem
          </label>
          <select
            id="chatscene-clone-target"
            value={cloneTarget.id}
            onChange={(event) => setCloneTargetId(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {project.participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
          <VoiceReferenceControl
            participantName={cloneTarget.name}
            reference={cloneTargetVoice?.reference}
            available={cloneAvailable}
            open
            title={
              cloneTargetVoice?.reference
                ? "Voz clonada — pronta para gerar os textos"
                : "Escolher áudio da voz"
            }
            onAttach={(reference) =>
              setProject(attachVoiceReference(latestProject.current, cloneTarget.id, reference))
            }
            onRemove={removeCloneFromTarget}
          />
          {cloneAvailable === true ? (
            <p className="mt-2 text-[11px] text-emerald-400">
              Motor pronto. Depois do upload, clique em “Gerar vozes ausentes” para narrar todas as
              mensagens sem áudio.
            </p>
          ) : null}
        </section>
      ) : null}

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

              <label className="mt-3 block text-[10px] font-medium text-muted-foreground">
                Voz base
              </label>
              <div className="relative mt-1">
                <select
                  value={voice?.reference ? "cloned-reference" : (voice?.presetId ?? "")}
                  disabled={!!voice?.reference}
                  onChange={(e) =>
                    setProject(
                      e.target.value
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
                  {Array.from(new Set(VOICE_PRESETS.map((p) => p.group))).map((group) => (
                    <optgroup key={group} label={group}>
                      {VOICE_PRESETS.filter((p) => p.group === group).map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {voiceDisplayLabel(preset)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
              </div>

              {voice ? (
                <>
                  <label className="mt-3 block text-[10px] font-medium text-muted-foreground">
                    Estilo da voz
                  </label>
                  <div className="relative mt-1">
                    <select
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
                      {voiceTransformPreset(voice.transform.presetId).description}
                    </p>
                  ) : null}
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
                        <Loader2 className="size-3.5 animate-spin" />
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
                          label="Velocidade"
                          value={voice.speed}
                          min={0.7}
                          max={1.3}
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
                            label="Tom"
                            value={voice.pitch ?? 0}
                            min={PITCH_MIN}
                            max={PITCH_MAX}
                            step={0.5}
                            onChange={(pitch) => voice.id && updateProfile(voice.id, { pitch })}
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
                              <VoiceRange
                                label="Ajuste de tom"
                                value={voice.transform.config.pitchSemitones}
                                min={-6}
                                max={6}
                                step={0.25}
                                suffix=" st"
                                onChange={(pitchSemitones) =>
                                  updateTransform(voice, { pitchSemitones })
                                }
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Tom efetivo:{" "}
                                {formatSigned(effectiveTransformPitch(voice.transform.config))} st
                              </p>
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
                          className="h-7 w-full gap-1 text-[11px]"
                          onClick={() =>
                            updateProfile(
                              voice.id ?? `voice_${participant.id}`,
                              voice.reference
                                ? { speed: 1, pitch: 0, transform: undefined }
                                : profileFromPreset(voice.presetId, {
                                    id: voice.id ?? `voice_${participant.id}`,
                                  }),
                            )
                          }
                        >
                          <RotateCcw className="size-3" /> Restaurar preset
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
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
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
              <Loader2 className="size-4 animate-spin" /> Gerando {castProgress.done}/
              {castProgress.total}
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

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function transformUiLabel(id: string, baseName: string): string {
  return (
    (
      {
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
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
