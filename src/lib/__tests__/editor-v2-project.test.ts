import { describe, expect, it } from "vitest";
import { AddCaptionBatchCommand, AddCaptionCueCommand, AddClipCommand, AddMediaClipCommand, ApplyCaptionPresetCommand, ApplySeparatedAudioCommand, ApplyTemplateCommand, ApplyTransitionCommand, CompositionClock, DeleteAudioEnvelopePointCommand, DeleteClipCommand, DeleteClipsCommand, DeleteKeyframeCommand, DuplicateClipsCommand, EditorCommandBus, MoveClipCommand, MoveKeyframeCommand, RegisterExtractedAudioCommand, RemoveMediaAssetFromLibraryCommand, RestoreOriginalAudioCommand, SelectItemCommand, SetAudioRepresentationCommand, SplitClipCommand, TrimClipCommand, UpdateClipCommand, UpdateProjectSettingsCommand, UpdateTrackCommand, UpdateTransformAtTimeCommand, UpsertAudioEnvelopePointCommand, UpsertKeyframeCommand, adaptEditorProjectV1, asProjectTime, buildExtractedAudioMedia, buildSeparatedAudioMedia, clampTransitionDuration, clipAudioGainAt, createCaptionBatch, createCaptionBatchFromTimedWords, createEditorProjectV2, createEditorRenderManifest, createPlaybackSurfaceKeys, createStemAsset, editorProjectFromManifest, findTransitionTarget, interpolateKeyframes, isEditorV2Enabled, isTrackCompatible, parseTimedText, projectToSourceTime, resolveAnimatedTransform, resolveAudioMixFrame, resolveAudioRenderFrameFromManifest, resolveCaptionInsertion, resolveClipPresentation, resolveCompositionFrame, resolveCompositionFrameFromManifest, resolveLibraryInsertion, resolveTemplateApplication, snapProjectTime, sourceToProjectTime, summarizeWaveform, visibleTimelineRange, type AudioSourceGroup, type Clip, type MediaAsset } from "@/lib/editor-v2";
import { BUILT_IN_LIBRARY_ITEMS, type CaptionPresetDefinition, type LibraryItem, type TemplateDefinition } from "@/lib/editor-v2/library";
import { AddTrackCommand, AutoSplitClipsCommand, CreateCompoundClipCommand, DissolveCompoundClipCommand, InsertMediaClipCommand, MoveCompoundClipCommand, RemoveSilenceCommand, UpdateClipsCommand, createMediaClipFromAsset } from "@/lib/editor-v2";
import { createEditorProject } from "@/lib/editor/project";

function clip(): Clip {
  return { id: "clip-1", kind: "video", trackId: "track-video", name: "Fixture", projectStart: asProjectTime(2), projectEnd: asProjectTime(12), sourceIn: 5, sourceOut: 15, playbackRate: 1, enabled: true, effects: [], animations: [] };
}

describe("EditorProjectV2", () => {
  it("serializa sem perder o contrato", () => {
    const project = createEditorProjectV2({ id: "fixture-v2", duration: 12 });
    const restored = JSON.parse(JSON.stringify(project));
    expect(restored).toEqual(project);
    expect(restored.version).toBe(2);
    expect(restored.tracks.map((track: { kind: string }) => track.kind)).toEqual(["video", "overlay", "captions", "voice", "music", "sfx"]);
  });
});
describe("ProjectTime e CompositionClock", () => {
  it("mapeia projectTime e sourceTime nos dois sentidos", () => {
    expect(projectToSourceTime(clip(), asProjectTime(7))).toBe(10);
    expect(sourceToProjectTime(clip(), 10)).toBe(7);
    expect(projectToSourceTime(clip(), asProjectTime(1))).toBeNull();
  });

  it("mapeia vídeo revertido sem criar outro relógio", () => {
    const reversed = { ...clip(), reversed: true };
    expect(projectToSourceTime(reversed, asProjectTime(2))).toBe(15);
    expect(projectToSourceTime(reversed, asProjectTime(7))).toBe(10);
    expect(sourceToProjectTime(reversed, 10)).toBe(7);
  });

  it("publica o clip ativo sem criar um segundo relógio", () => {
    const clock = new CompositionClock(() => [clip()]);
    expect(clock.seek(8)).toMatchObject({ projectTime: 8, sourceTime: 11, activeClipId: "clip-1" });
    clock.play();
    expect(clock.tick(0.5).projectTime).toBe(8.5);
  });
});

