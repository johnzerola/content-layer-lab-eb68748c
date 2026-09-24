import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Captions, Check, ChevronDown, Download, Film, FolderOpen, Import, Library, PanelRight, Pause, Play, Ratio, Redo2, Undo2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AddClipCommand,
  AddCaptionBatchCommand,
  AddMediaClipCommand,
  AddTrackCommand,
  InsertMediaClipCommand,
  AutoSplitClipsCommand,
  RemoveSilenceCommand,
  AudioSeparationJobRepository,
  ApplyCaptionPresetCommand,
  ApplySeparatedAudioCommand,
  ApplyTemplateCommand,
  ApplyTransitionCommand,
  DeleteKeyframeCommand,
  DeleteAudioEnvelopePointCommand,
  CompositionClock,
  DeleteClipsCommand,
  DeleteTransitionCommand,
  DissolveCompoundClipCommand,
  DuplicateClipsCommand,
  EditorCommandBus,
  MoveClipCommand,
  MoveCompoundClipCommand,
  MoveKeyframeCommand,
  RegisterExtractedAudioCommand,
  RemoveMediaAssetFromLibraryCommand,
  RestoreOriginalAudioCommand,
  SelectItemCommand,
  SelectAutoSplitPartsCommand,
  SetProjectAspectRatioCommand,
  SetAudioRepresentationCommand,
  SplitClipCommand,
  TrimClipCommand,
  UpdateClipCommand,
  UpdateClipsCommand,
  UpdateProjectSettingsCommand,
  UpdateTrackCommand,
  UpdateAssetAnalysisCommand,
  UpdateMediaAssetCommand,
  UpdateTransformAtTimeCommand,
  CreateCompoundClipCommand,
  UpsertKeyframeCommand,
  UpsertAudioEnvelopePointCommand,
  analyzeAudioFile,
  buildExtractedAudioMedia,
  buildSeparatedAudioMedia,
  captureVideoPoster,
  clipLocalTime,
  createEditorProjectV2,
  createMediaClipFromAsset,
  deleteEditorMedia,
  editorMediaStoragePath,
  extractAudioFromMediaFile,
  findClip,
  formatProjectTime,
  isLocalEditorAsset,
  persistEditorMedia,
  persistEditorProject,
  prepareAudioForSeparation,
  prepareLocalMedia,
  readEditorMedia,
  readEditorProject,
  resolveLibraryInsertion,
  parseTimedText,
  createCaptionBatch,
  createCaptionBatchFromTimedWords,
  createAudioSeparationJob,
  findTransitionTarget,
  resolveTemplateApplication,
  transitionAudioSeparationJob,
  type AudioSeparationJobRecord,
  type Clip,
  type AnimatableProperty,
  type AutoSplitSelectionMode,
  type ClipTransform,
  type EditorCommand,
  type EditorProjectV2,
  type MediaAsset,
  type Track,
  validateRelinkFile,
  resolveAudioMixFrame,
  sourceToProjectTime,
  synthesizeSoundEffect,
} from "@/lib/editor-v2";
import { prepareAudioSeparation, updateAudioSeparationJob } from "@/lib/audio.functions";
import { downloadSourceFile, uploadAudioStem } from "@/lib/editor/media-cloud";
import { runStemJob } from "@/lib/editor/stem-service";
import { listMyTemplates } from "@/lib/video-template/service";
import { downloadBlob } from "@/lib/render";
import { generateCaptions } from "@/lib/captions";
import { analyzeAudio, findSilences, keepRanges } from "@/lib/editor/silence";
import type { Easing } from "@/lib/video-template/types";
import { BUILT_IN_LIBRARY_ITEMS, LibraryRegistry, TRANSITION_DEFINITIONS, userTemplateLibraryItem, type CaptionPresetDefinition, type CreativeEffectDefinition, type FilterPresetDefinition, type LibraryItem, type MotionDefinition, type SoundEffectDefinition, type TemplateDefinition } from "@/lib/editor-v2/library";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { EditorCanvasV2 } from "./EditorCanvasV2";
import { InspectorV2 } from "./InspectorV2";
import { LibraryPanel } from "./LibraryPanel";
import { TimelineV2 } from "./TimelineV2";

type MobileSurface = "library" | "canvas" | "inspector" | "timeline";

function audioFileExtension(type: string) {
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("flac")) return "flac";
  return "wav";
}

function sourceVideoClipForAudioSelection(
  project: EditorProjectV2,
  selected: Clip | null | undefined,
  group: EditorProjectV2["audioGroups"][number],
) {
  const isGroupVideo = (clip: Clip | null | undefined) => Boolean(
    clip
    && clip.kind === "video"
    && clip.assetId === group.sourceAssetId
    && (clip.id === group.sourceVideoClipId || clip.audioGroupId === group.id),
  );
  if (isGroupVideo(selected)) return selected;

  const derivedFromClipId = selected?.metadata?.["derivedFromClipId"];
  if (typeof derivedFromClipId === "string") {
    const derived = findClip(project, derivedFromClipId);
    if (isGroupVideo(derived)) return derived;
  }

  const anchor = group.sourceVideoClipId ? findClip(project, group.sourceVideoClipId) : undefined;
  return isGroupVideo(anchor) ? anchor : undefined;
}

function assetMatchesSourceRange(asset: MediaAsset | undefined, clip: Clip) {
  return Number(asset?.sourceAudio?.sourceIn) === Number(clip.sourceIn)
    && Number(asset?.sourceAudio?.sourceOut) === Number(clip.sourceOut);
}

