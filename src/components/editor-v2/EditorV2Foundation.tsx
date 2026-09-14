import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Captions, Check, ChevronDown, Film, FolderOpen, Import, Library, PanelRight, Pause, Play, Redo2, Undo2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  AddClipCommand,
  AddCaptionCueCommand,
  AddCaptionBatchCommand,
  AddMediaClipCommand,
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
  DuplicateClipsCommand,
  EditorCommandBus,
  MoveClipCommand,
  MoveKeyframeCommand,
  RegisterExtractedAudioCommand,
  RestoreOriginalAudioCommand,
  SelectItemCommand,
  SetAudioRepresentationCommand,
  SplitClipCommand,
  TrimClipCommand,
  UpdateClipCommand,
  UpdateProjectSettingsCommand,
  UpdateTrackCommand,
  UpdateAssetAnalysisCommand,
  UpdateMediaAssetCommand,
  UpdateTransformAtTimeCommand,
  UpsertKeyframeCommand,
  UpsertAudioEnvelopePointCommand,
  analyzeAudioFile,
  buildExtractedAudioMedia,
  buildSeparatedAudioMedia,
  captureVideoPoster,
  clipLocalTime,
  createEditorProjectV2,
  editorMediaStoragePath,
  extractAudioFromMediaFile,
  findClip,
  formatProjectTime,
  isLocalEditorAsset,
  persistEditorMedia,
  persistEditorProject,
  prepareLocalMedia,
  readEditorMedia,
  readEditorProject,
  resolveLibraryInsertion,
  resolveCaptionInsertion,
  parseTimedText,
  createCaptionBatch,
  createCaptionBatchFromTimedWords,
  createAudioSeparationJob,
  resolveTemplateApplication,
  transitionAudioSeparationJob,
  type AudioSeparationJobRecord,
  type Clip,
  type AnimatableProperty,
  type ClipTransform,
  type EditorCommand,
  type EditorProjectV2,
  type MediaAsset,
  type Track,
  validateRelinkFile,
  resolveAudioMixFrame,
} from "@/lib/editor-v2";
import { prepareAudioSeparation, updateAudioSeparationJob } from "@/lib/audio.functions";
import { downloadSourceFile, uploadAudioStem } from "@/lib/editor/media-cloud";
import { runStemJob } from "@/lib/editor/stem-service";
import { downloadBlob } from "@/lib/render";
import { generateCaptions } from "@/lib/captions";
import type { Easing } from "@/lib/video-template/types";
import { BUILT_IN_LIBRARY_ITEMS, LibraryRegistry, type CaptionPresetDefinition, type CreativeEffectDefinition, type FilterPresetDefinition, type LibraryItem, type MotionDefinition, type TemplateDefinition } from "@/lib/editor-v2/library";
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