describe("Command bus", () => {
  it("faz split com undo e redo", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new SplitClipCommand("clip-1", 7, "clip-2"));
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.id, item.sourceIn, item.sourceOut])).toEqual([
      ["clip-1", 5, 10], ["clip-2", 10, 15],
    ]);
    bus.undo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(1);
    bus.redo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(2);
  });

  it("divide vídeos automaticamente em uma ação reversível", () => {
    const source = { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(6.5), sourceIn: 0, sourceOut: 6.5 };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 6.5 }));
    bus.execute(new AddClipCommand(source));
    const command = new AutoSplitClipsCommand([source.id], 2, "fixture");
    bus.execute(command);
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.projectStart, item.projectEnd, item.sourceIn, item.sourceOut])).toEqual([
      [0, 2, 0, 2], [2, 4, 2, 4], [4, 6, 4, 6], [6, 6.5, 6, 6.5],
    ]);
    expect(bus.getState().selection.itemIds).toHaveLength(4);
    expect(command.serialize()).toMatchObject({ type: "autoSplitClips", payload: { interval: 2 } });
    bus.undo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(1);
    bus.redo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(4);
  });

  it("remove pausas, fecha os espaços e desfaz tudo em uma ação", () => {
    const source: Clip = { ...clip(), id: "speech-video", assetId: "speech-asset", projectStart: asProjectTime(0), projectEnd: asProjectTime(8), sourceIn: 0, sourceOut: 8 };
    const project = createEditorProjectV2({ duration: 8 });
    project.tracks[0]!.clips.push(source);
    project.audioGroups.push({ id: "speech-group", sourceAssetId: source.assetId!, sourceStreamIndex: 0, sourceVideoClipId: source.id, activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 0 });
    const bus = new EditorCommandBus(project);
    const command = new RemoveSilenceCommand([{ clipId: source.id, keepSourceRanges: [{ start: 0, end: 2 }, { start: 3.25, end: 5.5 }, { start: 6, end: 8 }] }], "fixture");
    bus.execute(command);
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.projectStart, item.projectEnd, item.sourceIn, item.sourceOut])).toEqual([
      [0, 2, 0, 2], [2, 4.25, 3.25, 5.5], [4.25, 6.25, 6, 8],
    ]);
    expect(resolveAudioMixFrame(bus.getState(), 3)).toMatchObject([{ sourceTime: 4.25, muted: false }]);
    expect(command.serialize()).toMatchObject({ type: "removeSilence", payload: { suffix: "fixture" } });
    bus.undo();
    expect(bus.getState().tracks[0]!.clips).toEqual([source]);
    bus.redo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(3);
  });

  it("mantém uma superfície contínua nos cortes secos e troca exatamente para o clipe da direita", () => {
    const source = { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(6), sourceIn: 0, sourceOut: 6, assetId: "asset-video" };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 6 }));
    bus.execute(new AddClipCommand(source));
    bus.execute(new AutoSplitClipsCommand([source.id], 2, "continuity"));
    const project = bus.getState();
    const segments = project.tracks[0]!.clips;
    const keys = createPlaybackSurfaceKeys(project);
    expect(new Set(segments.map((segment) => keys[segment.id])).size).toBe(1);
    expect(resolveCompositionFrame(project, 2).filter((layer) => segments.some((segment) => segment.id === layer.clipId)).map((layer) => layer.clipId)).toEqual([segments[1]!.id]);
  });

  it("reserva superfícies diferentes quando há uma transição real", () => {
    const project = createEditorProjectV2({ duration: 4 });
    const left = { ...clip(), id: "left", assetId: "asset-video", projectStart: asProjectTime(0), projectEnd: asProjectTime(2), sourceIn: 0, sourceOut: 2 };
    const right = { ...clip(), id: "right", assetId: "asset-video", projectStart: asProjectTime(2), projectEnd: asProjectTime(4), sourceIn: 2, sourceOut: 4 };
    project.tracks[0]!.clips.push(left, right);
    project.transitions.push({ id: "transition", definitionId: "crossfade", fromClipId: left.id, toClipId: right.id, duration: .5, easing: "linear", fallback: "cut", parameters: {} });
    const keys = createPlaybackSurfaceKeys(project);
    expect(keys[left.id]).not.toBe(keys[right.id]);
  });

  it("preserva a ordem da fonte ao cortar um vídeo revertido", () => {
    const reversed = { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(6), sourceIn: 0, sourceOut: 6, reversed: true };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 6 }));
    bus.execute(new AddClipCommand(reversed));
    bus.execute(new AutoSplitClipsCommand([reversed.id], 2, "reverse"));
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.sourceIn, item.sourceOut, item.reversed])).toEqual([
      [4, 6, true], [2, 4, true], [0, 2, true],
    ]);
  });

  it("faz trim com undo e preserva mapeamento da fonte", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new TrimClipCommand("clip-1", 4, 10));
    expect(bus.getState().tracks[0]!.clips[0]).toMatchObject({ projectStart: 4, projectEnd: 10, sourceIn: 7, sourceOut: 13 });
    bus.undo();
    expect(bus.getState().tracks[0]!.clips[0]).toMatchObject({ projectStart: 2, projectEnd: 12, sourceIn: 5, sourceOut: 15 });
  });

  it("seleciona, move e apaga com histórico e payload serializável", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    const add = new AddClipCommand(clip());
    expect(() => JSON.stringify(add.serialize())).not.toThrow();
    bus.execute(add);
    bus.execute(new SelectItemCommand(["clip-1"], "canvas"));
    expect(bus.getState().selection).toEqual({ itemIds: ["clip-1"], primaryId: "clip-1", surface: "canvas" });
    bus.execute(new MoveClipCommand("clip-1", "track-overlay", 0));
    expect(bus.getState().tracks.find((track) => track.id === "track-overlay")!.clips[0]).toMatchObject({ id: "clip-1", projectStart: 0, projectEnd: 10 });
    bus.execute(new DeleteClipCommand("clip-1"));
    expect(bus.getState().tracks.flatMap((track) => track.clips)).toHaveLength(0);
    bus.undo();
    expect(bus.getState().tracks.find((track) => track.id === "track-overlay")!.clips).toHaveLength(1);
  });

  it("sincroniza propriedades visuais, seleção múltipla e undo", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new SelectItemCommand(["clip-1", "library.text.bold"], "canvas"));
    bus.execute(new UpdateClipCommand("clip-1", { transform: { x: 35, y: 40, width: 50, height: 20, scale: 1.2, rotation: 8, opacity: 0.7 } }));
    expect(bus.getState().tracks[0]!.clips[0]!.transform).toMatchObject({ x: 35, rotation: 8, opacity: 0.7 });
    bus.undo();
    expect(bus.getState().tracks[0]!.clips[0]!.transform).toBeUndefined();
  });

  it("aplica velocidade e inversão em lote como uma única ação reversível", () => {
    const first = { ...clip(), id: "clip-1", projectStart: asProjectTime(0), projectEnd: asProjectTime(4), sourceIn: 0, sourceOut: 4 };
    const second = { ...clip(), id: "clip-2", projectStart: asProjectTime(4), projectEnd: asProjectTime(8), sourceIn: 2, sourceOut: 6 };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(first));
    bus.execute(new AddClipCommand(second));
    const command = new UpdateClipsCommand([
      { clipId: "clip-1", patch: { playbackRate: .5, projectEnd: asProjectTime(8), reversed: true } },
      { clipId: "clip-2", patch: { playbackRate: .5, projectEnd: asProjectTime(12), reversed: true } },
    ]);
    expect(command.serialize()).toMatchObject({ type: "updateClips", payload: { updates: expect.any(Array) } });
    bus.execute(command);
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.id, item.playbackRate, item.projectEnd, item.reversed])).toEqual([
      ["clip-1", .5, 8, true], ["clip-2", .5, 12, true],
    ]);
    bus.undo();
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.id, item.playbackRate, item.projectEnd, item.reversed])).toEqual([
      ["clip-1", 1, 4, undefined], ["clip-2", 1, 8, undefined],
    ]);
  });

  it("fecha o espaço ao apagar com ripple ativo", () => {
    const second = { ...clip(), id: "clip-2", projectStart: asProjectTime(12), projectEnd: asProjectTime(16), sourceIn: 0, sourceOut: 4 };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 16 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new AddClipCommand(second));
    bus.execute(new UpdateProjectSettingsCommand({ rippleEnabled: true }));
    bus.execute(new DeleteClipsCommand(["clip-1"]));
    expect(bus.getState().tracks[0]!.clips[0]).toMatchObject({ id: "clip-2", projectStart: 2, projectEnd: 6 });
  });

  it("mantém a sequência contínua ao aparar e reordenar com ripple", () => {
    const first = { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(4), sourceIn: 0, sourceOut: 4 };
    const second = { ...clip(), id: "clip-2", projectStart: asProjectTime(4), projectEnd: asProjectTime(8), sourceIn: 0, sourceOut: 4 };
    const third = { ...clip(), id: "clip-3", projectStart: asProjectTime(8), projectEnd: asProjectTime(12), sourceIn: 0, sourceOut: 4 };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 16 }));
    bus.execute(new AddClipCommand(first));
    bus.execute(new AddClipCommand(second));
    bus.execute(new AddClipCommand(third));
    bus.execute(new UpdateProjectSettingsCommand({ rippleEnabled: true }));
    bus.execute(new TrimClipCommand("clip-1", 1, 4));
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.id, item.projectStart, item.projectEnd])).toEqual([
      ["clip-1", 0, 3], ["clip-2", 3, 7], ["clip-3", 7, 11],
    ]);
    bus.execute(new MoveClipCommand("clip-1", "track-video", 11));
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.id, item.projectStart, item.projectEnd])).toEqual([
      ["clip-2", 0, 4], ["clip-3", 4, 8], ["clip-1", 8, 11],
    ]);
  });

  it("duplica a seleção como uma única ação reversível", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new DuplicateClipsCommand(["clip-1"], "fixture", 0.5));
    expect(bus.getState().tracks[0]!.clips).toHaveLength(2);
    expect(bus.getState().selection.primaryId).toBe("clip-1-copy-fixture-1");
    expect(bus.getState().tracks[0]!.clips[1]).toMatchObject({ projectStart: 2.5, projectEnd: 12.5 });
    bus.undo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(1);
  });

  it("coloca a duplicação padrão depois da seleção sem sobreposição", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new DuplicateClipsCommand(["clip-1"], "adjacent"));
    expect(bus.getState().tracks[0]!.clips[1]).toMatchObject({ projectStart: 12, projectEnd: 22 });
    expect(bus.getState().selection).toMatchObject({ primaryId: "clip-1-copy-adjacent-1", surface: "timeline" });
  });

  it("duplica legenda com novo cue e palavras sincronizadas", () => {
    const preset = BUILT_IN_LIBRARY_ITEMS.find((item) => item.id === "builtin.caption.word-highlight")!.definition as CaptionPresetDefinition;
    const entry = createCaptionBatch(parseTimedText("1\n00:00:01,000 --> 00:00:03,000\nOlá mundo"), preset, 1)[0]!;
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 4 }));
    bus.execute(new AddCaptionBatchCommand([entry]));
    bus.execute(new DuplicateClipsCommand([entry.clip.id], "caption"));
    const owner = bus.getState().tracks.find((track) => track.kind === "captions")!;
    expect("cues" in owner && owner.cues).toHaveLength(2);
    if (!("cues" in owner)) throw new Error("Trilha de legenda inválida");
    expect(owner.cues[1]).toMatchObject({ start: 3, end: 5, text: "Olá mundo" });
    expect(owner.clips[1]!.metadata?.["captionCueId"]).toBe(owner.cues[1]!.id);
    expect(owner.cues[1]!.words?.map((word) => [word.start, word.end])).toEqual([[3, 4], [4, 5]]);
  });

  it("bloqueia a trilha, preserva undo e impede edição", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new UpdateTrackCommand("track-video", { locked: true }));
    expect(() => bus.execute(new TrimClipCommand("clip-1", 3, 10))).toThrow(/bloqueada/);
    bus.undo();
    expect(bus.getState().tracks[0]!.locked).toBe(false);
  });

  it("adiciona mídia e clipe atomicamente sem conteúdo base64", () => {
    const asset: MediaAsset = { id: "asset-1", kind: "video", name: "local.mp4", mimeType: "video/mp4", storagePath: "local-session://asset-1", duration: 10, license: { provider: "Arquivo local", sourceUrl: "local-session://asset-1", licenseType: "Fornecida pelo usuário", licenseUrl: "internal://local", author: "Usuário", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false } };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddMediaClipCommand(asset, { ...clip(), assetId: asset.id }));
    expect(bus.getState().assets[0]).toEqual(asset);
    expect(JSON.stringify(bus.getState())).not.toContain("data:");
    bus.undo();
    expect(bus.getState().assets).toHaveLength(0);
  });

  it("cria, move e desfaz um clipe composto sem achatar suas camadas", () => {
    const project = createEditorProjectV2({ duration: 12 });
    const video = { ...clip(), id: "compound-video", projectStart: asProjectTime(1), projectEnd: asProjectTime(5), sourceIn: 0, sourceOut: 4 };
    const overlay: Clip = { ...clip(), id: "compound-overlay", kind: "image", trackId: "track-overlay", projectStart: asProjectTime(2), projectEnd: asProjectTime(4), sourceIn: 0, sourceOut: 2 };
    project.tracks[0]!.clips.push(video);
    project.tracks[1]!.clips.push(overlay);
    const bus = new EditorCommandBus(project);
    bus.execute(new CreateCompoundClipCommand([video.id, overlay.id], "compound-1", "Composto 1"));
    expect(bus.getState().selection.itemIds).toEqual([video.id, overlay.id]);
    expect(bus.getState().tracks[1]!.clips[0]!.metadata).toMatchObject({ compoundGroupId: "compound-1", compoundName: "Composto 1" });
    bus.execute(new DuplicateClipsCommand([video.id, overlay.id], "compound-copy", 8));
    const copiedGroups = bus.getState().tracks.flatMap((track) => track.clips).filter((item) => item.id.includes("-copy-")).map((item) => item.metadata?.["compoundGroupId"]);
    expect(copiedGroups).toEqual(["compound-1-copy-compound-copy", "compound-1-copy-compound-copy"]);
    bus.undo();
    bus.execute(new MoveCompoundClipCommand("compound-1", video.id, 5));
    expect(bus.getState().tracks[0]!.clips[0]).toMatchObject({ projectStart: 5, projectEnd: 9 });
    expect(bus.getState().tracks[1]!.clips[0]).toMatchObject({ projectStart: 6, projectEnd: 8 });
    bus.undo();
    expect(bus.getState().tracks[0]!.clips[0]).toMatchObject({ projectStart: 1, projectEnd: 5 });
    bus.execute(new DissolveCompoundClipCommand("compound-1"));
    expect(bus.getState().tracks.flatMap((track) => track.clips).every((item) => !item.metadata?.["compoundGroupId"])).toBe(true);
  });

  it("adiciona uma camada extra com histórico reversível", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    const extra = { id: "track-overlay-2", kind: "overlay" as const, name: "Sobreposição 2", order: 6, locked: false, hidden: false, muted: false, solo: false, gain: 1, clips: [] };
    bus.execute(new AddTrackCommand(extra));
    expect(bus.getState().tracks.at(-1)).toMatchObject({ id: "track-overlay-2", kind: "overlay" });
    bus.undo();
    expect(bus.getState().tracks.some((track) => track.id === "track-overlay-2")).toBe(false);
  });

  it("reutiliza uma mídia existente na agulha sem duplicar o arquivo", () => {
    const license: MediaAsset["license"] = { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false };
    const asset: MediaAsset = { id: "reusable-video", kind: "video", name: "reutilizavel.mp4", mimeType: "video/mp4", duration: 8, license };
    const first = createMediaClipFromAsset(asset, 0, 1);
    const second = createMediaClipFromAsset(asset, 12, 2);
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 20 }));
    bus.execute(new AddMediaClipCommand(asset, first.clip, first.audioGroup));
    bus.execute(new InsertMediaClipCommand(second.clip, second.audioGroup));
    expect(bus.getState().assets).toHaveLength(1);
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.id, item.projectStart, item.projectEnd])).toEqual([
      [first.clip.id, 0, 8],
      [second.clip.id, 12, 20],
    ]);
    expect(bus.getState().audioGroups.map((group) => group.sourceVideoClipId)).toEqual([first.clip.id, second.clip.id]);
    bus.undo();
    expect(bus.getState().assets).toHaveLength(1);
    expect(bus.getState().tracks[0]!.clips).toHaveLength(1);
  });

  it("remove da biblioteca sem apagar clipes que ainda usam a mídia", () => {
    const license: MediaAsset["license"] = { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false };
    const asset: MediaAsset = { id: "used-video", kind: "video", name: "usado.mp4", mimeType: "video/mp4", duration: 8, license };
    const insertion = createMediaClipFromAsset(asset, 0, 1);
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 8 }));
    bus.execute(new AddMediaClipCommand(asset, insertion.clip, insertion.audioGroup));
    bus.execute(new RemoveMediaAssetFromLibraryCommand(asset.id));
    expect(bus.getState().assets).toEqual([expect.objectContaining({ id: asset.id, libraryHidden: true })]);
    expect(bus.getState().tracks[0]!.clips).toEqual([expect.objectContaining({ assetId: asset.id })]);
  });

  it("exclui completamente da biblioteca uma mídia sem clipes", () => {
    const license: MediaAsset["license"] = { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false };
    const asset: MediaAsset = { id: "unused-audio", kind: "audio", name: "sem-uso.wav", mimeType: "audio/wav", duration: 4, license };
    const project = createEditorProjectV2({ duration: 8 });
    project.assets.push(asset);
    const bus = new EditorCommandBus(project);
    bus.execute(new RemoveMediaAssetFromLibraryCommand(asset.id));
    expect(bus.getState().assets).toEqual([]);
  });

  it("cria, move e remove keyframes por propriedade com undo", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand({ ...clip(), transform: { x: 20, y: 50, width: 60, height: 40, scale: 1, rotation: 0, opacity: 1 } }));
    bus.execute(new UpsertKeyframeCommand("clip-1", "x", 0, 20, "linear", "x-0"));
    bus.execute(new UpsertKeyframeCommand("clip-1", "x", 4, 80, "easeInOut", "x-4"));
    expect(resolveAnimatedTransform(bus.getState().tracks[0]!.clips[0]!, 4).x).toBe(50);
    bus.execute(new MoveKeyframeCommand("clip-1", "x", "x-4", 6));
    expect(bus.getState().tracks[0]!.clips[0]!.animations[0]!.keyframes[1]!.time).toBe(6);
    bus.execute(new DeleteKeyframeCommand("clip-1", "x", "x-0"));
    expect(bus.getState().tracks[0]!.clips[0]!.animations[0]!.keyframes).toHaveLength(1);
    bus.undo();
    expect(bus.getState().tracks[0]!.clips[0]!.animations[0]!.keyframes).toHaveLength(2);
  });

  it("edita no canvas criando keyframe quando a propriedade está animada", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand({ ...clip(), transform: { x: 20, y: 50, width: 60, height: 40, scale: 1, rotation: 0, opacity: 1 } }));
    bus.execute(new UpsertKeyframeCommand("clip-1", "x", 0, 20, "linear", "x-0"));
    bus.execute(new UpdateTransformAtTimeCommand("clip-1", 5, { x: 65, y: 50, width: 60, height: 40, scale: 1, rotation: 0, opacity: 1 }, "easeOut", "canvas"));
    expect(bus.getState().tracks[0]!.clips[0]!.animations[0]!.keyframes[1]).toMatchObject({ time: 3, value: 65, easing: "easeOut" });
  });

  it("divide keyframes usando tempo local do clipe", () => {
    const animated = { ...clip(), animations: [{ property: "x" as const, keyframes: [{ id: "a", time: asProjectTime(1), value: 20, easing: "linear" as const }, { id: "b", time: asProjectTime(7), value: 80, easing: "linear" as const }] }] };
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(animated));
    bus.execute(new SplitClipCommand("clip-1", 7, "clip-2"));
    expect(bus.getState().tracks[0]!.clips[0]!.animations[0]!.keyframes.map((point) => point.id)).toEqual(["a"]);
    expect(bus.getState().tracks[0]!.clips[1]!.animations[0]!.keyframes[0]).toMatchObject({ id: "b", time: 2 });
  });

  it("aplica transição adjacente limitada e a expõe no mesmo manifest", () => {
    const first = { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(4), sourceIn: 0, sourceOut: 4 };
    const second = { ...clip(), id: "clip-2", projectStart: asProjectTime(4), projectEnd: asProjectTime(8), sourceIn: 0, sourceOut: 4 };
    const bus = new EditorCommandBus(createEditorProjectV2({ id: "transition-fixture", duration: 8 }));
    bus.execute(new AddClipCommand(first));
    bus.execute(new AddClipCommand(second));
    bus.execute(new ApplyTransitionCommand({ id: "transition-1", definitionId: "fade", fromClipId: "clip-1", toClipId: "clip-2", duration: 1, easing: "linear", fallback: "cut", parameters: {} }));
    const frame = resolveCompositionFrame(bus.getState(), 3.5);
    expect(frame.map((layer) => layer.clipId)).toEqual(["clip-1", "clip-2"]);
    expect(frame.map((layer) => layer.transition.opacity)).toEqual([0.5, 0.5]);
    expect(createEditorRenderManifest(bus.getState()).transitions[0]).toMatchObject({ id: "transition-1", fallback: "cut" });
    expect(() => bus.execute(new ApplyTransitionCommand({ id: "bad", definitionId: "fade", fromClipId: "clip-1", toClipId: "clip-2", duration: 3, easing: "linear", fallback: "cut", parameters: {} }))).toThrow(/máxima/);
  });

  it("encontra a junção visual mais próxima da agulha e calcula a duração segura", () => {
    const project = createEditorProjectV2({ duration: 8 });
    project.tracks[0]!.clips = [
      { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(2), sourceIn: 0, sourceOut: 2 },
      { ...clip(), id: "clip-2", projectStart: asProjectTime(2), projectEnd: asProjectTime(6), sourceIn: 2, sourceOut: 6 },
      { ...clip(), id: "clip-3", projectStart: asProjectTime(6), projectEnd: asProjectTime(8), sourceIn: 6, sourceOut: 8 },
    ];
    const target = findTransitionTarget(project, 5.7);
    expect(target).toMatchObject({ from: { id: "clip-2" }, to: { id: "clip-3" }, boundary: 6, maxDuration: 1 });
    expect(clampTransitionDuration(1.8, 0.1, target!.maxDuration)).toBe(1);
  });

  it("não oferece transição entre clipes separados por um vazio", () => {
    const project = createEditorProjectV2({ duration: 8 });
    project.tracks[0]!.clips = [
      { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(2), sourceIn: 0, sourceOut: 2 },
      { ...clip(), id: "clip-2", projectStart: asProjectTime(3), projectEnd: asProjectTime(6), sourceIn: 2, sourceOut: 5 },
    ];
    expect(findTransitionTarget(project, 2.5)).toBeNull();
  });
});