export function EditorV2Foundation() {
  const registry = useMemo(() => new LibraryRegistry(BUILT_IN_LIBRARY_ITEMS), []);
  const busRef = useRef(new EditorCommandBus(createEditorProjectV2({ name: "Projeto sem título", duration: 15 })));
  const clockRef = useRef(new CompositionClock(() => busRef.current.getState().tracks.flatMap((track) => track.clips)));
  const [project, setProject] = useState<EditorProjectV2>(() => busRef.current.getState());
  const [clock, setClock] = useState(() => clockRef.current.getSnapshot());
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("canvas");
  const [message, setMessage] = useState("Editor V2 pronto para criar.");
  const [assetSources, setAssetSources] = useState<Record<string, string>>({});
  const [assetThumbnails, setAssetThumbnails] = useState<Record<string, string>>({});
  const [assetWaveforms, setAssetWaveforms] = useState<Record<string, number[]>>({});
  const [importing, setImporting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [removingSilence, setRemovingSilence] = useState(false);
  const [captionProgress, setCaptionProgress] = useState(0);
  const [extractingAudio, setExtractingAudio] = useState(false);
  const [separatingAudio, setSeparatingAudio] = useState(false);
  const [audioSeparationStatus, setAudioSeparationStatus] = useState("");
  const [audioSeparationError, setAudioSeparationError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [missingAssetIds, setMissingAssetIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const relinkAssetIdRef = useRef<string | null>(null);
  const sourceFilesRef = useRef(new Map<string, File>());
  const runtimeUrlsRef = useRef(new Set<string>());
  const audioExtractionRef = useRef<AbortController | null>(null);
  const audioSeparationRef = useRef<AbortController | null>(null);
  const exportRef = useRef<AbortController | null>(null);
  const lastSelectedClipIdRef = useRef<string | null>(null);
  const lastSelectedClipIdsRef = useRef<string[]>([]);
  const lastMediaClockAtRef = useRef(0);
  const soundPreviewRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listMyTemplates().then((templates) => {
      if (cancelled) return;
      let added = 0;
      for (const template of templates) {
        const item = userTemplateLibraryItem(template);
        if (registry.get(item.id)) continue;
        registry.register(item);
        added += 1;
      }
      if (added) setLibraryRevision((value) => value + 1);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [registry]);

  const installRuntimeMedia = useCallback(async (asset: MediaAsset, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    runtimeUrlsRef.current.add(objectUrl);
    sourceFilesRef.current.set(asset.id, file);
    setAssetSources((current) => {
      const previous = current[asset.id];
      if (previous && previous !== objectUrl) { URL.revokeObjectURL(previous); runtimeUrlsRef.current.delete(previous); }
      return { ...current, [asset.id]: objectUrl };
    });
    if (asset.kind === "image") setAssetThumbnails((current) => ({ ...current, [asset.id]: objectUrl }));
    if (asset.kind === "video") {
      const poster = await captureVideoPoster(objectUrl, asset.duration ?? 5).catch(() => undefined);
      if (poster) {
        runtimeUrlsRef.current.add(poster);
        setAssetThumbnails((current) => ({ ...current, [asset.id]: poster }));
      }
    }
    if (asset.kind === "audio") {
      if (asset.audioAnalysis?.peaks?.length) setAssetWaveforms((current) => ({ ...current, [asset.id]: asset.audioAnalysis!.peaks! }));
      else void analyzeAudioFile(file).then((analysis) => setAssetWaveforms((current) => ({ ...current, [asset.id]: analysis.peaks }))).catch(() => undefined);
    }
  }, []);

  const run = useCallback((command: EditorCommand, success?: string) => {
    try {
      setProject(busRef.current.execute(command));
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const restored = readEditorProject("editor-v2-local");
      if (!restored) {
        if (!cancelled) setHydrated(true);
        return;
      }
      busRef.current = new EditorCommandBus(restored);
      if (!cancelled) setProject(restored);
      const missing: string[] = [];
      for (const asset of restored.assets) {
        if (!isLocalEditorAsset(asset)) continue;
        const localFile = await readEditorMedia(restored.id, asset.id);
        const file = localFile ?? (
          asset.storagePath && !asset.storagePath.includes("://")
            ? await downloadSourceFile(asset.storagePath).catch(() => null)
            : null
        );
        if (!file) { missing.push(asset.id); continue; }
        if (!localFile) await persistEditorMedia(restored.id, asset.id, file);
        if (!cancelled) await installRuntimeMedia(asset, file);
      }
      if (!cancelled) {
        setMissingAssetIds(missing);
        setMessage(missing.length ? `Projeto recuperado. ${missing.length} ${missing.length === 1 ? "arquivo precisa" : "arquivos precisam"} ser religado.` : "Projeto e mídias recuperados deste navegador.");
        setHydrated(true);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [installRuntimeMedia]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      if (!persistEditorProject(project)) setMessage("O projeto continua aberto, mas o navegador não conseguiu salvar esta revisão.");
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [hydrated, project]);

  const selectClip = useCallback((id: string | null, additive = false, surface: "timeline" | "canvas" = "canvas") => {
    if (!id) {
      lastSelectedClipIdRef.current = null;
      lastSelectedClipIdsRef.current = [];
      return run(new SelectItemCommand([], surface));
    }
    lastSelectedClipIdRef.current = id;
    const state = busRef.current.getState();
    const current = state.selection.itemIds;
    const clicked = findClip(state, id);
    const compoundGroupId = clicked?.metadata?.["compoundGroupId"];
    const compoundIds = typeof compoundGroupId === "string"
      ? state.tracks.flatMap((track) => track.clips).filter((clip) => clip.metadata?.["compoundGroupId"] === compoundGroupId).map((clip) => clip.id)
      : [];
    const ids = additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : compoundIds.length > 1 ? compoundIds : [id];
    lastSelectedClipIdsRef.current = ids;
    run(new SelectItemCommand(ids, surface));
  }, [run]);

  const selectLibrary = useCallback((item: LibraryItem) => run(new SelectItemCommand([item.id], "library")), [run]);
  const previewSoundEffect = useCallback((item: LibraryItem) => {
    const previous = soundPreviewRef.current;
    if (previous) { previous.audio.pause(); URL.revokeObjectURL(previous.url); soundPreviewRef.current = null; }
    const file = synthesizeSoundEffect(item.definition as SoundEffectDefinition, 1);
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    soundPreviewRef.current = { audio, url };
    audio.onended = () => { if (soundPreviewRef.current?.audio === audio) soundPreviewRef.current = null; URL.revokeObjectURL(url); };
    void audio.play().catch(() => { if (soundPreviewRef.current?.audio === audio) soundPreviewRef.current = null; URL.revokeObjectURL(url); setMessage("O navegador bloqueou a prévia. Clique novamente em Ouvir."); });
  }, []);
  const insertSoundEffect = useCallback(async (item: LibraryItem, at: number) => {
    const definition = item.definition as SoundEffectDefinition;
    const state = busRef.current.getState();
    const serial = state.revisions.document + state.tracks.reduce((total, track) => total + track.clips.length, 0) + 1;
    setMessage(`Criando ${item.name}…`);
    try {
      const file = synthesizeSoundEffect(definition, serial);
      const runtime = await prepareLocalMedia(file, at, serial);
      runtime.asset.name = item.name;
      runtime.asset.license = structuredClone(item.license);
      runtime.clip.name = item.name;
      runtime.clip.trackId = "track-sfx";
      runtime.clip.projectEnd = (at + definition.duration) as Clip["projectEnd"];
      runtime.clip.sourceOut = definition.duration;
      runtime.clip.audio = { ...(runtime.clip.audio ?? { gain: 1, muted: false, fadeIn: 0, fadeOut: 0, loop: false, envelope: [] }), stemRole: "sfx" };
      runtime.clip.metadata = { ...runtime.clip.metadata, soundEffectId: definition.id, generated: true };
      const persisted = await persistEditorMedia(state.id, runtime.asset.id, file);
      if (persisted) runtime.asset.storagePath = editorMediaStoragePath(state.id, runtime.asset.id);
      runtimeUrlsRef.current.add(runtime.objectUrl);
      sourceFilesRef.current.set(runtime.asset.id, file);
      setAssetSources((current) => ({ ...current, [runtime.asset.id]: runtime.objectUrl }));
      run(new AddMediaClipCommand(runtime.asset, runtime.clip), `${item.name} inserido na faixa Efeitos em ${formatProjectTime(at)}.`);
      void analyzeAudioFile(file).then((analysis) => {
        setAssetWaveforms((current) => ({ ...current, [runtime.asset.id]: analysis.peaks }));
        run(new UpdateAssetAnalysisCommand(runtime.asset.id, { cacheKey: analysis.cacheKey, status: "ready", sampleRate: analysis.sampleRate, channels: analysis.channels, durationMs: analysis.durationMs, peaks: analysis.peaks }));
      }).catch(() => undefined);
      setMobileSurface("timeline");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Não foi possível criar ${item.name}.`);
    }
  }, [run]);

  const addLibraryItem = useCallback((item: LibraryItem, at = Number(clockRef.current.getSnapshot().projectTime)) => {
    const state = busRef.current.getState();
    const selected = findClip(state, state.selection.primaryId) ?? findClip(state, lastSelectedClipIdRef.current);
    const activeClipIds = state.selection.itemIds.filter((id) => Boolean(findClip(state, id)));
    const rememberedIds = lastSelectedClipIdsRef.current.filter((id) => Boolean(findClip(state, id)));
    const selectedClips = (activeClipIds.length ? activeClipIds : rememberedIds).map((id) => findClip(state, id)).filter((clip): clip is Clip => Boolean(clip));
    if (item.type === "sound-effect") {
      void insertSoundEffect(item, at);
      return;
    }
    if (item.type === "transition") {
      run(new SelectItemCommand([item.id], "library"));
      setMobileSurface("inspector");
      setMessage("Defina a duração e aplique a transição no corte mais próximo da agulha.");
      return;
    }
    if (item.type === "animation") {
      const targets = selectedClips.filter((clip) => clip.kind !== "audio");
      if (!targets.length) { setMessage("Selecione um ou mais clipes visuais antes de aplicar a animação."); return; }
      const definition = item.definition as MotionDefinition;
      run(new UpdateClipsCommand(targets.map((clip) => ({ clipId: clip.id, patch: { motion: { ...(clip.motion ?? {}), [definition.slot]: { id: definition.id.replace(`${definition.slot}-`, ""), duration: definition.duration, intensity: definition.intensity, easing: definition.easing } } } }))), `${item.name} aplicado em ${targets.length} ${targets.length === 1 ? "item" : "itens"}.`);
      setMobileSurface("inspector");
      return;
    }
    if (item.type === "filter") {
      const targets = selectedClips.filter((clip) => ["video", "image"].includes(clip.kind));
      if (!targets.length) { setMessage("Selecione um ou mais vídeos ou imagens antes de aplicar o filtro."); return; }
      const definition = item.definition as FilterPresetDefinition;
      run(new UpdateClipsCommand(targets.map((clip) => ({ clipId: clip.id, patch: { adjustments: structuredClone(definition.adjustments), metadata: { ...clip.metadata, filterPresetId: definition.id } } }))), `${item.name} aplicado em ${targets.length} ${targets.length === 1 ? "item" : "itens"}.`);
      setMobileSurface("inspector");
      return;
    }
    if (item.type === "video-effect") {
      const targets = selectedClips.filter((clip) => ["video", "image"].includes(clip.kind));
      if (!targets.length) { setMessage("Selecione um ou mais vídeos ou imagens antes de aplicar o efeito."); return; }
      const definition = item.definition as CreativeEffectDefinition;
      run(new UpdateClipsCommand(targets.map((clip) => ({ clipId: clip.id, patch: { effects: [...clip.effects, { id: `${clip.id}-fx-${definition.id}-${state.revisions.document + 1}`, definitionId: definition.id, enabled: true, parameters: { start: Math.max(0, at - Number(clip.projectStart)), end: Math.min(Number(clip.projectEnd) - Number(clip.projectStart), Math.max(0, at - Number(clip.projectStart)) + definition.duration), intensity: definition.intensity } }] } }))), `${item.name} aplicado em ${targets.length} ${targets.length === 1 ? "item" : "itens"}.`);
      setMobileSurface("inspector");
      return;
    }
    if (item.type === "template") {
      try {
        const application = resolveTemplateApplication(state, item as LibraryItem<TemplateDefinition>, at, state.revisions.document + 1);
        run(new ApplyTemplateCommand(application.instance, application.clips), `${item.name} aplicado com ${application.clips.length} camadas.`);
        setMobileSurface("canvas");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aplicar o template."); }
      return;
    }
    if (item.type === "caption") {
      const preset = item.definition as CaptionPresetDefinition;
      if (selected?.kind === "caption") {
        run(new ApplyCaptionPresetCommand(selected.id, preset.id, preset.style, preset.transform, preset as unknown as Record<string, unknown>), `${item.name} aplicado à legenda.`);
      } else {
        run(new SelectItemCommand([item.id], "library"));
        setMessage(`${item.name} selecionado. Agora clique em “Gerar legendas automáticas”.`);
      }
      setMobileSurface(selected?.kind === "caption" ? "canvas" : "inspector");
      return;
    }
    const clip = resolveLibraryInsertion(state, item, at, state.revisions.document + 1);
    if (!clip) {
      setMessage(`${item.name} precisa ser aplicado a um clipe compatível; esta etapa não altera o render atual.`);
      return;
    }
    run(new AddClipCommand(clip), `${item.name} inserido em ${formatProjectTime(at)}.`);
    setMobileSurface("canvas");
  }, [insertSoundEffect, run]);

  const undo = useCallback(() => { setProject(busRef.current.undo()); setMessage("Ação desfeita."); }, []);
  const redo = useCallback(() => { setProject(busRef.current.redo()); setMessage("Ação refeita."); }, []);
  const seek = useCallback((time: number) => {
    lastMediaClockAtRef.current = 0;
    setClock(clockRef.current.seek(Math.max(0, Math.min(busRef.current.getState().settings.duration, time))));
  }, []);
  const togglePlayback = useCallback(() => {
    lastMediaClockAtRef.current = 0;
    setClock(clockRef.current.getSnapshot().playing ? clockRef.current.pause() : clockRef.current.play());
  }, []);
  const syncPlaybackToMedia = useCallback((time: number) => {
    const snapshot = clockRef.current.getSnapshot();
    if (!snapshot.playing || !Number.isFinite(time)) return;
    lastMediaClockAtRef.current = performance.now();
    const duration = busRef.current.getState().settings.duration;
    setClock(clockRef.current.seek(Math.max(0, Math.min(duration, time))));
  }, []);

  const split = useCallback(() => {
    const state = busRef.current.getState();
    const clip = findClip(state, state.selection.primaryId);
    if (!clip) return setMessage("Selecione um clipe antes de dividir.");
    run(new SplitClipCommand(clip.id, Number(clockRef.current.getSnapshot().projectTime), `${clip.id}-split-${state.revisions.document + 1}`), "Clipe dividido na agulha.");
  }, [run]);

  const dropLibraryItem = useCallback((id: string, at: number) => {
    const item = registry.get(id);
    if (!item) return;
    const state = busRef.current.getState();
    if (item.type === "transition") {
      const context = findTransitionTarget(state, at);
      if (!context) { setMessage("Solte a transição exatamente entre dois clipes consecutivos."); return; }
      const definition = item.definition as typeof TRANSITION_DEFINITIONS[number];
      if (definition.id === "cut") {
        if (context.existing) run(new DeleteTransitionCommand(context.existing.id), "Corte seco restaurado.");
      } else {
        const duration = Math.min(definition.durationDefault, definition.durationMax, context.maxDuration);
        run(new ApplyTransitionCommand({ id: context.existing?.id ?? `transition-${context.from.id}-${context.to.id}`, definitionId: definition.id, fromClipId: context.from.id, toClipId: context.to.id, duration, easing: "easeInOut", fallback: "cut", parameters: {} }), `${item.name} aplicada no corte em ${formatProjectTime(context.boundary)}.`);
      }
      run(new SelectItemCommand([item.id], "library"));
      seek(context.boundary);
      setMobileSurface("inspector");
      return;
    }
    if (["video-effect", "filter", "animation"].includes(item.type)) {
      const target = state.tracks
        .filter((track) => track.kind === "video" || track.kind === "overlay")
        .flatMap((track) => track.clips)
        .reverse()
        .find((clip) => Number(clip.projectStart) <= at && Number(clip.projectEnd) >= at && clip.kind !== "audio");
      if (!target) { setMessage("Solte o efeito sobre um vídeo ou imagem da timeline."); return; }
      lastSelectedClipIdRef.current = target.id;
      lastSelectedClipIdsRef.current = [target.id];
      run(new SelectItemCommand([target.id], "timeline"));
      addLibraryItem(item, at);
      return;
    }
    addLibraryItem(item, at);
  }, [addLibraryItem, registry, run, seek]);

  const autoSplit = useCallback((interval: number) => {
    const state = busRef.current.getState();
    const ids = state.selection.itemIds.filter((id) => findClip(state, id)?.kind === "video");
    if (!ids.length) return setMessage("Selecione um ou mais vídeos antes de aplicar os cortes automáticos.");
    run(new AutoSplitClipsCommand(ids, interval, String(state.revisions.document + 1)), `Vídeos divididos a cada ${interval.toLocaleString("pt-BR")}s. Em Ações, escolha Todos, Ímpares ou Pares.`);
  }, [run]);

  const removeSilence = useCallback(async (options: { threshold: number; minSilence: number; padding: number }) => {
    const state = busRef.current.getState();
    const videos = state.selection.itemIds
      .map((id) => findClip(state, id))
      .filter((clip): clip is Clip => Boolean(clip?.kind === "video" && clip.assetId));
    if (!videos.length) {
      setMessage("Selecione um ou mais vídeos com áudio antes de remover silêncios.");
      return;
    }
    const separated = videos.find((clip) => {
      const group = state.audioGroups.find((candidate) => candidate.id === clip.audioGroupId || candidate.sourceVideoClipId === clip.id);
      return group && group.activeRepresentation !== "embedded";
    });
    if (separated) {
      setMessage("Restaure o áudio original deste vídeo antes de cortar por silêncio; assim imagem e áudio permanecem sincronizados.");
      return;
    }
    setRemovingSilence(true);
    setMessage(`Analisando pausas em ${videos.length} ${videos.length === 1 ? "vídeo" : "vídeos"}…`);
    try {
      const analyses = new Map<string, Awaited<ReturnType<typeof analyzeAudio>>>();
      const silenceOptions = { ...options, minSpeech: .2 };
      const plans = [];
      for (const video of videos) {
        const file = sourceFilesRef.current.get(video.assetId!);
        if (!file) throw new Error(`${video.name} precisa ser religado antes da análise de silêncio.`);
        let analysis = analyses.get(video.assetId!);
        if (!analysis) {
          analysis = await analyzeAudio(file);
          analyses.set(video.assetId!, analysis);
        }
        const silences = findSilences(analysis, silenceOptions);
        const ranges = keepRanges(analysis.duration, silences, silenceOptions)
          .map((range) => ({ start: Math.max(range.start, video.sourceIn), end: Math.min(range.end, video.sourceOut) }))
          .filter((range) => range.end - range.start >= silenceOptions.minSpeech);
        plans.push({ clipId: video.id, keepSourceRanges: ranges });
      }
      run(new RemoveSilenceCommand(plans, String(state.revisions.document + 1)), `Pausas removidas de ${videos.length} ${videos.length === 1 ? "vídeo" : "vídeos"}. Ctrl+Z desfaz toda a operação.`);
      setMobileSurface("timeline");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível analisar e remover os silêncios.");
    } finally {
      setRemovingSilence(false);
    }
  }, [run]);

  const removeSelected = useCallback(() => {
    const ids = busRef.current.getState().selection.itemIds.filter((id) => findClip(busRef.current.getState(), id));
    if (!ids.length) return;
    run(new DeleteClipsCommand(ids), `${ids.length} ${ids.length === 1 ? "item removido" : "itens removidos"}.`);
  }, [run]);

  const duplicateSelected = useCallback(() => {
    const state = busRef.current.getState();
    const ids = state.selection.itemIds.filter((id) => findClip(state, id));
    if (!ids.length) return setMessage("Selecione um clipe antes de duplicar.");
    run(new DuplicateClipsCommand(ids, String(state.revisions.document + 1)), `${ids.length === 1 ? "Cópia criada" : "Cópias criadas"} após a seleção. Ctrl+Z para desfazer.`);
    const duplicated = busRef.current.getState().selection.itemIds.map((id) => findClip(busRef.current.getState(), id)).filter((clip): clip is Clip => Boolean(clip));
    if (duplicated.length) seek(Math.min(...duplicated.map((clip) => Number(clip.projectStart))));
  }, [run, seek]);

  const selectedClipsForBatch = useCallback(() => {
    const state = busRef.current.getState();
    return state.selection.itemIds.map((id) => findClip(state, id)).filter((clip): clip is Clip => Boolean(clip));
  }, []);

  const setSelectedSpeed = useCallback((playbackRate: number) => {
    const targets = selectedClipsForBatch().filter((clip) => clip.kind === "video");
    if (!targets.length) return setMessage("Selecione um ou mais vídeos para mudar a velocidade.");
    const speed = Math.max(.1, Math.min(4, playbackRate));
    run(new UpdateClipsCommand(targets.map((clip) => ({ clipId: clip.id, patch: { playbackRate: speed, projectEnd: (Number(clip.projectStart) + (clip.sourceOut - clip.sourceIn) / speed) as Clip["projectEnd"] } }))), `Velocidade ${speed.toLocaleString("pt-BR")}× aplicada em ${targets.length} ${targets.length === 1 ? "vídeo" : "vídeos"}.`);
  }, [run, selectedClipsForBatch]);

  const toggleSelectedReverse = useCallback(() => {
    const targets = selectedClipsForBatch().filter((clip) => clip.kind === "video");
    if (!targets.length) return setMessage("Selecione um ou mais vídeos para inverter.");
    const reversed = !targets.every((clip) => clip.reversed);
    run(new UpdateClipsCommand(targets.map((clip) => ({ clipId: clip.id, patch: { reversed } }))), `${targets.length} ${targets.length === 1 ? "vídeo invertido" : "vídeos invertidos"}.`);
  }, [run, selectedClipsForBatch]);

  const toggleSelectedFlip = useCallback((axis: "horizontal" | "vertical") => {
    const targets = selectedClipsForBatch().filter((clip) => clip.kind === "video" || clip.kind === "image");
    if (!targets.length) return setMessage("Selecione um ou mais vídeos ou imagens para espelhar.");
    const key = axis === "horizontal" ? "flipHorizontal" : "flipVertical";
    const enabled = !targets.every((clip) => Boolean(clip[key]));
    run(new UpdateClipsCommand(targets.map((clip) => ({ clipId: clip.id, patch: { [key]: enabled } }))), `${targets.length} ${targets.length === 1 ? "item espelhado" : "itens espelhados"}.`);
  }, [run, selectedClipsForBatch]);

  const createCompound = useCallback(() => {
    const state = busRef.current.getState();
    const ids = state.selection.itemIds.filter((id) => Boolean(findClip(state, id)));
    if (ids.length < 2) return setMessage("Selecione pelo menos dois itens com Ctrl+clique para criar um clipe composto.");
    const serial = state.revisions.document + 1;
    run(new CreateCompoundClipCommand(ids, `compound-${serial}`, `Composto ${serial}`), `${ids.length} camadas agrupadas em um clipe composto editável.`);
  }, [run]);

  const dissolveCompound = useCallback(() => {
    const state = busRef.current.getState();
    const groups = [...new Set(state.selection.itemIds.map((id) => findClip(state, id)?.metadata?.["compoundGroupId"]).filter((id): id is string => typeof id === "string"))];
    if (groups.length !== 1) return setMessage("Selecione um único clipe composto para desagrupar.");
    run(new DissolveCompoundClipCommand(groups[0]!), "Clipe composto desagrupado; todas as camadas continuam editáveis.");
  }, [run]);

  const addTrack = useCallback((kind: "overlay" | "voice" | "music" | "sfx") => {
    const state = busRef.current.getState();
    const count = state.tracks.filter((track) => track.kind === kind).length + 1;
    const labels = { overlay: "Sobreposição", voice: "Voz", music: "Música", sfx: "Efeitos sonoros" } as const;
    const id = `track-${kind}-${state.revisions.document + 1}-${count}`;
    run(new AddTrackCommand({ id, kind, name: `${labels[kind]} ${count}`, order: state.tracks.length, locked: false, hidden: false, muted: false, solo: false, gain: 1, clips: [] }), `${labels[kind]} ${count} adicionada à timeline.`);
  }, [run]);

  const patchClipSelectionAware = useCallback((clipId: string, patch: Partial<Clip>) => {
    const state = busRef.current.getState();
    const ids = state.selection.itemIds.includes(clipId) ? state.selection.itemIds : [clipId];
    const clips = ids.map((id) => findClip(state, id)).filter((clip): clip is Clip => Boolean(clip));
    const supportsBatch = clips.length > 1 && ["playbackRate", "reversed", "flipHorizontal", "flipVertical", "adjustments", "motion", "enabled"].some((key) => key in patch);
    if (!supportsBatch) {
      run(new UpdateClipCommand(clipId, patch));
      return;
    }
    const targets = clips.filter((clip) => {
      if ("playbackRate" in patch || "reversed" in patch) return clip.kind === "video";
      if ("adjustments" in patch || "flipHorizontal" in patch || "flipVertical" in patch) return clip.kind === "video" || clip.kind === "image";
      if ("motion" in patch) return clip.kind !== "audio";
      return true;
    });
    if (!targets.length) return;
    const updates = targets.map((clip) => {
      if (patch.playbackRate !== undefined) {
        const playbackRate = Math.max(.1, Math.min(4, patch.playbackRate));
        return { clipId: clip.id, patch: { ...patch, playbackRate, projectEnd: (Number(clip.projectStart) + (clip.sourceOut - clip.sourceIn) / playbackRate) as Clip["projectEnd"] } };
      }
      return { clipId: clip.id, patch };
    });
    run(new UpdateClipsCommand(updates), `Ajuste aplicado em ${targets.length} itens selecionados.`);
  }, [run]);

  const exportProject = useCallback(async () => {
    if (exporting) { exportRef.current?.abort(); return; }
    const snapshot = busRef.current.getState();
    const visualClips = snapshot.tracks.flatMap((track) => track.clips).filter((clip) => clip.enabled && clip.kind !== "audio");
    if (!visualClips.length) { setMessage("Adicione um vídeo, imagem ou elemento antes de exportar."); return; }
    const controller = new AbortController();
    exportRef.current = controller;
    setExporting(true);
    setExportProgress(0);
    setMessage("Preparando a exportação…");
    try {
      const { renderEditorProjectV2 } = await import("@/lib/editor-v2/export");
      const blob = await renderEditorProjectV2({
        project: snapshot,
        assetFiles: new Map(sourceFilesRef.current),
        signal: controller.signal,
        onProgress: (progress, stage) => { setExportProgress(Math.round(progress * 100)); setMessage(`${stage} · ${Math.round(progress * 100)}%`); },
      });
      controller.signal.throwIfAborted();
      const safeName = snapshot.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "vaiviral-editor-v2";
      downloadBlob(blob, `${safeName}.mp4`);
      setMessage("MP4 exportado com o mesmo mix de áudio da prévia.");
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "Exportação cancelada." : error instanceof Error ? error.message : "Não foi possível exportar o projeto.");
    } finally {
      if (exportRef.current === controller) exportRef.current = null;
      setExporting(false);
    }
  }, [exporting]);

  const importFiles = useCallback(async (files: FileList | null, insertAt?: number) => {
    if (!files?.length) return;
    setImporting(true);
    let imported = 0;
    let captionBlocks = 0;
    let volatileImports = 0;
    for (const file of Array.from(files)) {
      try {
        const state = busRef.current.getState();
        if (/\.(srt|vtt)$/i.test(file.name)) {
          const rows = parseTimedText(await file.text());
          const presetItem = registry.get("builtin.caption.word-highlight") as LibraryItem<CaptionPresetDefinition> | null;
          if (!presetItem || !rows.length) throw new Error("O arquivo SRT/VTT não contém legendas válidas.");
          run(new AddCaptionBatchCommand(createCaptionBatch(rows, presetItem.definition, state.revisions.document + imported + 1)), `${rows.length} blocos de legenda importados e sincronizados.`);
          captionBlocks += rows.length;
          imported += 1;
          continue;
        }
        const waveformPromise = file.type.startsWith("audio/") ? analyzeAudioFile(file) : null;
        if (waveformPromise) void waveformPromise.catch(() => undefined);
        const runtime = await prepareLocalMedia(file, insertAt ?? Number(clockRef.current.getSnapshot().projectTime), state.revisions.document + imported + 1);
        const persisted = await persistEditorMedia(state.id, runtime.asset.id, file);
        if (persisted) runtime.asset.storagePath = editorMediaStoragePath(state.id, runtime.asset.id);
        else volatileImports += 1;
        runtimeUrlsRef.current.add(runtime.objectUrl);
        if (runtime.thumbnailUrl && runtime.thumbnailUrl !== runtime.objectUrl) runtimeUrlsRef.current.add(runtime.thumbnailUrl);
        setAssetSources((current) => ({ ...current, [runtime.asset.id]: runtime.objectUrl }));
        sourceFilesRef.current.set(runtime.asset.id, file);
        setAssetThumbnails((current) => ({ ...current, [runtime.asset.id]: runtime.thumbnailUrl ?? runtime.objectUrl }));
        run(new AddMediaClipCommand(runtime.asset, runtime.clip, runtime.audioGroup));
        if (runtime.asset.kind === "audio" && waveformPromise) {
          void waveformPromise.then((analysis) => {
            setAssetWaveforms((current) => ({ ...current, [runtime.asset.id]: analysis.peaks }));
            run(new UpdateAssetAnalysisCommand(runtime.asset.id, { cacheKey: analysis.cacheKey, status: "ready", sampleRate: analysis.sampleRate, channels: analysis.channels, durationMs: analysis.durationMs, peaks: analysis.peaks }), `Waveform pronta em ${Math.round(analysis.durationMs)} ms.`);
          }).catch((error) => run(new UpdateAssetAnalysisCommand(runtime.asset.id, { cacheKey: runtime.asset.audioAnalysis?.cacheKey ?? runtime.asset.id, status: "error", error: error instanceof Error ? error.message : "Falha na waveform" }), "Áudio importado; waveform indisponível."));
        }
        imported += 1;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível importar a mídia.");
      }
    }
    setImporting(false);
    if (captionBlocks) setMessage(`${captionBlocks} ${captionBlocks === 1 ? "bloco de legenda importado" : "blocos de legenda importados"} e sincronizados.`);
    else if (imported) setMessage(volatileImports ? `${imported} ${imported === 1 ? "mídia importada" : "mídias importadas"}; ${volatileImports} ficará apenas nesta sessão porque o armazenamento local não respondeu.` : `${imported} ${imported === 1 ? "mídia importada e salva" : "mídias importadas e salvas"} neste navegador.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [registry, run]);

  const insertMediaAsset = useCallback((asset: MediaAsset, insertAt?: number) => {
    try {
      const state = busRef.current.getState();
      const at = insertAt ?? Number(clockRef.current.getSnapshot().projectTime);
      const serial = state.revisions.document + state.tracks.reduce((total, track) => total + track.clips.length, 0) + 1;
      const insertion = createMediaClipFromAsset(asset, at, serial);
      run(new InsertMediaClipCommand(insertion.clip, insertion.audioGroup), `${asset.name} inserido em ${formatProjectTime(at)}.`);
      setMobileSurface("canvas");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível inserir a mídia novamente.");
    }
  }, [run]);

  const removeMediaAsset = useCallback(async (asset: MediaAsset) => {
    const state = busRef.current.getState();
    const inUse = state.tracks.some((owner) => owner.clips.some((clip) => clip.assetId === asset.id));
    run(new RemoveMediaAssetFromLibraryCommand(asset.id), inUse
      ? `${asset.name} foi removido da biblioteca. Os clipes existentes foram preservados.`
      : `${asset.name} foi excluído da biblioteca e do armazenamento local.`);
    if (inUse) return;
    sourceFilesRef.current.delete(asset.id);
    const release = (url?: string) => {
      if (!url) return;
      URL.revokeObjectURL(url);
      runtimeUrlsRef.current.delete(url);
    };
    setAssetSources((current) => { release(current[asset.id]); const { [asset.id]: _removed, ...next } = current; return next; });
    setAssetThumbnails((current) => { release(current[asset.id]); const { [asset.id]: _removed, ...next } = current; return next; });
    setAssetWaveforms((current) => { const { [asset.id]: _removed, ...next } = current; return next; });
    await deleteEditorMedia(state.id, asset.id);
  }, [run]);

  const extractSelectedAudio = useCallback(async () => {
    const state = busRef.current.getState();
    const selected = findClip(state, state.selection.primaryId);
    const group = selected ? state.audioGroups.find((item) => item.id === selected.audioGroupId || item.sourceVideoClipId === selected.id || item.extractedClipId === selected.id || item.dialogueClipId === selected.id || item.musicClipId === selected.id) : undefined;
    const videoClip = group ? sourceVideoClipForAudioSelection(state, selected, group) : undefined;
    const sourceAsset = videoClip?.assetId ? state.assets.find((asset) => asset.id === videoClip.assetId) : undefined;
    const sourceFile = sourceAsset ? sourceFilesRef.current.get(sourceAsset.id) : undefined;
    if (!group || !videoClip || !sourceAsset || !sourceFile) { setMessage("O arquivo original deste vídeo não está disponível nesta sessão."); return; }
    const controller = new AbortController();
    audioExtractionRef.current?.abort();
    audioExtractionRef.current = controller;
    setExtractingAudio(true);
    setMessage("Lendo o áudio do vídeo…");
    try {
      const result = await extractAudioFromMediaFile(sourceFile, {
        signal: controller.signal,
        sourceIn: videoClip.sourceIn,
        sourceOut: videoClip.sourceOut,
        onStage: (stage) => setMessage(stage === "reading" ? "Lendo o arquivo…" : stage === "decoding" ? "Decodificando o áudio…" : "Criando áudio editável…"),
      });
      const prepared = buildExtractedAudioMedia({ sourceAsset, sourceClip: videoClip, group, result, revision: state.revisions.document + 1 });
      const audioFile = new File([result.wav], `${prepared.asset.id}.wav`, { type: "audio/wav", lastModified: Date.now() });
      const persisted = await persistEditorMedia(state.id, prepared.asset.id, audioFile);
      if (persisted) prepared.asset.storagePath = editorMediaStoragePath(state.id, prepared.asset.id);
      const objectUrl = URL.createObjectURL(audioFile);
      try {
        const next = busRef.current.execute(new RegisterExtractedAudioCommand(prepared.group, prepared.asset, prepared.clip));
        runtimeUrlsRef.current.add(objectUrl);
        const previousAssetId = group.originalAudioAssetId;
        if (previousAssetId && previousAssetId !== prepared.asset.id) sourceFilesRef.current.delete(previousAssetId);
        sourceFilesRef.current.set(prepared.asset.id, audioFile);
        setAssetSources((current) => {
          const nextSources = { ...current, [prepared.asset.id]: objectUrl };
          if (previousAssetId && previousAssetId !== prepared.asset.id) {
            const previousUrl = nextSources[previousAssetId];
            if (previousUrl) { URL.revokeObjectURL(previousUrl); runtimeUrlsRef.current.delete(previousUrl); }
            delete nextSources[previousAssetId];
          }
          return nextSources;
        });
        setAssetWaveforms((current) => { const nextWaveforms = { ...current, [prepared.asset.id]: result.peaks }; if (previousAssetId && previousAssetId !== prepared.asset.id) delete nextWaveforms[previousAssetId]; return nextWaveforms; });
        setProject(next);
        setMessage(persisted ? "Áudio extraído, salvo e vinculado ao vídeo. O som embutido foi desativado." : "Áudio extraído e vinculado. O armazenamento local não respondeu; religue ou extraia novamente após recarregar.");
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "Extração cancelada; o áudio anterior foi preservado." : error instanceof Error ? error.message : "Não foi possível extrair o áudio.");
    } finally {
      if (audioExtractionRef.current === controller) audioExtractionRef.current = null;
      setExtractingAudio(false);
    }
  }, []);

  const separateSelectedAudio = useCallback(async () => {
    if (audioSeparationRef.current) return;
    setAudioSeparationError(false);
    const report = (status: string) => { setAudioSeparationStatus(status); setMessage(status); };
    const initial = busRef.current.getState();
    const selected = findClip(initial, initial.selection.primaryId);
    const initialGroup = selected ? initial.audioGroups.find((item) => item.id === selected.audioGroupId || item.sourceVideoClipId === selected.id || item.extractedClipId === selected.id || item.dialogueClipId === selected.id || item.musicClipId === selected.id) : undefined;
    const videoClip = initialGroup ? sourceVideoClipForAudioSelection(initial, selected, initialGroup) : undefined;
    const sourceAsset = videoClip?.assetId ? initial.assets.find((asset) => asset.id === videoClip.assetId) : undefined;
    if (!initialGroup || !videoClip || !sourceAsset) { setAudioSeparationError(true); report("Selecione um vídeo ou uma de suas trilhas de áudio."); return; }

    // Bandit accepts at most 180 seconds. Reject known-long sources before
    // Web Audio decodes them, otherwise the UI appears stuck while the worker
    // will reject the upload later.
    const clipDuration = Number(videoClip.sourceOut - videoClip.sourceIn);
    const knownDuration = Number.isFinite(clipDuration) && clipDuration > 0 ? clipDuration : Number(sourceAsset.duration);
    if (Number.isFinite(knownDuration) && knownDuration > 180.15) {
      setAudioSeparationError(true);
      report(`Este trecho tem ${Math.round(knownDuration)} segundos. Separe um trecho de até 180 segundos por vez.`);
      return;
    }

    const controller = new AbortController();
    audioSeparationRef.current = controller;
    setSeparatingAudio(true);
    // Keep the project untouched while the worker runs. The extracted WAV is
    // only a transport file for Bandit; it is not a completed editor result.
    // Both separated stems are committed together after they are available.
    const workingGroup = initialGroup;
    const jobRepository = new AudioSeparationJobRepository(window.localStorage);
    let jobRecord: AudioSeparationJobRecord | undefined;
    const recordJobStatus = async (status: "uploaded" | "queued" | "processing" | "downloading") => {
      if (!jobRecord) return;
      jobRecord = transitionAudioSeparationJob(jobRecord, status);
      jobRepository.save(jobRecord);
      await updateAudioSeparationJob({ data: { id: jobRecord.id, status } }).catch(() => undefined);
    };
    try {
      const cachedSourceAsset = initial.assets.find((asset) => asset.id === initialGroup.originalAudioAssetId);
      let sourceWav = initialGroup.originalAudioAssetId && assetMatchesSourceRange(cachedSourceAsset, videoClip)
        ? sourceFilesRef.current.get(initialGroup.originalAudioAssetId)
        : undefined;
      if (!sourceWav) {
        const sourceFile = sourceFilesRef.current.get(sourceAsset.id);
        if (!sourceFile) throw new Error("O arquivo original precisa ser religado antes de separar o áudio.");
        report("Preparando o trecho de áudio…");
        const extracted = await extractAudioFromMediaFile(sourceFile, {
          signal: controller.signal,
          sourceIn: videoClip.sourceIn,
          sourceOut: videoClip.sourceOut,
          onStage: (stage) => report(stage === "reading" ? "Lendo o vídeo…" : stage === "decoding" ? "Decodificando o áudio…" : "Criando a fonte de áudio…"),
        });
        sourceWav = new File(
          [extracted.wav],
          `${sourceAsset.id}-separation-source.wav`,
          { type: "audio/wav", lastModified: Date.now() },
        );
      }

      controller.signal.throwIfAborted();
      const separationSourceRevision = workingGroup.sourceRevision;
      const separationSourceFingerprint = sourceAsset.hash ?? `asset:${sourceAsset.id}`;
      const separationClipFingerprint = `${videoClip.id}:${videoClip.sourceIn}:${videoClip.sourceOut}:${videoClip.playbackRate}`;
      const clipDuration = videoClip.sourceOut - videoClip.sourceIn;
      const sourceDuration = Number.isFinite(clipDuration) && clipDuration > 0 ? clipDuration : sourceAsset.duration;
      if (!Number.isFinite(sourceDuration) || sourceDuration! <= 0) throw new Error("Não foi possível congelar a duração do áudio fonte.");
      report("Conectando ao separador de diálogo e música…");
      const ticket = await prepareAudioSeparation({ data: {
        projectId: initial.id,
        groupId: workingGroup.id,
        sourceAssetId: sourceAsset.id,
        sourceRevision: separationSourceRevision,
        sourceFingerprint: separationSourceFingerprint,
        sourceIn: 0,
        sourceOut: sourceDuration!,
      } });
      const jobId = ticket.jobId ?? ticket.base.split("/").filter(Boolean).at(-1);
      if (!jobId) throw new Error("O serviço não retornou um identificador de processamento.");
      jobRecord = createAudioSeparationJob({
        id: jobId,
        projectId: initial.id,
        groupId: workingGroup.id,
        sourceAssetId: sourceAsset.id,
        sourceRevision: separationSourceRevision,
        sourceFingerprint: separationSourceFingerprint,
        sourceInterval: { in: 0, out: sourceDuration! },
        recipe: ticket.recipe ?? { id: "service-default", revision: "capabilities-not-reported" },
      });
      jobRepository.save(jobRecord);
      const separationSampleRate: 44_100 | 48_000 = ticket.sampleRate === 48_000 ? 48_000 : 44_100;
      report(`Preparando o áudio em ${separationSampleRate.toLocaleString("pt-BR")} Hz…`);
      const separationWav = await prepareAudioForSeparation(sourceWav, {
        signal: controller.signal,
        maxDuration: ticket.maxDuration,
        targetSampleRate: separationSampleRate,
      });
      const result = await runStemJob(ticket, separationWav, {
        signal: controller.signal,
        onStage: report,
        onStatus: recordJobStatus,
      });
      controller.signal.throwIfAborted();

      report("Preparando as faixas de diálogo e música para a timeline…");
      const state = busRef.current.getState();
      const currentGroup = state.audioGroups.find((item) => item.id === workingGroup.id);
      const currentSourceAsset = state.assets.find((asset) => asset.id === sourceAsset.id);
      const currentVideoClip = findClip(state, videoClip.id);
      const currentSourceFingerprint = currentSourceAsset?.hash ?? (currentSourceAsset ? `asset:${currentSourceAsset.id}` : undefined);
      if (
        !currentGroup
        || !currentVideoClip
        || currentGroup.sourceAssetId !== sourceAsset.id
        || currentGroup.sourceRevision !== separationSourceRevision
        || currentSourceFingerprint !== separationSourceFingerprint
        || `${currentVideoClip.id}:${currentVideoClip.sourceIn}:${currentVideoClip.sourceOut}:${currentVideoClip.playbackRate}` !== separationClipFingerprint
      ) throw new Error("A fonte mudou enquanto o áudio era processado. O resultado não foi aplicado.");
      const revision = Math.max(1, currentGroup.sourceRevision + 1);
      const dialogueId = `${sourceAsset.id}-stem-voice-r${revision}`;
      const musicId = `${sourceAsset.id}-stem-music-r${revision}`;
      const dialogueType = result.voice.type || "audio/wav";
      const musicType = result.music.type || "audio/wav";
      const dialogueFile = new File([result.voice], `${dialogueId}.${audioFileExtension(dialogueType)}`, { type: dialogueType, lastModified: Date.now() });
      const musicFile = new File([result.music], `${musicId}.${audioFileExtension(musicType)}`, { type: musicType, lastModified: Date.now() });
      const [dialogueAnalysis, musicAnalysis, dialoguePersisted, musicPersisted, dialogueCloudPath, musicCloudPath] = await Promise.all([
        analyzeAudioFile(dialogueFile),
        analyzeAudioFile(musicFile),
        persistEditorMedia(state.id, dialogueId, dialogueFile),
        persistEditorMedia(state.id, musicId, musicFile),
        uploadAudioStem(jobId, "dialogue", dialogueFile),
        uploadAudioStem(jobId, "music", musicFile),
      ]);
      controller.signal.throwIfAborted();
      const applicationState = busRef.current.getState();
      const applicationGroup = applicationState.audioGroups.find((item) => item.id === workingGroup.id);
      const applicationSource = applicationState.assets.find((asset) => asset.id === sourceAsset.id);
      const applicationVideoClip = findClip(applicationState, videoClip.id);
      const applicationFingerprint = applicationSource?.hash ?? (applicationSource ? `asset:${applicationSource.id}` : undefined);
      if (
        !applicationGroup
        || !applicationVideoClip
        || applicationGroup.sourceRevision !== separationSourceRevision
        || applicationGroup.sourceAssetId !== sourceAsset.id
        || applicationFingerprint !== separationSourceFingerprint
        || `${applicationVideoClip.id}:${applicationVideoClip.sourceIn}:${applicationVideoClip.sourceOut}:${applicationVideoClip.playbackRate}` !== separationClipFingerprint
      ) throw new Error("A fonte mudou antes da aplicação. As novas trilhas foram preservadas, mas não substituíram o projeto.");
      const dialogueStoragePath = dialoguePersisted ? editorMediaStoragePath(applicationState.id, dialogueId) : `local-session://${dialogueId}`;
      const musicStoragePath = musicPersisted ? editorMediaStoragePath(applicationState.id, musicId) : `local-session://${musicId}`;
      if (jobRecord) {
        const durableOutputs = dialogueCloudPath && musicCloudPath
          ? { dialogueStorageKey: dialogueCloudPath, musicStorageKey: musicCloudPath, duration: result.duration }
          : undefined;
        jobRecord = durableOutputs
          ? transitionAudioSeparationJob(jobRecord, "completed", { outputs: durableOutputs })
          : transitionAudioSeparationJob(jobRecord, "failed", { error: { code: "cloud_stem_persistence_failed", retryable: true } });
        jobRepository.save(jobRecord);
        await updateAudioSeparationJob({ data: durableOutputs
          ? { id: jobRecord.id, status: "completed", outputs: durableOutputs }
          : { id: jobRecord.id, status: "failed", error: { code: "cloud_stem_persistence_failed", retryable: true } }
        }).catch(() => undefined);
      }
      const built = buildSeparatedAudioMedia({
        sourceAsset,
        sourceClip: videoClip,
        group: applicationGroup,
        duration: result.duration,
        revision,
        dialogue: { storagePath: dialogueCloudPath ?? dialogueStoragePath, mimeType: dialogueType, hash: `${dialogueFile.name}:${dialogueFile.size}:${dialogueFile.lastModified}`, analysis: dialogueAnalysis },
        music: { storagePath: musicCloudPath ?? musicStoragePath, mimeType: musicType, hash: `${musicFile.name}:${musicFile.size}:${musicFile.lastModified}`, analysis: musicAnalysis },
        jobId,
        ...(result.engine ? { engine: result.engine } : {}),
        ...(result.model ? { model: result.model } : {}),
      });
      const previousAssetIds = [applicationGroup.dialogueClipId, applicationGroup.musicClipId]
        .filter((id): id is string => Boolean(id))
        .map((id) => findClip(applicationState, id)?.assetId)
        .filter((id): id is string => Boolean(id));
      const dialogueUrl = URL.createObjectURL(dialogueFile);
      const musicUrl = URL.createObjectURL(musicFile);
      try {
        const next = busRef.current.execute(new ApplySeparatedAudioCommand(applicationGroup.id, built.dialogueAsset, built.musicAsset, built.dialogueClip, built.musicClip));
        runtimeUrlsRef.current.add(dialogueUrl);
        runtimeUrlsRef.current.add(musicUrl);
        sourceFilesRef.current.set(built.dialogueAsset.id, dialogueFile);
        sourceFilesRef.current.set(built.musicAsset.id, musicFile);
        for (const previousId of previousAssetIds) sourceFilesRef.current.delete(previousId);
        setAssetSources((current) => {
          const nextSources = { ...current, [built.dialogueAsset.id]: dialogueUrl, [built.musicAsset.id]: musicUrl };
          for (const previousId of previousAssetIds) {
            const previousUrl = nextSources[previousId];
            if (previousUrl) { URL.revokeObjectURL(previousUrl); runtimeUrlsRef.current.delete(previousUrl); }
            delete nextSources[previousId];
          }
          return nextSources;
        });
        setAssetWaveforms((current) => {
          const nextWaveforms = { ...current, [built.dialogueAsset.id]: dialogueAnalysis.peaks, [built.musicAsset.id]: musicAnalysis.peaks };
          for (const previousId of previousAssetIds) delete nextWaveforms[previousId];
          return nextWaveforms;
        });
        setProject(next);
        setMobileSurface("timeline");
        report(dialogueCloudPath && musicCloudPath
          ? ticket.persistenceReady
            ? "Diálogo e música foram separados, salvos na conta e aplicados em duas faixas. Use solo ou mudo para comparar."
            : "Diálogo e música foram separados, salvos e aplicados. O histórico do processamento será ativado após a atualização do banco."
          : dialoguePersisted && musicPersisted
            ? "Diálogo e música foram aplicados e salvos neste navegador; a cópia na nuvem precisa ser tentada novamente."
            : "Diálogo e música foram aplicados nesta sessão; o armazenamento não salvou uma ou mais trilhas.");
      } catch (error) {
        URL.revokeObjectURL(dialogueUrl);
        URL.revokeObjectURL(musicUrl);
        throw error;
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const failure = cancelled ? "Separação cancelada; o áudio anterior foi preservado." : error instanceof Error ? error.message : "Não foi possível separar diálogo e música.";
      setAudioSeparationError(!cancelled);
      report(failure);
      if (!cancelled) toast.error("Não foi possível separar o áudio", { description: failure, duration: 12_000 });
      if (jobRecord && jobRecord.status !== "completed" && jobRecord.status !== "failed" && jobRecord.status !== "cancelled") {
        try {
          if (error instanceof DOMException && error.name === "AbortError") {
            jobRecord = transitionAudioSeparationJob(jobRecord, "cancelling");
            await updateAudioSeparationJob({ data: { id: jobRecord.id, status: "cancelling" } }).catch(() => undefined);
            jobRecord = transitionAudioSeparationJob(jobRecord, "cancelled");
            await updateAudioSeparationJob({ data: { id: jobRecord.id, status: "cancelled" } }).catch(() => undefined);
          } else {
            jobRecord = transitionAudioSeparationJob(jobRecord, "failed", { error: { code: "client_separation_failed", retryable: true } });
            await updateAudioSeparationJob({ data: { id: jobRecord.id, status: "failed", error: { code: "client_separation_failed", retryable: true } } }).catch(() => undefined);
          }
          jobRepository.save(jobRecord);
        } catch { /* preserve the original processing error */ }
      }
    } finally {
      if (audioSeparationRef.current === controller) audioSeparationRef.current = null;
      setSeparatingAudio(false);
    }
  }, []);

  const requestRelink = useCallback((assetId: string) => {
    relinkAssetIdRef.current = assetId;
    relinkInputRef.current?.click();
  }, []);

  const relinkMedia = useCallback(async (files: FileList | null) => {
    const assetId = relinkAssetIdRef.current;
    const file = files?.[0];
    relinkAssetIdRef.current = null;
    if (relinkInputRef.current) relinkInputRef.current.value = "";
    if (!assetId || !file) return;
    const state = busRef.current.getState();
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return setMessage("A mídia que seria religada não existe mais no projeto.");
    const validation = validateRelinkFile(asset, file);
    if (!validation.ok) return setMessage(validation.reason);
    const persisted = await persistEditorMedia(state.id, asset.id, file);
    await installRuntimeMedia(asset, file);
    setMissingAssetIds((current) => current.filter((id) => id !== asset.id));
    run(new UpdateMediaAssetCommand(asset.id, {
      storagePath: persisted ? editorMediaStoragePath(state.id, asset.id) : `local-session://${asset.id}`,
      mimeType: file.type || asset.mimeType,
      hash: `${file.name}:${file.size}:${file.lastModified}`,
    }));
    setMessage(persisted ? `${asset.name} foi religado e salvo neste navegador.` : `${asset.name} foi religado apenas para esta sessão.`);
  }, [installRuntimeMedia, run]);

  const generateAutomaticCaptions = useCallback(async () => {
    const state = busRef.current.getState();
    const selected = findClip(state, state.selection.primaryId) ?? findClip(state, lastSelectedClipIdRef.current);
    const video = selected?.kind === "video"
      ? selected
      : state.tracks.flatMap((track) => track.clips).find((clip) => clip.kind === "video" && clip.assetId && sourceFilesRef.current.has(clip.assetId));
    const file = video?.assetId ? sourceFilesRef.current.get(video.assetId) : undefined;
    if (!video || !file) {
      const warning = "Importe e selecione um vídeo local para gerar legendas automáticas.";
      setMessage(warning);
      toast.info(warning);
      return;
    }
    const chosenStyle = state.selection.surface === "library" ? registry.get(state.selection.primaryId ?? "") : null;
    const presetItem = (chosenStyle?.type === "caption" ? chosenStyle : registry.get("builtin.caption.word-highlight")) as LibraryItem<CaptionPresetDefinition> | null;
    if (!presetItem) return setMessage("O preset padrão de legenda não está disponível.");
    setTranscribing(true);
    setCaptionProgress(0);
    setMessage("Detectando fala no vídeo…");
    try {
      const sourceIn = Number(video.sourceIn);
      const sourceOut = Number(video.sourceOut);
      const cues = await generateCaptions(file, {
        clip: { start: sourceIn, end: sourceOut },
        language: "pt",
        onProgress: ({ done, total }) => {
          const progress = total ? Math.round(done / total * 100) : 0;
          setCaptionProgress(progress);
          setMessage(`Gerando legendas… ${progress}%`);
        },
      });
      const mapRange = (start: number, end: number) => {
        const first = Number(sourceToProjectTime(video, start) ?? video.projectStart);
        const last = Number(sourceToProjectTime(video, end) ?? video.projectEnd);
        return { start: Math.min(first, last), end: Math.max(first, last) };
      };
      const mapped = cues.map((cue) => ({
        ...mapRange(cue.start, cue.end),
        words: cue.words.map((word) => ({ ...word, ...mapRange(word.start, word.end) })),
      })).sort((left, right) => left.start - right.start);
      if (!mapped.length) throw new Error("Nenhuma fala foi encontrada no trecho selecionado.");
      run(new AddCaptionBatchCommand(createCaptionBatchFromTimedWords(mapped, presetItem.definition, state.revisions.document + 1)), `${mapped.length} blocos de legenda gerados com o estilo ${presetItem.name}.`);
      toast.success(`${mapped.length} blocos de legenda criados e sincronizados.`);
      setMobileSurface("timeline");
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Não foi possível gerar as legendas.";
      setMessage(failure);
      toast.error(failure, { duration: 7000 });
    } finally {
      setTranscribing(false);
      setCaptionProgress(0);
    }
  }, [registry, run]);

  useEffect(() => () => { audioExtractionRef.current?.abort(); audioSeparationRef.current?.abort(); soundPreviewRef.current?.audio.pause(); if (soundPreviewRef.current) URL.revokeObjectURL(soundPreviewRef.current.url); runtimeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); runtimeUrlsRef.current.clear(); }, []);

  useEffect(() => {
    if (!clock.playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const duration = busRef.current.getState().settings.duration;
      const mediaClockIsFresh = now - lastMediaClockAtRef.current < 180;
      const next = mediaClockIsFresh
        ? clockRef.current.getSnapshot()
        : clockRef.current.tick((now - previous) / 1000);
      previous = now;
      if (Number(next.projectTime) >= duration) {
        clockRef.current.seek(0);
        setClock(clockRef.current.pause());
        return;
      }
      setClock(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock.playing]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const command = event.ctrlKey || event.metaKey;
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
      else if ((event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); removeSelected(); }
      else if (command && event.key.toLowerCase() === "z" && event.shiftKey) { event.preventDefault(); redo(); }
      else if (command && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      else if (command && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); }
      else if (event.key.toLowerCase() === "s") { event.preventDefault(); split(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); seek(Number(clockRef.current.getSnapshot().projectTime) - (event.shiftKey ? 1 : 1 / project.settings.fps)); }
      else if (event.key === "ArrowRight") { event.preventDefault(); seek(Number(clockRef.current.getSnapshot().projectTime) + (event.shiftKey ? 1 : 1 / project.settings.fps)); }
      else if (event.key === "Escape") run(new SelectItemCommand([], null));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [project.settings.fps, duplicateSelected, redo, removeSelected, run, seek, split, togglePlayback, undo]);

  const selectedClip = findClip(project, project.selection.primaryId);
  const selectedTrack = selectedClip ? project.tracks.find((track) => track.id === selectedClip.trackId) : undefined;
  const selectedAudioGroup = selectedClip ? project.audioGroups.find((group) => group.id === selectedClip.audioGroupId || group.sourceVideoClipId === selectedClip.id || group.extractedClipId === selectedClip.id || group.dialogueClipId === selectedClip.id || group.musicClipId === selectedClip.id) : undefined;
  const activeAudioAssetIds = selectedAudioGroup ? audioAssetIdsForRepresentation(project, selectedAudioGroup) : [];
  const selectedAssetId = selectedClip?.assetId;
  const missingAsset = project.assets.find((asset) => missingAssetIds.includes(asset.id) && (activeAudioAssetIds.includes(asset.id) || asset.id === selectedAssetId)) ?? null;
  const transitionContext = findTransitionTarget(project, Number(clock.projectTime), selectedClip?.id ?? lastSelectedClipIdRef.current);
  const selectedLibraryItem = project.selection.surface === "library" ? registry.get(project.selection.primaryId ?? "") : null;
  const itemCount = project.tracks.reduce((total, track) => total + track.clips.length, 0);
  const canvasProps = {
    project,
    currentTime: Number(clock.projectTime),
    playing: clock.playing,
    assetSources,
    onPlaybackTime: syncPlaybackToMedia,
    onSelect: (id: string | null, additive?: boolean) => selectClip(id, additive, "canvas"),
    onTransform: (id: string, transform: ClipTransform) => run(new UpdateTransformAtTimeCommand(id, Number(clock.projectTime), transform, "easeInOut", String(project.revisions.document + 1)), "Posição atualizada."),
    onDropLibraryItem: (id: string) => { const item = registry.get(id); if (item) addLibraryItem(item); },
    onDropMediaAsset: (id: string) => { const asset = busRef.current.getState().assets.find((item) => item.id === id); if (asset) insertMediaAsset(asset); },
    onImportFiles: (files: FileList) => void importFiles(files),
  };
  const inspectorProps = {
    clip: selectedClip,
    selectionCount: project.selection.itemIds.filter((id) => Boolean(findClip(project, id))).length,
    track: selectedTrack ?? null,
    libraryItem: selectedLibraryItem,
    currentTime: Number(clock.projectTime),
    transitionContext,
    audioGroup: selectedAudioGroup ?? null,
    missingAsset,
    onRelink: (assetId: string) => requestRelink(assetId),
    onPatchClip: patchClipSelectionAware,
    onTransform: (id: string, transform: ClipTransform, easing: Easing) => run(new UpdateTransformAtTimeCommand(id, Number(clock.projectTime), transform, easing, String(project.revisions.document + 1))),
    onUpsertKeyframe: (property: AnimatableProperty, value: number, easing: Easing, keyframeId?: string) => { if (selectedClip) run(new UpsertKeyframeCommand(selectedClip.id, property, clipLocalTime(selectedClip, Number(clock.projectTime)), value, easing, keyframeId ?? `${selectedClip.id}-${property}-${project.revisions.document + 1}`), "Keyframe adicionado."); },
    onDeleteKeyframe: (property: AnimatableProperty, keyframeId: string) => { if (selectedClip) run(new DeleteKeyframeCommand(selectedClip.id, property, keyframeId), "Keyframe removido."); },
    onSeek: seek,
    onApplyTransition: (definitionId: string, duration: number, easing: Easing) => {
      if (!transitionContext) { setMessage("Posicione a agulha perto de um corte entre dois clipes."); return; }
      if (definitionId === "cut") {
        if (transitionContext.existing) run(new DeleteTransitionCommand(transitionContext.existing.id), "Corte seco restaurado.");
        else setMessage("Este ponto já usa corte seco.");
        return;
      }
      const definition = TRANSITION_DEFINITIONS.find((item) => item.id === definitionId);
      const maximum = Math.min(definition?.durationMax ?? 2, transitionContext.maxDuration);
      const minimum = definition?.durationMin ?? 0.1;
      const safeDuration = Math.min(maximum, Math.max(minimum, duration));
      run(new ApplyTransitionCommand({ id: transitionContext.existing?.id ?? `transition-${transitionContext.from.id}-${transitionContext.to.id}`, definitionId, fromClipId: transitionContext.from.id, toClipId: transitionContext.to.id, duration: safeDuration, easing, fallback: "cut", parameters: {} }), `Transição aplicada por ${safeDuration.toFixed(2)}s.`);
    },
    onDeleteTransition: (id: string) => run(new DeleteTransitionCommand(id), "Transição removida."),
    onPreviewTransition: (boundary: number, duration: number) => {
      const start = Math.max(0, boundary - Math.max(0.35, duration / 2 + 0.2));
      clockRef.current.seek(start);
      setClock(clockRef.current.play());
      setMessage("Reproduzindo a partir do corte selecionado.");
    },
    onUpsertAudioEnvelope: (gain: number, pointId?: string) => { if (selectedClip?.audio) run(new UpsertAudioEnvelopePointCommand(selectedClip.id, pointId ?? `${selectedClip.id}-gain-${project.revisions.document + 1}`, clipLocalTime(selectedClip, Number(clock.projectTime)), gain), "Ponto de volume adicionado."); },
    onDeleteAudioEnvelope: (pointId: string) => { if (selectedClip?.audio) run(new DeleteAudioEnvelopePointCommand(selectedClip.id, pointId), "Ponto de volume removido."); },
    audioSettings: project.settings.audio,
    onAudioSettings: (patch: Partial<EditorProjectV2["settings"]["audio"]>) => run(new UpdateProjectSettingsCommand({ audio: { ...project.settings.audio, ...patch } }), "Mix atualizado."),
    onTrackAudio: (patch: Partial<Pick<Track, "gain" | "muted" | "solo">>) => { if (selectedTrack) run(new UpdateTrackCommand(selectedTrack.id, patch), "Faixa de áudio atualizada."); },
    onAudioRepresentation: (representation: "embedded" | "extracted" | "separated") => { if (selectedAudioGroup) run(new SetAudioRepresentationCommand(selectedAudioGroup.id, representation), "Origem de áudio atualizada."); },
    onExtractAudio: () => void extractSelectedAudio(),
    onCancelAudioExtraction: () => audioExtractionRef.current?.abort(),
    extractingAudio,
    onSeparateAudio: () => void separateSelectedAudio(),
    onCancelAudioSeparation: () => audioSeparationRef.current?.abort(),
    onRestoreOriginalAudio: () => { if (selectedAudioGroup) run(new RestoreOriginalAudioCommand(selectedAudioGroup.id), "Áudio original restaurado."); },
    separatingAudio,
    audioSeparationStatus,
    audioSeparationError,
    onAddLibraryItem: addLibraryItem,
  };
  const timelineProps = {
    project,
    currentTime: Number(clock.projectTime),
    playing: clock.playing,
    zoom: timelineZoom,
    assetThumbnails,
    assetWaveforms,
    onZoom: setTimelineZoom,
    onSeek: seek,
    onSelect: (id: string, additive: boolean) => selectClip(id, additive, "timeline"),
    onMove: (id: string, trackId: string, start: number) => {
      const state = busRef.current.getState();
      const clip = findClip(state, id);
      const compoundGroupId = clip?.metadata?.["compoundGroupId"];
      if (typeof compoundGroupId === "string") run(new MoveCompoundClipCommand(compoundGroupId, id, start), "Clipe composto movido com todas as camadas.");
      else run(new MoveClipCommand(id, trackId, start), "Clipe movido.");
    },
    onTrim: (id: string, start: number, end: number) => run(new TrimClipCommand(id, start, end), "Duração atualizada."),
    onMoveKeyframe: (id: string, property: AnimatableProperty, keyframeId: string, localTime: number) => run(new MoveKeyframeCommand(id, property, keyframeId, localTime), "Keyframe movido."),
    onSplit: split,
    onAutoSplit: autoSplit,
    onRemoveSilence: removeSilence,
    removingSilence,
    onDuplicate: duplicateSelected,
    onDelete: removeSelected,
    onTogglePlayback: togglePlayback,
    onSkip: (seconds: number) => seek(Number(clockRef.current.getSnapshot().projectTime) + seconds),
    onBatchSpeed: setSelectedSpeed,
    onBatchToggleReverse: toggleSelectedReverse,
    onBatchToggleFlip: toggleSelectedFlip,
    onSelectAutoSplitParts: (mode: AutoSplitSelectionMode) => {
      const state = busRef.current.getState();
      run(new SelectAutoSplitPartsCommand(state.selection.itemIds, mode), `${mode === "all" ? "Todos os" : mode === "odd" ? "Cortes ímpares" : "Cortes pares"} selecionados.`);
    },
    onCreateCompound: createCompound,
    onDissolveCompound: dissolveCompound,
    onAddTrack: addTrack,
    onToggleSnap: () => run(new UpdateProjectSettingsCommand({ snapEnabled: !project.settings.snapEnabled })),
    onToggleRipple: () => run(new UpdateProjectSettingsCommand({ rippleEnabled: !project.settings.rippleEnabled })),
    onTrackPatch: (trackId: string, patch: Partial<Pick<Track, "muted" | "solo" | "gain" | "hidden" | "locked">>) => run(new UpdateTrackCommand(trackId, patch)),
    onDropLibraryItem: dropLibraryItem,
    onDropMediaAsset: (id: string, at: number) => { const asset = busRef.current.getState().assets.find((item) => item.id === id); if (asset) insertMediaAsset(asset, at); },
    onImportFiles: (files: FileList, at: number) => void importFiles(files, at),
    onSelectTransition: (transitionId: string) => {
      const state = busRef.current.getState();
      const transition = state.transitions.find((item) => item.id === transitionId);
      const from = transition ? findClip(state, transition.fromClipId) : null;
      if (!transition || !from) return;
      const item = registry.get(`builtin.transition.${transition.definitionId}`);
      if (item) run(new SelectItemCommand([item.id], "library"));
      seek(Number(from.projectEnd));
      setMobileSurface("inspector");
    },
    onResizeTransition: (transitionId: string, duration: number) => {
      const state = busRef.current.getState();
      const transition = state.transitions.find((item) => item.id === transitionId);
      if (!transition) return;
      const context = findTransitionTarget(state, Number(findClip(state, transition.fromClipId)?.projectEnd ?? 0), transition.fromClipId);
      const definition = TRANSITION_DEFINITIONS.find((item) => item.id === transition.definitionId);
      if (!context || !definition) return;
      const safe = Math.max(definition.durationMin, Math.min(duration, definition.durationMax, context.maxDuration));
      run(new ApplyTransitionCommand({ ...transition, duration: safe }), `Transição ajustada para ${safe.toFixed(2)}s.`);
    },
    onEditEffectRange: (clipId: string, effectId: string, start: number, end: number) => {
      const state = busRef.current.getState();
      const clip = findClip(state, clipId);
      if (!clip) return;
      const duration = Number(clip.projectEnd) - Number(clip.projectStart);
      const safeStart = Math.max(0, Math.min(duration - .04, start));
      const safeEnd = Math.min(duration, Math.max(safeStart + .04, end));
      run(new UpdateClipCommand(clipId, { effects: clip.effects.map((effect) => effect.id === effectId ? { ...effect, parameters: { ...effect.parameters, start: safeStart, end: safeEnd } } : effect) }), "Intervalo do efeito atualizado.");
      seek(Number(clip.projectStart) + safeStart);
      setMobileSurface("inspector");
    },
  };

  const libraryProps = {
    registry,
    revision: libraryRevision,
    selectedId: project.selection.surface === "library" ? project.selection.primaryId : null,
    onSelect: selectLibrary,
    onAdd: addLibraryItem,
    onGenerateCaptions: () => void generateAutomaticCaptions(),
    generatingCaptions: transcribing,
    captionProgress,
    mediaAssets: project.assets,
    assetThumbnails,
    importingMedia: importing,
    onImportFiles: (files: FileList, at?: number) => void importFiles(files, at),
    onInsertMedia: insertMediaAsset,
    onRemoveMedia: (asset: MediaAsset) => void removeMediaAsset(asset),
    onPreviewSoundEffect: previewSoundEffect,
  };

  return (
    <main className="editor-v2-shell flex h-dvh min-h-[620px] flex-col overflow-hidden text-foreground">
      <header className="editor-v2-topbar flex h-14 shrink-0 items-center gap-2 px-2 sm:px-3" aria-label="Barra principal do editor">
        <Link to="/editor" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/6 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Voltar ao editor atual"><ArrowLeft className="size-4" /></Link>
        <div className="mr-1 hidden items-center gap-2 sm:flex"><span className="editor-v2-logo grid size-7 place-items-center rounded-lg font-display text-[11px] font-bold text-white">V</span><span className="text-xs font-semibold">VaiViral</span><span className="rounded bg-white/6 px-1.5 py-0.5 text-[8px] font-semibold tracking-wide text-muted-foreground">V2</span></div>
        <div className="hidden h-5 w-px bg-white/8 sm:block" />
        <button type="button" className="flex min-w-0 max-w-48 items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium hover:bg-white/5"><span className="truncate">{project.name}</span><ChevronDown className="size-3 text-muted-foreground" /></button>
        <div className="ml-auto flex items-center gap-1">
          <label className="editor-tool-button editor-action-button gap-1" title="Proporção do vídeo">
            <Ratio className="size-3.5" />
            <span className="sr-only">Proporção do vídeo</span>
            <select aria-label="Proporção do vídeo" value={project.settings.aspectRatio} onChange={(event) => run(new SetProjectAspectRatioCommand(event.target.value as EditorProjectV2["settings"]["aspectRatio"]), `Formato alterado para ${event.target.value}.`)} className="cursor-pointer appearance-none rounded bg-transparent pr-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
            </select>
          </label>
          <input ref={fileInputRef} type="file" accept="video/*,audio/*,image/*,.srt,.vtt,text/vtt" multiple className="sr-only" aria-label="Selecionar mídias locais" onChange={(event) => void importFiles(event.target.files)} />
          <input ref={relinkInputRef} type="file" accept="video/*,audio/*,image/*" className="sr-only" aria-label="Religar arquivo de mídia" onChange={(event) => void relinkMedia(event.target.files)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="editor-tool-button editor-action-button"><Import className="size-3.5" /><span className="hidden md:inline">{importing ? "Importando…" : "Importar"}</span></button>
          <button type="button" onClick={() => void generateAutomaticCaptions()} disabled={transcribing} className="editor-tool-button editor-action-button" title="Gerar legendas com tempo por palavra"><Captions className="size-3.5" /><span className="hidden lg:inline">{transcribing ? `Legendando ${captionProgress}%` : "Legendar"}</span></button>
          <button type="button" onClick={undo} disabled={!busRef.current.canUndo} className="editor-icon-button" aria-label="Desfazer"><Undo2 className="size-4" /></button>
          <button type="button" onClick={redo} disabled={!busRef.current.canRedo} className="editor-icon-button" aria-label="Refazer"><Redo2 className="size-4" /></button>
          <span className="mx-1 hidden h-5 w-px bg-white/8 sm:block" />
          <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground md:flex"><Check className={`size-3 ${missingAssetIds.length ? "text-amber-300" : "text-emerald-400"}`} />{hydrated ? missingAssetIds.length ? `Local · ${missingAssetIds.length} ausente(s)` : `Local · rev. ${project.revisions.document}` : "Recuperando…"}</div>
          <button type="button" onClick={() => void exportProject()} aria-label={exporting ? `Cancelar download em ${exportProgress}%` : "Baixar vídeo"} title={exporting ? "Cancelar download" : "Baixar vídeo MP4 com o mix atual"} className="editor-export-button ml-1 flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold"><Download className="size-3.5" />{exporting ? `Cancelar ${exportProgress}%` : <span className="hidden sm:inline">Baixar vídeo</span>}</button>
        </div>
      </header>

      <div className="hidden min-h-0 flex-1 lg:block">
        <ResizablePanelGroup orientation="vertical" id="editor-v2-vertical">
          <ResizablePanel defaultSize="68%" minSize={360}>
            <ResizablePanelGroup orientation="horizontal" id="editor-v2-workspace">
              <ResizablePanel defaultSize={300} minSize={250} maxSize={430}><LibraryPanel {...libraryProps} /></ResizablePanel>
              <ResizableHandle withHandle className="bg-white/8 hover:bg-primary/50" />
              <ResizablePanel defaultSize="55%" minSize={420}><EditorCanvasV2 {...canvasProps} /></ResizablePanel>
              <ResizableHandle withHandle className="bg-white/8 hover:bg-primary/50" />
              <ResizablePanel defaultSize={320} minSize={290} maxSize={430}><InspectorV2 {...inspectorProps} /></ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-white/8 hover:bg-primary/50" />
          <ResizablePanel defaultSize="32%" minSize={190} maxSize="55%"><TimelineV2 {...timelineProps} /></ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <nav className="editor-v2-mobile-nav grid h-11 shrink-0 grid-cols-4" aria-label="Áreas do editor">
          {([['library', Library, 'Biblioteca'], ['canvas', Film, 'Prévia'], ['inspector', PanelRight, 'Inspector'], ['timeline', FolderOpen, 'Timeline']] as const).map(([id, Icon, label]) => <button key={id} type="button" onClick={() => setMobileSurface(id)} aria-pressed={mobileSurface === id} className={`flex items-center justify-center gap-1.5 text-[10px] ${mobileSurface === id ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}><Icon className="size-3.5" />{label}</button>)}
        </nav>
        <div className="min-h-0 flex-1">{mobileSurface === "library" ? <LibraryPanel {...libraryProps} /> : mobileSurface === "canvas" ? <EditorCanvasV2 {...canvasProps} /> : mobileSurface === "inspector" ? <InspectorV2 {...inspectorProps} /> : <TimelineV2 {...timelineProps} />}</div>
      </div>

      <footer className="editor-v2-statusbar flex h-9 shrink-0 items-center gap-2 px-2.5" aria-live="polite">
        <button type="button" onClick={togglePlayback} className="editor-icon-button size-7" aria-label={clock.playing ? "Pausar" : "Reproduzir"}>{clock.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
        <span className="font-mono text-[10px] tabular-nums text-foreground">{formatProjectTime(Number(clock.projectTime))}</span><span className="text-[10px] text-muted-foreground">/ {formatProjectTime(project.settings.duration)}</span>
        <span className="ml-auto truncate text-[10px] text-muted-foreground">{message}</span><span className="hidden text-[10px] tabular-nums text-muted-foreground sm:inline">{itemCount} itens</span>
      </footer>
      <AudioPreviewV2 project={project} currentTime={Number(clock.projectTime)} playing={clock.playing} assetSources={assetSources} />
    </main>
  );
}

function AudioPreviewV2({ project, currentTime, playing, assetSources }: { project: EditorProjectV2; currentTime: number; playing: boolean; assetSources: Record<string, string> }) {
  const layers = resolveAudioMixFrame(project, currentTime);
  return <div hidden aria-hidden>{layers.map((layer) => assetSources[layer.assetId] ? <AudioClipPreview key={layer.clipId} url={assetSources[layer.assetId]!} sourceTime={layer.sourceTime} playbackRate={layer.playbackRate} gain={layer.gain} playing={playing} /> : null)}</div>;
}

function audioAssetIdsForRepresentation(project: EditorProjectV2, group: EditorProjectV2["audioGroups"][number]) {
  const clipIds = group.activeRepresentation === "embedded"
    ? [group.sourceVideoClipId]
    : group.activeRepresentation === "extracted"
      ? [group.extractedClipId]
      : [group.dialogueClipId, group.musicClipId];
  return project.tracks.flatMap((track) => track.clips)
    .filter((clip) => clipIds.includes(clip.id))
    .map((clip) => clip.assetId)
    .filter((id): id is string => Boolean(id));
}

function AudioClipPreview({ url, sourceTime, playbackRate, gain, playing }: { url: string; sourceTime: number; playbackRate: number; gain: number; playing: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, gain));
  }, [gain]);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
    audio.preservesPitch = false;
  }, [playbackRate]);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (Math.abs(audio.currentTime - sourceTime) > .12) audio.currentTime = sourceTime;
  }, [sourceTime]);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (playing && gain > 0) void audio.play().catch(() => undefined); else audio.pause();
  }, [gain, playing]);
  useEffect(() => () => ref.current?.pause(), []);
  return <audio ref={ref} src={url} preload="auto" />;
}