export function EditorV2Foundation() {
  const registry = useMemo(() => new LibraryRegistry(BUILT_IN_LIBRARY_ITEMS), []);
  const busRef = useRef(new EditorCommandBus(createEditorProjectV2({ name: "Projeto sem título", duration: 15 })));
  const clockRef = useRef(new CompositionClock(() => busRef.current.getState().tracks.flatMap((track) => track.clips)));
  const [project, setProject] = useState<EditorProjectV2>(() => busRef.current.getState());
  const [clock, setClock] = useState(() => clockRef.current.getSnapshot());
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("canvas");
  const [message, setMessage] = useState("Editor V2 pronto para criar.");
  const [assetSources, setAssetSources] = useState<Record<string, string>>({});
  const [assetThumbnails, setAssetThumbnails] = useState<Record<string, string>>({});
  const [assetWaveforms, setAssetWaveforms] = useState<Record<string, number[]>>({});
  const [importing, setImporting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [captionProgress, setCaptionProgress] = useState(0);
  const [extractingAudio, setExtractingAudio] = useState(false);
  const [separatingAudio, setSeparatingAudio] = useState(false);
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
    if (!id) return run(new SelectItemCommand([], surface));
    lastSelectedClipIdRef.current = id;
    const current = busRef.current.getState().selection.itemIds;
    const ids = additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : [id];
    run(new SelectItemCommand(ids, surface));
  }, [run]);

  const selectLibrary = useCallback((item: LibraryItem) => run(new SelectItemCommand([item.id], "library")), [run]);
  const addLibraryItem = useCallback((item: LibraryItem, at = Number(clockRef.current.getSnapshot().projectTime)) => {
    const state = busRef.current.getState();
    const selected = findClip(state, state.selection.primaryId) ?? findClip(state, lastSelectedClipIdRef.current);
    if (item.type === "animation") {
      if (!selected || selected.kind === "audio") { setMessage("Selecione um clipe visual antes de aplicar a animação."); return; }
      const definition = item.definition as MotionDefinition;
      run(new UpdateClipCommand(selected.id, { motion: { ...(selected.motion ?? {}), [definition.slot]: { id: definition.id.replace(`${definition.slot}-`, ""), duration: definition.duration, intensity: definition.intensity, easing: definition.easing } } }), `${item.name} aplicado em ${definition.slot === "in" ? "entrada" : definition.slot === "out" ? "saída" : "loop"}.`);
      run(new SelectItemCommand([selected.id], "canvas"));
      setMobileSurface("inspector");
      return;
    }
    if (item.type === "filter") {
      if (!selected || !["video", "image"].includes(selected.kind)) { setMessage("Selecione um vídeo ou imagem antes de aplicar o filtro."); return; }
      const definition = item.definition as FilterPresetDefinition;
      run(new UpdateClipCommand(selected.id, { adjustments: structuredClone(definition.adjustments), metadata: { ...selected.metadata, filterPresetId: definition.id } }), `${item.name} aplicado ao clipe.`);
      run(new SelectItemCommand([selected.id], "canvas"));
      setMobileSurface("inspector");
      return;
    }
    if (item.type === "video-effect") {
      if (!selected || !["video", "image"].includes(selected.kind)) { setMessage("Selecione um vídeo ou imagem antes de aplicar o efeito."); return; }
      const definition = item.definition as CreativeEffectDefinition;
      const effect = { id: `${selected.id}-fx-${definition.id}-${state.revisions.document + 1}`, definitionId: definition.id, enabled: true, parameters: { start: Math.max(0, at - Number(selected.projectStart)), end: Math.min(Number(selected.projectEnd) - Number(selected.projectStart), Math.max(0, at - Number(selected.projectStart)) + definition.duration), intensity: definition.intensity } };
      run(new UpdateClipCommand(selected.id, { effects: [...selected.effects, effect] }), `${item.name} aplicado ao clipe.`);
      run(new SelectItemCommand([selected.id], "canvas"));
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
        const insertion = resolveCaptionInsertion(state, item as LibraryItem<CaptionPresetDefinition>, at, state.revisions.document + 1);
        run(new AddCaptionCueCommand(insertion.cue, insertion.clip), `${item.name} inserido com palavras temporizadas.`);
      }
      setMobileSurface("canvas");
      return;
    }
    const clip = resolveLibraryInsertion(state, item, at, state.revisions.document + 1);
    if (!clip) {
      setMessage(`${item.name} precisa ser aplicado a um clipe compatível; esta etapa não altera o render atual.`);
      return;
    }
    run(new AddClipCommand(clip), `${item.name} inserido em ${formatProjectTime(at)}.`);
    setMobileSurface("canvas");
  }, [run]);

  const undo = useCallback(() => { setProject(busRef.current.undo()); setMessage("Ação desfeita."); }, []);
  const redo = useCallback(() => { setProject(busRef.current.redo()); setMessage("Ação refeita."); }, []);
  const seek = useCallback((time: number) => setClock(clockRef.current.seek(Math.min(busRef.current.getState().settings.duration, time))), []);
  const togglePlayback = useCallback(() => setClock((value) => value.playing ? clockRef.current.pause() : clockRef.current.play()), []);

  const split = useCallback(() => {
    const state = busRef.current.getState();
    const clip = findClip(state, state.selection.primaryId);
    if (!clip) return setMessage("Selecione um clipe antes de dividir.");
    run(new SplitClipCommand(clip.id, Number(clockRef.current.getSnapshot().projectTime), `${clip.id}-split-${state.revisions.document + 1}`), "Clipe dividido na agulha.");
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

  const importFiles = useCallback(async (files: FileList | null) => {
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
        const runtime = await prepareLocalMedia(file, Number(clockRef.current.getSnapshot().projectTime), state.revisions.document + imported + 1);
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

  const extractSelectedAudio = useCallback(async () => {
    const state = busRef.current.getState();
    const selected = findClip(state, state.selection.primaryId);
    const group = selected ? state.audioGroups.find((item) => item.sourceVideoClipId === selected.id || item.extractedClipId === selected.id || item.dialogueClipId === selected.id || item.musicClipId === selected.id) : undefined;
    const videoClip = group?.sourceVideoClipId ? findClip(state, group.sourceVideoClipId) : undefined;
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
    const initial = busRef.current.getState();
    const selected = findClip(initial, initial.selection.primaryId);
    const initialGroup = selected ? initial.audioGroups.find((item) => item.sourceVideoClipId === selected.id || item.extractedClipId === selected.id || item.dialogueClipId === selected.id || item.musicClipId === selected.id) : undefined;
    const videoClip = initialGroup?.sourceVideoClipId ? findClip(initial, initialGroup.sourceVideoClipId) : undefined;
    const sourceAsset = videoClip?.assetId ? initial.assets.find((asset) => asset.id === videoClip.assetId) : undefined;
    if (!initialGroup || !videoClip || !sourceAsset) { setMessage("Selecione um vídeo ou uma de suas trilhas de áudio."); return; }

    const controller = new AbortController();
    audioSeparationRef.current = controller;
    setSeparatingAudio(true);
    let workingGroup = initialGroup;
    const jobRepository = new AudioSeparationJobRepository(window.localStorage);
    let jobRecord: AudioSeparationJobRecord | undefined;
    const recordJobStatus = async (status: "uploaded" | "queued" | "processing" | "downloading") => {
      if (!jobRecord) return;
      jobRecord = transitionAudioSeparationJob(jobRecord, status);
      jobRepository.save(jobRecord);
      await updateAudioSeparationJob({ data: { id: jobRecord.id, status } }).catch(() => undefined);
    };
    try {
      let sourceWav = initialGroup.originalAudioAssetId ? sourceFilesRef.current.get(initialGroup.originalAudioAssetId) : undefined;
      if (!sourceWav) {
        const sourceFile = sourceFilesRef.current.get(sourceAsset.id);
        if (!sourceFile) throw new Error("O arquivo original precisa ser religado antes de separar o áudio.");
        setMessage("Preparando o áudio completo para separar…");
        const extracted = await extractAudioFromMediaFile(sourceFile, {
          signal: controller.signal,
          onStage: (stage) => setMessage(stage === "reading" ? "Lendo o vídeo…" : stage === "decoding" ? "Decodificando o áudio…" : "Criando a fonte de áudio…"),
        });
        const state = busRef.current.getState();
        const prepared = buildExtractedAudioMedia({ sourceAsset, sourceClip: videoClip, group: workingGroup, result: extracted, revision: state.revisions.document + 1 });
        sourceWav = new File([extracted.wav], `${prepared.asset.id}.wav`, { type: "audio/wav", lastModified: Date.now() });
        const persisted = await persistEditorMedia(state.id, prepared.asset.id, sourceWav);
        if (persisted) prepared.asset.storagePath = editorMediaStoragePath(state.id, prepared.asset.id);
        const sourceUrl = URL.createObjectURL(sourceWav);
        try {
          setProject(busRef.current.execute(new RegisterExtractedAudioCommand(prepared.group, prepared.asset, prepared.clip)));
          runtimeUrlsRef.current.add(sourceUrl);
          sourceFilesRef.current.set(prepared.asset.id, sourceWav);
          setAssetSources((current) => ({ ...current, [prepared.asset.id]: sourceUrl }));
          setAssetWaveforms((current) => ({ ...current, [prepared.asset.id]: extracted.peaks }));
          workingGroup = prepared.group;
        } catch (error) {
          URL.revokeObjectURL(sourceUrl);
          throw error;
        }
      }

      controller.signal.throwIfAborted();
      const separationSourceRevision = workingGroup.sourceRevision;
      const separationSourceFingerprint = sourceAsset.hash ?? `asset:${sourceAsset.id}`;
      const sourceAudioAsset = busRef.current.getState().assets.find((asset) => asset.id === workingGroup.originalAudioAssetId);
      const sourceDuration = sourceAudioAsset?.duration ?? sourceAsset.duration;
      if (!Number.isFinite(sourceDuration) || sourceDuration! <= 0) throw new Error("Não foi possível congelar a duração do áudio fonte.");
      setMessage("Conectando ao separador de diálogo e música…");
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
      const result = await runStemJob(ticket, sourceWav, { signal: controller.signal, onStage: setMessage, onStatus: recordJobStatus });
      controller.signal.throwIfAborted();

      const state = busRef.current.getState();
      const currentGroup = state.audioGroups.find((item) => item.id === workingGroup.id);
      const currentSourceAsset = state.assets.find((asset) => asset.id === sourceAsset.id);
      const currentSourceFingerprint = currentSourceAsset?.hash ?? (currentSourceAsset ? `asset:${currentSourceAsset.id}` : undefined);
      if (
        !currentGroup
        || currentGroup.sourceAssetId !== sourceAsset.id
        || currentGroup.sourceRevision !== separationSourceRevision
        || currentSourceFingerprint !== separationSourceFingerprint
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
      const applicationFingerprint = applicationSource?.hash ?? (applicationSource ? `asset:${applicationSource.id}` : undefined);
      if (
        !applicationGroup
        || applicationGroup.sourceRevision !== separationSourceRevision
        || applicationGroup.sourceAssetId !== sourceAsset.id
        || applicationFingerprint !== separationSourceFingerprint
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
        });
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
        setMessage(dialogueCloudPath && musicCloudPath ? "Diálogo e música foram separados, salvos na conta e aplicados em duas faixas. Use solo ou mudo para comparar." : dialoguePersisted && musicPersisted ? "Diálogo e música foram aplicados e salvos neste navegador; a cópia na nuvem precisa ser tentada novamente." : "Diálogo e música foram aplicados nesta sessão; o armazenamento não salvou uma ou mais trilhas.");
      } catch (error) {
        URL.revokeObjectURL(dialogueUrl);
        URL.revokeObjectURL(musicUrl);
        throw error;
      }
    } catch (error) {
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
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "Separação cancelada; o áudio original foi preservado." : error instanceof Error ? error.message : "Não foi possível separar diálogo e música.");
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
    const selected = findClip(state, state.selection.primaryId);
    const video = selected?.kind === "video"
      ? selected
      : state.tracks.flatMap((track) => track.clips).find((clip) => clip.kind === "video" && clip.assetId && sourceFilesRef.current.has(clip.assetId));
    const file = video?.assetId ? sourceFilesRef.current.get(video.assetId) : undefined;
    if (!video || !file) {
      setMessage("Importe e selecione um vídeo local para gerar legendas automáticas.");
      return;
    }
    const presetItem = registry.get("builtin.caption.word-highlight") as LibraryItem<CaptionPresetDefinition> | null;
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
      const projectStart = Number(video.projectStart);
      const rate = Math.max(0.01, video.playbackRate);
      const mapTime = (sourceTime: number) => projectStart + (sourceTime - sourceIn) / rate;
      const mapped = cues.map((cue) => ({
        start: mapTime(cue.start),
        end: mapTime(cue.end),
        words: cue.words.map((word) => ({ ...word, start: mapTime(word.start), end: mapTime(word.end) })),
      }));
      if (!mapped.length) throw new Error("Nenhuma fala foi encontrada no trecho selecionado.");
      run(new AddCaptionBatchCommand(createCaptionBatchFromTimedWords(mapped, presetItem.definition, state.revisions.document + 1)), `${mapped.length} blocos de legenda gerados e sincronizados.`);
      setMobileSurface("timeline");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar as legendas.");
    } finally {
      setTranscribing(false);
      setCaptionProgress(0);
    }
  }, [registry, run]);

  useEffect(() => () => { audioExtractionRef.current?.abort(); audioSeparationRef.current?.abort(); runtimeUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); runtimeUrlsRef.current.clear(); }, []);

  useEffect(() => {
    if (!clock.playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const duration = busRef.current.getState().settings.duration;
      const next = clockRef.current.tick((now - previous) / 1000);
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
  const selectedAudioGroup = selectedClip ? project.audioGroups.find((group) => group.sourceVideoClipId === selectedClip.id || group.extractedClipId === selectedClip.id || group.dialogueClipId === selectedClip.id || group.musicClipId === selectedClip.id) : undefined;
  const activeAudioAssetIds = selectedAudioGroup ? audioAssetIdsForRepresentation(project, selectedAudioGroup) : [];
  const selectedAssetId = selectedClip?.assetId;
  const missingAsset = project.assets.find((asset) => missingAssetIds.includes(asset.id) && (activeAudioAssetIds.includes(asset.id) || asset.id === selectedAssetId)) ?? null;
  const orderedTrackClips = selectedTrack ? [...selectedTrack.clips].sort((a, b) => Number(a.projectStart) - Number(b.projectStart)) : [];
  const selectedIndex = selectedClip ? orderedTrackClips.findIndex((clip) => clip.id === selectedClip.id) : -1;
  const transitionPair = selectedIndex >= 0 && orderedTrackClips.length > 1
    ? selectedIndex < orderedTrackClips.length - 1 ? { from: orderedTrackClips[selectedIndex]!, to: orderedTrackClips[selectedIndex + 1]! } : { from: orderedTrackClips[selectedIndex - 1]!, to: orderedTrackClips[selectedIndex]! }
    : null;
  const transitionContext = transitionPair ? { ...transitionPair, existing: project.transitions.find((item) => item.fromClipId === transitionPair.from.id && item.toClipId === transitionPair.to.id) } : null;
  const selectedLibraryItem = project.selection.surface === "library" ? registry.get(project.selection.primaryId ?? "") : null;
  const itemCount = project.tracks.reduce((total, track) => total + track.clips.length, 0);
  const canvasProps = {
    project,
    currentTime: Number(clock.projectTime),
    playing: clock.playing,
    assetSources,
    onSelect: (id: string | null, additive?: boolean) => selectClip(id, additive, "canvas"),
    onTransform: (id: string, transform: ClipTransform) => run(new UpdateTransformAtTimeCommand(id, Number(clock.projectTime), transform, "easeInOut", String(project.revisions.document + 1)), "Posição atualizada."),
    onDropLibraryItem: (id: string) => { const item = registry.get(id); if (item) addLibraryItem(item); },
  };
  const inspectorProps = {
    clip: selectedClip,
    track: selectedTrack ?? null,
    libraryItem: selectedLibraryItem,
    currentTime: Number(clock.projectTime),
    transitionContext,
    audioGroup: selectedAudioGroup ?? null,
    missingAsset,
    onRelink: (assetId: string) => requestRelink(assetId),
    onPatchClip: (id: string, patch: Partial<Clip>) => run(new UpdateClipCommand(id, patch)),
    onTransform: (id: string, transform: ClipTransform, easing: Easing) => run(new UpdateTransformAtTimeCommand(id, Number(clock.projectTime), transform, easing, String(project.revisions.document + 1))),
    onUpsertKeyframe: (property: AnimatableProperty, value: number, easing: Easing, keyframeId?: string) => { if (selectedClip) run(new UpsertKeyframeCommand(selectedClip.id, property, clipLocalTime(selectedClip, Number(clock.projectTime)), value, easing, keyframeId ?? `${selectedClip.id}-${property}-${project.revisions.document + 1}`), "Keyframe adicionado."); },
    onDeleteKeyframe: (property: AnimatableProperty, keyframeId: string) => { if (selectedClip) run(new DeleteKeyframeCommand(selectedClip.id, property, keyframeId), "Keyframe removido."); },
    onSeek: seek,
    onApplyTransition: (definitionId: string, duration: number, easing: Easing) => { if (transitionPair) run(new ApplyTransitionCommand({ id: transitionContext?.existing?.id ?? `transition-${transitionPair.from.id}-${transitionPair.to.id}`, definitionId, fromClipId: transitionPair.from.id, toClipId: transitionPair.to.id, duration, easing, fallback: "cut", parameters: {} }), "Transição aplicada."); },
    onDeleteTransition: (id: string) => run(new DeleteTransitionCommand(id), "Transição removida."),
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
    onAddLibraryItem: addLibraryItem,
  };
  const timelineProps = {
    project,
    currentTime: Number(clock.projectTime),
    zoom: timelineZoom,
    assetThumbnails,
    assetWaveforms,
    onZoom: setTimelineZoom,
    onSeek: seek,
    onSelect: (id: string, additive: boolean) => selectClip(id, additive, "timeline"),
    onMove: (id: string, trackId: string, start: number) => run(new MoveClipCommand(id, trackId, start), "Clipe movido."),
    onTrim: (id: string, start: number, end: number) => run(new TrimClipCommand(id, start, end), "Duração atualizada."),
    onMoveKeyframe: (id: string, property: AnimatableProperty, keyframeId: string, localTime: number) => run(new MoveKeyframeCommand(id, property, keyframeId, localTime), "Keyframe movido."),
    onSplit: split,
    onDuplicate: duplicateSelected,
    onToggleSnap: () => run(new UpdateProjectSettingsCommand({ snapEnabled: !project.settings.snapEnabled })),
    onToggleRipple: () => run(new UpdateProjectSettingsCommand({ rippleEnabled: !project.settings.rippleEnabled })),
    onTrackPatch: (trackId: string, patch: Partial<Pick<Track, "muted" | "solo" | "gain" | "hidden" | "locked">>) => run(new UpdateTrackCommand(trackId, patch)),
    onDropLibraryItem: (id: string, at: number) => { const item = registry.get(id); if (item) addLibraryItem(item, at); },
  };

  return (
    <main className="editor-v2-shell flex h-dvh min-h-[620px] flex-col overflow-hidden text-foreground">
      <header className="editor-v2-topbar flex h-14 shrink-0 items-center gap-2 px-2 sm:px-3" aria-label="Barra principal do editor">
        <Link to="/editor" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/6 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Voltar ao editor atual"><ArrowLeft className="size-4" /></Link>
        <div className="mr-1 hidden items-center gap-2 sm:flex"><span className="editor-v2-logo grid size-7 place-items-center rounded-lg font-display text-[11px] font-bold text-white">V</span><span className="text-xs font-semibold">VaiViral</span><span className="rounded bg-white/6 px-1.5 py-0.5 text-[8px] font-semibold tracking-wide text-muted-foreground">V2</span></div>
        <div className="hidden h-5 w-px bg-white/8 sm:block" />
        <button type="button" className="flex min-w-0 max-w-48 items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium hover:bg-white/5"><span className="truncate">{project.name}</span><ChevronDown className="size-3 text-muted-foreground" /></button>
        <div className="ml-auto flex items-center gap-1">
          <input ref={fileInputRef} type="file" accept="video/*,audio/*,image/*,.srt,.vtt,text/vtt" multiple className="sr-only" aria-label="Selecionar mídias locais" onChange={(event) => void importFiles(event.target.files)} />
          <input ref={relinkInputRef} type="file" accept="video/*,audio/*,image/*" className="sr-only" aria-label="Religar arquivo de mídia" onChange={(event) => void relinkMedia(event.target.files)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="editor-tool-button editor-action-button"><Import className="size-3.5" /><span className="hidden md:inline">{importing ? "Importando…" : "Importar"}</span></button>
          <button type="button" onClick={() => void generateAutomaticCaptions()} disabled={transcribing} className="editor-tool-button editor-action-button" title="Gerar legendas com tempo por palavra"><Captions className="size-3.5" /><span className="hidden lg:inline">{transcribing ? `Legendando ${captionProgress}%` : "Legendar"}</span></button>
          <button type="button" onClick={undo} disabled={!busRef.current.canUndo} className="editor-icon-button" aria-label="Desfazer"><Undo2 className="size-4" /></button>
          <button type="button" onClick={redo} disabled={!busRef.current.canRedo} className="editor-icon-button" aria-label="Refazer"><Redo2 className="size-4" /></button>
          <span className="mx-1 hidden h-5 w-px bg-white/8 sm:block" />
          <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground md:flex"><Check className={`size-3 ${missingAssetIds.length ? "text-amber-300" : "text-emerald-400"}`} />{hydrated ? missingAssetIds.length ? `Local · ${missingAssetIds.length} ausente(s)` : `Local · rev. ${project.revisions.document}` : "Recuperando…"}</div>
          <button type="button" onClick={() => void exportProject()} title={exporting ? "Cancelar exportação" : "Exportar MP4 com o mix atual"} className="editor-export-button ml-1 h-8 rounded-lg px-3 text-[11px] font-semibold">{exporting ? `Cancelar ${exportProgress}%` : "Exportar"}</button>
        </div>
      </header>

      <div className="hidden min-h-0 flex-1 lg:block">
        <ResizablePanelGroup orientation="vertical" id="editor-v2-vertical">
          <ResizablePanel defaultSize="68%" minSize={360}>
            <ResizablePanelGroup orientation="horizontal" id="editor-v2-workspace">
              <ResizablePanel defaultSize={300} minSize={250} maxSize={430}><LibraryPanel registry={registry} selectedId={project.selection.surface === "library" ? project.selection.primaryId : null} onSelect={selectLibrary} onAdd={addLibraryItem} /></ResizablePanel>
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
        <div className="min-h-0 flex-1">{mobileSurface === "library" ? <LibraryPanel registry={registry} selectedId={project.selection.surface === "library" ? project.selection.primaryId : null} onSelect={selectLibrary} onAdd={addLibraryItem} /> : mobileSurface === "canvas" ? <EditorCanvasV2 {...canvasProps} /> : mobileSurface === "inspector" ? <InspectorV2 {...inspectorProps} /> : <TimelineV2 {...timelineProps} />}</div>
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
    audio.preservesPitch = true;
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