describe("resolver de animação", () => {
  it("interpola linear e ease-in sem depender da taxa de frames", () => {
    const points = [{ id: "a", time: asProjectTime(0), value: 0, easing: "linear" as const }, { id: "b", time: asProjectTime(10), value: 100, easing: "easeIn" as const }];
    expect(interpolateKeyframes(points, 5)).toBe(25);
    expect(interpolateKeyframes(points, 10)).toBe(100);
  });
});

describe("interações da UI", () => {
  it("insere um recurso da Library na agulha e trilha compatível", () => {
    const project = createEditorProjectV2({ duration: 12 });
    const item = BUILT_IN_LIBRARY_ITEMS.find((candidate) => candidate.type === "caption")!;
    const inserted = resolveLibraryInsertion(project, item, 3.5, 1);
    expect(inserted).toMatchObject({ kind: "caption", trackId: "track-captions", projectStart: 3.5, projectEnd: 7.5 });
  });

  it("aplica snapping em borda de outro clipe e respeita o flag", () => {
    const project = createEditorProjectV2({ duration: 12 });
    project.tracks[0]!.clips.push(clip());
    expect(snapProjectTime(project, 11.93)).toBe(12);
    project.settings.snapEnabled = false;
    expect(snapProjectTime(project, 11.93)).toBe(11.93);
  });

  it("interpreta valores explícitos da feature flag", () => {
    expect(isEditorV2Enabled("true")).toBe(true);
    expect(isEditorV2Enabled("ON")).toBe(true);
    expect(isEditorV2Enabled("false")).toBe(false);
    expect(isEditorV2Enabled(undefined)).toBe(false);
  });

  it("valida movimentação entre trilhas por tipo", () => {
    const project = createEditorProjectV2();
    expect(isTrackCompatible(clip(), project.tracks.find((track) => track.id === "track-overlay")!)).toBe(true);
    expect(isTrackCompatible(clip(), project.tracks.find((track) => track.id === "track-music")!)).toBe(false);
    const bus = new EditorCommandBus(project);
    bus.execute(new AddClipCommand(clip()));
    expect(() => bus.execute(new MoveClipCommand("clip-1", "track-music", 0))).toThrow(/compatível/);
  });

  it("calcula janela horizontal com overscan para virtualização", () => {
    expect(visibleTimelineRange(1136, 520, 136, 52, 2)).toEqual({ start: 17.23076923076923, end: 31.23076923076923 });
  });
});

describe("templates e legendas da Fase 4", () => {
  it("oferece os modelos V2 e os layouts profissionais migrados do editor anterior", () => {
    const templates = BUILT_IN_LIBRARY_ITEMS.filter((item) => item.type === "template") as LibraryItem<TemplateDefinition>[];
    expect(templates.length).toBeGreaterThanOrEqual(16);
    const migrated = templates.find((item) => item.id === "builtin.template.ready-hook-topo")!;
    expect(migrated.definition.document.layers.length).toBeGreaterThan(0);
    expect(migrated.definition.document.layers.every((layer) => layer.x >= 0 && layer.x <= 100 && layer.y >= 0 && layer.y <= 100)).toBe(true);
  });

  it("aplica um template como comando atômico e o inclui no manifest", () => {
    const project = createEditorProjectV2({ duration: 20, aspectRatio: "9:16" });
    const item = BUILT_IN_LIBRARY_ITEMS.find((candidate) => candidate.id === "builtin.template.social-focus") as LibraryItem<TemplateDefinition>;
    const application = resolveTemplateApplication(project, item, 2, 1);
    const bus = new EditorCommandBus(project);
    bus.execute(new ApplyTemplateCommand(application.instance, application.clips));
    expect(bus.getState().templates[0]).toMatchObject({ templateId: "social-focus", appliedAt: 2 });
    expect(application.clips).toHaveLength(3);
    expect(createEditorRenderManifest(bus.getState()).templates[0]?.clipIds).toEqual(application.clips.map((clip) => clip.id));
    bus.undo();
    expect(bus.getState().templates).toEqual([]);
    expect(bus.getState().tracks.flatMap((track) => track.clips)).toEqual([]);
  });

  it("mantém cue, palavras e preset sincronizados com preview e edição", () => {
    const project = createEditorProjectV2({ duration: 12 });
    const item = BUILT_IN_LIBRARY_ITEMS.find((candidate) => candidate.id === "builtin.caption.word-highlight") as LibraryItem<CaptionPresetDefinition>;
    const insertion = resolveCaptionInsertion(project, item, 1, 1);
    const bus = new EditorCommandBus(project);
    bus.execute(new AddCaptionCueCommand(insertion.cue, insertion.clip));
    const frame = resolveCompositionFrame(bus.getState(), 2);
    expect(frame[0]?.caption?.cue.words).toHaveLength(4);
    expect(createEditorRenderManifest(bus.getState()).captionTracks[0]?.cues[0]?.styleId).toBe("word-highlight");
    bus.execute(new UpdateClipCommand(insertion.clip.id, { style: { ...insertion.clip.style, text: "NOVO TEXTO" } }));
    expect(createEditorRenderManifest(bus.getState()).captionTracks[0]?.cues[0]?.words?.map((word) => word.text)).toEqual(["NOVO", "TEXTO"]);
    const karaoke = BUILT_IN_LIBRARY_ITEMS.find((candidate) => candidate.id === "builtin.caption.karaoke")!.definition as CaptionPresetDefinition;
    bus.execute(new ApplyCaptionPresetCommand(insertion.clip.id, karaoke.id, karaoke.style, karaoke.transform, karaoke as unknown as Record<string, unknown>));
    expect(createEditorRenderManifest(bus.getState()).captionTracks[0]?.cues[0]).toMatchObject({ styleId: "karaoke", animationId: "none" });
  });
});

describe("áudio e performance da Fase 5", () => {
  const audioClip = (id: string, trackId: string, role: "voice" | "music"): Clip => ({ id, kind: "audio", trackId, assetId: `asset-${id}`, name: id, projectStart: asProjectTime(0), projectEnd: asProjectTime(10), sourceIn: 0, sourceOut: 10, playbackRate: 1, enabled: true, effects: [], animations: [], audio: { gain: 1, muted: false, fadeIn: 1, fadeOut: 1, loop: false, stemRole: role, envelope: [] } });

  it("resolve fades, envelope, ducking, mute e solo no mesmo mix", () => {
    const project = createEditorProjectV2({ duration: 10 });
    const voice = audioClip("voice", "track-voice", "voice");
    const music = audioClip("music", "track-music", "music");
    project.tracks.find((track) => track.id === "track-voice")!.clips.push(voice);
    project.tracks.find((track) => track.id === "track-music")!.clips.push(music);
    expect(clipAudioGainAt(voice, .5)).toBeCloseTo(.5);
    const mixed = resolveAudioMixFrame(project, 5);
    expect(mixed.find((layer) => layer.role === "voice")?.gain).toBe(1);
    expect(mixed.find((layer) => layer.role === "music")?.gain).toBeCloseTo(.35);
    project.tracks.find((track) => track.id === "track-music")!.solo = true;
    const solo = resolveAudioMixFrame(project, 5);
    expect(solo.find((layer) => layer.role === "voice")?.muted).toBe(true);
    expect(solo.find((layer) => layer.role === "music")?.gain).toBe(1);
  });

  it("edita envelope com undo e serializa o contrato de áudio", () => {
    const project = createEditorProjectV2({ duration: 10 });
    const music = audioClip("music", "track-music", "music");
    project.assets.push({ id: "asset-music", kind: "audio", name: "music.wav", mimeType: "audio/wav", license: { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false } });
    project.tracks.find((track) => track.id === "track-music")!.clips.push(music);
    const bus = new EditorCommandBus(project);
    bus.execute(new UpsertAudioEnvelopePointCommand("music", "gain-1", 4, .4));
    expect(clipAudioGainAt(bus.getState().tracks.find((track) => track.id === "track-music")!.clips[0]!, 4)).toBeCloseTo(.4);
    expect(createEditorRenderManifest(bus.getState()).audioClips[0]).toMatchObject({ assetId: "asset-music", audio: { stemRole: "music" } });
    bus.execute(new DeleteAudioEnvelopePointCommand("music", "gain-1"));
    expect(bus.getState().tracks.find((track) => track.id === "track-music")!.clips[0]!.audio!.envelope).toHaveLength(0);
    bus.undo();
    expect(bus.getState().tracks.find((track) => track.id === "track-music")!.clips[0]!.audio!.envelope).toHaveLength(1);
  });

  it("resume PCM em picos reais determinísticos", () => {
    const result = summarizeWaveform([new Float32Array([0, .25, -.5, 1])], 2);
    expect(result.peaks).toEqual([.25, 1]);
    expect(result.peak).toBe(1);
    expect(result.rms).toBeCloseTo(Math.sqrt(1.3125 / 4));
  });

  it("registra stems versionados sem reutilizar silenciosamente o mix original", () => {
    const source: MediaAsset = { id: "original", kind: "video", name: "mix.mp4", mimeType: "video/mp4", sourceUrl: "blob:original", proxyUrl: "blob:proxy", thumbnailUrl: "blob:thumb", width: 1080, height: 1920, hash: "abc", license: { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false } };
    const voice = createStemAsset(source, "voice", 2, "stems/voice-r2.wav");
    expect(voice).toMatchObject({ id: "original-stem-voice-r2", kind: "audio", mimeType: "audio/wav", storagePath: "stems/voice-r2.wav", stem: { role: "voice", sourceAssetId: "original", revision: 2, status: "ready" } });
    expect(voice.sourceUrl).toBeUndefined();
    expect(voice.thumbnailUrl).toBeUndefined();
    expect(voice.width).toBeUndefined();
    expect(source.sourceUrl).toBe("blob:original");
  });

  it("troca áudio embutido, extraído e separado sem tocar representações duplicadas", () => {
    const project = createEditorProjectV2({ duration: 10 });
    const license: MediaAsset["license"] = { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false };
    const source: MediaAsset = { id: "source-video", kind: "video", name: "entrevista.mp4", mimeType: "video/mp4", duration: 10, sourceUrl: "blob:video", license };
    const sourceClip: Clip = { ...clip(), id: "source-video-clip", assetId: source.id, projectStart: asProjectTime(0), projectEnd: asProjectTime(10), sourceIn: 0, sourceOut: 10 };
    project.assets.push(source);
    project.tracks.find((track) => track.id === "track-video")!.clips.push(sourceClip);

    const extractedAsset: MediaAsset = { id: "source-audio", kind: "audio", name: "Áudio original.wav", mimeType: "audio/wav", duration: 10, storagePath: "audio/original.wav", license };
    const extractedClip: Clip = { ...audioClip("original", "track-voice", "voice"), id: "source-audio-clip", assetId: extractedAsset.id, audio: { ...audioClip("original", "track-voice", "voice").audio!, stemRole: "original" } };
    const group: AudioSourceGroup = { id: "audio-group-1", sourceAssetId: source.id, sourceStreamIndex: 0, sourceVideoClipId: sourceClip.id, originalAudioAssetId: extractedAsset.id, extractedClipId: extractedClip.id, activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 0 };
    const bus = new EditorCommandBus(project);
    const register = new RegisterExtractedAudioCommand(group, extractedAsset, extractedClip);
    bus.execute(register);
    expect(resolveAudioMixFrame(bus.getState(), 5)).toMatchObject([{ clipId: extractedClip.id, representation: "extracted", role: "original" }]);
    expect(JSON.parse(JSON.stringify(register.serialize())).payload.group.id).toBe(group.id);

    const dialogueAsset = createStemAsset(source, "voice", 1, "stems/dialogue.wav");
    const musicAsset = createStemAsset(source, "music", 1, "stems/music.wav");
    const dialogueClip: Clip = { ...audioClip("dialogue", "track-voice", "voice"), assetId: dialogueAsset.id };
    const musicClip: Clip = { ...audioClip("background", "track-music", "music"), assetId: musicAsset.id };
    bus.execute(new ApplySeparatedAudioCommand(group.id, dialogueAsset, musicAsset, dialogueClip, musicClip));
    expect(resolveAudioMixFrame(bus.getState(), 5).map((layer) => [layer.clipId, layer.representation])).toEqual([[dialogueClip.id, "separated"], [musicClip.id, "separated"]]);
    const separatedManifest = JSON.parse(JSON.stringify(createEditorRenderManifest(bus.getState())));
    expect(resolveAudioRenderFrameFromManifest(separatedManifest, 5)).toEqual(resolveAudioMixFrame(bus.getState(), 5));
    bus.execute(new DeleteClipCommand(musicClip.id));
    expect(bus.getState().audioGroups[0]).toMatchObject({ activeRepresentation: "separated", dialogueClipId: dialogueClip.id });
    expect(bus.getState().audioGroups[0]?.musicClipId).toBeUndefined();
    expect(resolveAudioMixFrame(bus.getState(), 5).map((layer) => layer.clipId)).toEqual([dialogueClip.id]);
    bus.undo();

    bus.execute(new SetAudioRepresentationCommand(group.id, "embedded"));
    expect(resolveAudioMixFrame(bus.getState(), 5)).toMatchObject([{ clipId: sourceClip.id, assetId: source.id, representation: "embedded", sourceKind: "embedded", role: "original" }]);
    const embeddedManifest = JSON.parse(JSON.stringify(createEditorRenderManifest(bus.getState())));
    expect(resolveAudioRenderFrameFromManifest(embeddedManifest, 5)).toEqual(resolveAudioMixFrame(bus.getState(), 5));
    expect(resolveAudioMixFrame(bus.getState(), 10)).toHaveLength(0);
    bus.undo();
    expect(resolveAudioMixFrame(bus.getState(), 5)).toHaveLength(2);
    bus.execute(new RestoreOriginalAudioCommand(group.id));
    expect(resolveAudioMixFrame(bus.getState(), 5)).toMatchObject([{ clipId: extractedClip.id, representation: "extracted" }]);

    const manifest = createEditorRenderManifest(bus.getState());
    expect(manifest.audioGroups[0]).toMatchObject({ id: group.id, activeRepresentation: "extracted", dialogueClipId: dialogueClip.id, musicClipId: musicClip.id });
    expect(manifest.audioTracks.find((track) => track.id === "track-voice")).toMatchObject({ muted: false, solo: false, gain: 1 });
    expect(manifest.visualClips.find((item) => item.id === sourceClip.id)).toMatchObject({ assetId: source.id, enabled: true });
    const restored = editorProjectFromManifest(JSON.parse(JSON.stringify(manifest)));
    expect(resolveAudioMixFrame(restored, 5)).toEqual(resolveAudioMixFrame(bus.getState(), 5));
    expect(restored.audioGroups).toEqual(bus.getState().audioGroups);
  });

  it("constrói as duas trilhas separadas com o mesmo relógio da mídia", () => {
    const project = createEditorProjectV2({ duration: 36 });
    const source: MediaAsset = { id: "source", kind: "video", name: "conversa.mp4", mimeType: "video/mp4", duration: 22, license: { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false } };
    const sourceClip: Clip = { ...clip(), id: "video", assetId: source.id, projectStart: asProjectTime(30), projectEnd: asProjectTime(36), sourceIn: 10, sourceOut: 22, playbackRate: 2 };
    const group: AudioSourceGroup = { id: "group", sourceAssetId: source.id, sourceStreamIndex: 0, sourceVideoClipId: sourceClip.id, activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 1 };
    const analysis = { cacheKey: "wave", peaks: [.1, .5], rms: .2, peak: .5, sampleRate: 44100, channels: 2, duration: 22, durationMs: 5 };
    const built = buildSeparatedAudioMedia({ sourceAsset: source, sourceClip, group, duration: 12, revision: 2, dialogue: { storagePath: "dialogue.wav", hash: "voice-hash", analysis }, music: { storagePath: "music.wav", hash: "music-hash", analysis }, jobId: "job-2", engine: "demucs", model: "htdemucs" });
    expect(built.dialogueClip).toMatchObject({ trackId: "track-voice", projectStart: 30, projectEnd: 36, sourceIn: 0, sourceOut: 12, playbackRate: 2, audio: { stemRole: "voice" }, metadata: { sourceRangeIn: 10, sourceRangeOut: 22, rebasedSource: true } });
    expect(built.musicClip).toMatchObject({ trackId: "track-music", projectStart: 30, projectEnd: 36, sourceIn: 0, sourceOut: 12, playbackRate: 2, audio: { stemRole: "music" }, metadata: { sourceRangeIn: 10, sourceRangeOut: 22, rebasedSource: true } });
    expect(built.musicAsset).toMatchObject({ kind: "audio", name: "conversa.mp4 · Música e ambiente", hash: "music-hash", stem: { sourceAssetId: source.id, revision: 2, role: "music", jobId: "job-2", engine: "demucs", model: "htdemucs" } });
    expect(project.audioGroups).toHaveLength(0);
  });

  it("mantém toda a voz ao silenciar apenas o stem de música", () => {
    const project = createEditorProjectV2({ duration: 5 });
    const dialogue = audioClip("dialogue-only", "track-voice", "voice");
    const music = audioClip("music-muted", "track-music", "music");
    music.audio!.muted = true;
    project.tracks.find((track) => track.id === "track-voice")!.clips.push(dialogue);
    project.tracks.find((track) => track.id === "track-music")!.clips.push(music);
    const layers = resolveAudioMixFrame(project, 2);
    expect(layers.find((layer) => layer.role === "voice")?.gain).toBeGreaterThan(0);
    expect(layers.find((layer) => layer.role === "music")).toMatchObject({ gain: 0, muted: true });
  });

  it("mapeia tempo do projeto para a fonte acelerada e aplica solo global", () => {
    const project = createEditorProjectV2({ duration: 36 });
    const video: Clip = { ...clip(), id: "timed-video", assetId: "timed-asset", projectStart: asProjectTime(30), projectEnd: asProjectTime(36), sourceIn: 10, sourceOut: 22, playbackRate: 2 };
    project.tracks.find((track) => track.id === "track-video")!.clips.push(video);
    project.audioGroups.push({ id: "timed-group", sourceAssetId: "timed-asset", sourceStreamIndex: 1, sourceVideoClipId: video.id, activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 0 });
    const music = { ...audioClip("independent-music", "track-music", "music"), projectStart: asProjectTime(30), projectEnd: asProjectTime(36) };
    project.tracks.find((track) => track.id === "track-music")!.clips.push(music);
    expect(resolveAudioMixFrame(project, 33).find((layer) => layer.clipId === video.id)).toMatchObject({ sourceTime: 16, playbackRate: 2, muted: false });
    project.tracks.find((track) => track.id === "track-music")!.solo = true;
    expect(resolveAudioMixFrame(project, 33).find((layer) => layer.clipId === video.id)).toMatchObject({ gain: 0, muted: true });
  });

  it("mantém o áudio incorporado ligado aos cortes e o silencia quando o trecho é revertido", () => {
    const project = createEditorProjectV2({ duration: 6 });
    const video: Clip = { ...clip(), id: "cut-video", assetId: "cut-asset", projectStart: asProjectTime(0), projectEnd: asProjectTime(6), sourceIn: 0, sourceOut: 6 };
    project.tracks.find((track) => track.id === "track-video")!.clips.push(video);
    project.audioGroups.push({ id: "cut-group", sourceAssetId: video.assetId!, sourceStreamIndex: 0, sourceVideoClipId: video.id, activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 0 });
    const bus = new EditorCommandBus(project);
    bus.execute(new AutoSplitClipsCommand([video.id], 2, "audio"));
    const middle = bus.getState().tracks[0]!.clips[1]!;
    expect(resolveAudioMixFrame(bus.getState(), 3)).toMatchObject([{ clipId: middle.id, sourceTime: 3, muted: false }]);
    bus.execute(new UpdateClipCommand(middle.id, { reversed: true }));
    expect(resolveAudioMixFrame(bus.getState(), 3)).toMatchObject([{ clipId: middle.id, gain: 0, muted: true }]);
    bus.execute(new DeleteClipCommand(video.id));
    expect(bus.getState().audioGroups[0]?.sourceVideoClipId).toBe(middle.id);
    expect(resolveAudioMixFrame(bus.getState(), 5).map((layer) => layer.clipId)).toEqual([bus.getState().tracks[0]!.clips[1]!.id]);
  });

  it("importa vídeo e seu grupo embutido na mesma revisão com undo e redo", () => {
    const project = createEditorProjectV2({ duration: 8 });
    const license: MediaAsset["license"] = { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false };
    const asset: MediaAsset = { id: "atomic-video", kind: "video", name: "atomic.mp4", mimeType: "video/mp4", license };
    const mediaClip: Clip = { ...clip(), id: "atomic-clip", assetId: asset.id, projectStart: asProjectTime(0), projectEnd: asProjectTime(8), sourceIn: 0, sourceOut: 8 };
    const group: AudioSourceGroup = { id: "atomic-group", sourceAssetId: asset.id, sourceStreamIndex: 0, sourceVideoClipId: mediaClip.id, activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 0 };
    const bus = new EditorCommandBus(project);
    const command = new AddMediaClipCommand(asset, mediaClip, group);
    bus.execute(command);
    expect(bus.getState()).toMatchObject({ assets: [{ id: asset.id }], audioGroups: [{ id: group.id }] });
    expect(JSON.parse(JSON.stringify(command.serialize())).payload.audioGroup.id).toBe(group.id);
    bus.undo();
    expect(bus.getState().assets).toHaveLength(0);
    expect(bus.getState().audioGroups).toHaveLength(0);
    bus.redo();
    expect(resolveAudioMixFrame(bus.getState(), 4)).toMatchObject([{ clipId: mediaClip.id, representation: "embedded" }]);
  });

  it("constrói áudio extraído preservando recorte, velocidade, sample rate e vínculo", () => {
    const license: MediaAsset["license"] = { provider: "teste", sourceUrl: "fixture", licenseType: "fixture", licenseUrl: "fixture", author: "teste", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false };
    const sourceAsset: MediaAsset = { id: "extract-source", kind: "video", name: "fonte.mp4", mimeType: "video/mp4", license };
    const sourceClip: Clip = { ...clip(), id: "extract-video-split", assetId: sourceAsset.id, audioGroupId: "extract-group", projectStart: asProjectTime(30), projectEnd: asProjectTime(36), sourceIn: 10, sourceOut: 22, playbackRate: 2 };
    const group: AudioSourceGroup = { id: "extract-group", sourceAssetId: sourceAsset.id, sourceStreamIndex: 0, sourceVideoClipId: "extract-video-anchor", activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 0 };
    const extracted = buildExtractedAudioMedia({ sourceAsset, sourceClip, group, result: { wav: new Blob(["wav"]), duration: 12, sampleRate: 48000, channels: 2, peaks: [.2], rms: .1, peak: .2 }, revision: 3 });
    expect(extracted.asset).toMatchObject({ kind: "audio", mimeType: "audio/wav", duration: 12, sourceAudio: { sourceAssetId: sourceAsset.id, streamIndex: 0, sourceIn: 10, sourceOut: 22 }, audioAnalysis: { sampleRate: 48000, channels: 2 } });
    expect(extracted.clip).toMatchObject({ trackId: "track-voice", audioGroupId: group.id, projectStart: 30, projectEnd: 36, sourceIn: 0, sourceOut: 12, playbackRate: 2, audio: { stemRole: "original" }, metadata: { sourceRangeIn: 10, sourceRangeOut: 22, rebasedSource: true } });
    expect(extracted.group).toMatchObject({ activeRepresentation: "extracted", sourceRevision: 3, originalAudioAssetId: extracted.asset.id, extractedClipId: extracted.clip.id });
  });
});

describe("pacote criativo profissional", () => {
  it("resolve filtro, animação e efeito pelo mesmo frame usado na exportação", () => {
    const creative: Clip = { ...clip(), projectStart: asProjectTime(0), projectEnd: asProjectTime(4), sourceIn: 0, sourceOut: 4, adjustments: { exposure: .1, brightness: 0, contrast: .2, saturation: .3, temperature: 0, tint: 0, highlights: 0, shadows: 0, fade: 0, sharpen: .2, vignette: .3, grain: 0, blur: 0 }, motion: { in: { id: "slide-left", duration: 1, intensity: 1, easing: "linear" }, loop: { id: "pulse", duration: 1, intensity: 1, easing: "linear" } }, effects: [{ id: "flash", definitionId: "flash", enabled: true, parameters: { start: 0, end: 1, intensity: .6 } }] };
    const frame = resolveClipPresentation(creative, .5);
    expect(frame.translateX).toBeLessThan(0);
    expect(frame.filter).toContain("saturate");
    expect(frame.overlay).toBe("#ffffff");
    creative.reversed = true;
    creative.flipHorizontal = true;
    creative.flipVertical = true;
    const project = createEditorProjectV2({ duration: 4 });
    project.tracks[0]!.clips.push(creative);
    expect(resolveCompositionFrame(project, .5)[0]!.presentation).toEqual(frame);
    const manifest = JSON.parse(JSON.stringify(createEditorRenderManifest(project)));
    expect(manifest.visualClips[0]).toMatchObject({ reversed: true, flipHorizontal: true, flipVertical: true, effects: [{ definitionId: "flash" }], motion: { in: { id: "slide-left" } } });
    expect(resolveCompositionFrameFromManifest(manifest, .5)).toEqual(resolveCompositionFrame(project, .5));
  });

  it("importa SRT como uma ação atômica com palavras temporizadas", () => {
    const rows = parseTimedText("1\n00:00:01,000 --> 00:00:03,000\nOlá mundo\n\n2\n00:00:03.500 --> 00:00:05.000\nTudo certo");
    const preset = BUILT_IN_LIBRARY_ITEMS.find((item) => item.id === "builtin.caption.word-highlight")!.definition as CaptionPresetDefinition;
    const entries = createCaptionBatch(rows, preset, 7);
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 5 }));
    bus.execute(new AddCaptionBatchCommand(entries));
    const track = bus.getState().tracks.find((item) => item.kind === "captions")!;
    expect("cues" in track && track.cues).toHaveLength(2);
    expect("cues" in track && track.cues[0]!.words).toHaveLength(2);
    bus.undo();
    expect(bus.getState().tracks.find((item) => item.kind === "captions")!.clips).toHaveLength(0);
  });

  it("preserva tempos por palavra da transcrição automática", () => {
    const preset = BUILT_IN_LIBRARY_ITEMS.find((item) => item.id === "builtin.caption.word-highlight")!.definition as CaptionPresetDefinition;
    const [entry] = createCaptionBatchFromTimedWords([{
      start: 4,
      end: 6,
      words: [{ start: 4.1, end: 4.55, text: "fala" }, { start: 5.2, end: 5.9, text: "certa" }],
    }], preset, 9);
    expect(entry?.cue.words?.map((word) => [word.text, word.start, word.end])).toEqual([
      ["fala", 4.1, 4.55], ["certa", 5.2, 5.9],
    ]);
    expect(entry?.clip.metadata).toMatchObject({ generatedTranscript: true, importedTimedText: false });
  });

  it("insere stickers antigos como elementos vetoriais editáveis", () => {
    const project = createEditorProjectV2({ duration: 5 });
    const sticker = BUILT_IN_LIBRARY_ITEMS.find((item) => item.id === "builtin.sticker.subscribe")!;
    expect(resolveLibraryInsertion(project, sticker, 1, 2)).toMatchObject({ kind: "sticker", sticker: { stickerId: "subscribe", text: "INSCREVA-SE" } });
  });
});

describe("adapter V1", () => {
  it("converte segmentos e velocidade sem alterar o documento antigo", () => {
    const old = createEditorProject("video-1", { title: "Fixture", media: { duration: 12 } });
    old.preedit!.segments = [{ start: 1, end: 5 }, { start: 7, end: 11, speed: 2 }];
    const before = structuredClone(old);
    const next = adaptEditorProjectV1(old);
    expect(next.settings.duration).toBe(6);
    expect(next.tracks[0]!.clips.map((item) => [item.projectStart, item.projectEnd, item.sourceIn, item.sourceOut, item.playbackRate])).toEqual([
      [0, 4, 1, 5, 1], [4, 6, 7, 11, 2],
    ]);
    expect(old).toEqual(before);
  });
});

