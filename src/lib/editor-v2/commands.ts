import { ASPECT_SIZES, type AspectRatio, type Easing } from "@/lib/video-template/types";
import { asProjectTime, type AnimatableProperty, type AudioRepresentation, type AudioSourceGroup, type CaptionCue, type Clip, type ClipStyle, type ClipTransform, type EditorProjectV2, type MediaAsset, type ProjectSettings, type RenderImpact, type SelectionState, type TemplateInstance, type Track, type Transition } from "./types";
import { cloneProject, normalizeProject } from "./project";
import { isTrackCompatible } from "./interactions";
import { projectToSourceTime, sourceToProjectTime } from "./clock";

export interface SerializedEditorCommand {
  type: string;
  payload: Record<string, unknown>;
}

export interface EditorCommand {
  readonly type: string;
  readonly renderImpact: RenderImpact;
  readonly selectionAfter?: SelectionState;
  execute(project: EditorProjectV2): EditorProjectV2;
  undo(project: EditorProjectV2): EditorProjectV2;
  redo(project: EditorProjectV2): EditorProjectV2;
  serialize(): SerializedEditorCommand;
}

abstract class SnapshotCommand implements EditorCommand {
  abstract readonly type: string;
  abstract readonly renderImpact: RenderImpact;
  readonly selectionAfter?: SelectionState;
  private before?: EditorProjectV2;
  private after?: EditorProjectV2;

  execute(project: EditorProjectV2): EditorProjectV2 {
    this.before = cloneProject(project);
    const changed = normalizeProject(this.apply(cloneProject(project)));
    if (this.renderImpact !== "none") changed.revisions.document += 1;
    if (this.renderImpact !== "none") changed.revisions.render += 1;
    this.after = cloneProject(changed);
    return changed;
  }

  undo(project: EditorProjectV2): EditorProjectV2 {
    return this.before ? cloneProject(this.before) : project;
  }

  redo(project: EditorProjectV2): EditorProjectV2 {
    return this.after ? cloneProject(this.after) : this.execute(project);
  }

  abstract serialize(): SerializedEditorCommand;
  protected abstract apply(project: EditorProjectV2): EditorProjectV2;
}

function track(project: EditorProjectV2, id: string) {
  const found = project.tracks.find((item) => item.id === id);
  if (!found) throw new Error(`Trilha não encontrada: ${id}`);
  if (found.locked) throw new Error(`Trilha bloqueada: ${found.name}`);
  return found;
}

function locate(project: EditorProjectV2, clipId: string) {
  for (const owner of project.tracks) {
    const index = owner.clips.findIndex((clip) => clip.id === clipId);
    if (index >= 0) return { owner, index, clip: owner.clips[index]! };
  }
  throw new Error(`Clipe não encontrado: ${clipId}`);
}

function captionCue(project: EditorProjectV2, clip: Clip) {
  const owner = project.tracks.find((item) => item.id === clip.trackId);
  if (owner?.kind !== "captions" || !("cues" in owner)) return null;
  return owner.cues.find((cue) => cue.id === clip.metadata?.["captionCueId"]) ?? null;
}

function animationsForRange(clip: Clip, localStart: number, localEnd: number) {
  return clip.animations.map((animation) => ({
    ...cloneProjectValue(animation),
    keyframes: animation.keyframes
      .filter((keyframe) => Number(keyframe.time) >= localStart && Number(keyframe.time) <= localEnd)
      .map((keyframe) => ({ ...cloneProjectValue(keyframe), time: asProjectTime(Number(keyframe.time) - localStart) })),
  })).filter((animation) => animation.keyframes.length > 0);
}

function sourceRangeForProjectRange(clip: Clip, projectStart: number, projectEnd: number) {
  const first = projectToSourceTime(clip, asProjectTime(projectStart));
  const last = projectToSourceTime(clip, asProjectTime(projectEnd));
  if (first === null || last === null) throw new Error("Intervalo fora do clipe.");
  return { sourceIn: Math.min(first, last), sourceOut: Math.max(first, last) };
}

function reconnectSplitReferences(project: EditorProjectV2, originalId: string, segmentIds: string[]) {
  const lastId = segmentIds.at(-1) ?? originalId;
  project.transitions.forEach((transition) => {
    if (transition.fromClipId === originalId) transition.fromClipId = lastId;
  });
  project.templates.forEach((instance) => {
    const index = instance.clipIds.indexOf(originalId);
    if (index >= 0) instance.clipIds.splice(index, 1, ...segmentIds);
  });
}

export class SelectItemCommand extends SnapshotCommand {
  readonly type = "selectItem";
  readonly renderImpact = "none" as const;
  constructor(private readonly ids: string[], private readonly surface: SelectionState["surface"] = "timeline") { super(); }
  protected apply(project: EditorProjectV2) {
    project.selection = { itemIds: [...this.ids], primaryId: this.ids.at(-1) ?? null, surface: this.surface };
    return project;
  }
  serialize() { return { type: this.type, payload: { ids: this.ids, surface: this.surface } }; }
}

export class AddClipCommand extends SnapshotCommand {
  readonly type = "addClip";
  readonly renderImpact = "full" as const;
  constructor(private readonly clip: Clip) { super(); }
  protected apply(project: EditorProjectV2) {
    track(project, this.clip.trackId).clips.push(cloneProjectValue(this.clip));
    project.selection = { itemIds: [this.clip.id], primaryId: this.clip.id, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { clip: this.clip } }; }
}

export class ApplyTemplateCommand extends SnapshotCommand {
  readonly type = "applyTemplate";
  readonly renderImpact = "full" as const;
  constructor(private readonly instance: TemplateInstance, private readonly clips: Clip[]) { super(); }
  protected apply(project: EditorProjectV2) {
    if (!this.clips.length) throw new Error("O template não contém camadas aplicáveis.");
    for (const clip of this.clips) track(project, clip.trackId).clips.push(cloneProjectValue(clip));
    project.templates.push(cloneProjectValue(this.instance));
    project.selection = { itemIds: this.clips.map((clip) => clip.id), primaryId: this.clips.at(-1)?.id ?? null, surface: "canvas" };
    return project;
  }
  serialize() { return { type: this.type, payload: { instance: this.instance, clips: this.clips } }; }
}

export class AddCaptionCueCommand extends SnapshotCommand {
  readonly type = "addCaptionCue";
  readonly renderImpact = "full" as const;
  constructor(private readonly cue: CaptionCue, private readonly clip: Clip) { super(); }
  protected apply(project: EditorProjectV2) {
    const owner = track(project, this.clip.trackId);
    if (owner.kind !== "captions" || !("cues" in owner)) throw new Error("A legenda exige uma trilha de captions.");
    owner.clips.push(cloneProjectValue(this.clip));
    owner.cues.push(cloneProjectValue(this.cue));
    owner.cues.sort((a, b) => Number(a.start) - Number(b.start));
    project.selection = { itemIds: [this.clip.id], primaryId: this.clip.id, surface: "canvas" };
    return project;
  }
  serialize() { return { type: this.type, payload: { cue: this.cue, clip: this.clip } }; }
}

export class AddCaptionBatchCommand extends SnapshotCommand {
  readonly type = "addCaptionBatch";
  readonly renderImpact = "full" as const;
  constructor(private readonly entries: Array<{ cue: CaptionCue; clip: Clip }>) { super(); }
  protected apply(project: EditorProjectV2) {
    if (!this.entries.length) throw new Error("O arquivo não contém legendas válidas.");
    const owner = track(project, "track-captions");
    if (owner.kind !== "captions" || !("cues" in owner)) throw new Error("A trilha de legendas não está disponível.");
    for (const entry of this.entries) { owner.clips.push(cloneProjectValue(entry.clip)); owner.cues.push(cloneProjectValue(entry.cue)); }
    owner.cues.sort((a, b) => Number(a.start) - Number(b.start));
    project.selection = { itemIds: [this.entries[0]!.clip.id], primaryId: this.entries[0]!.clip.id, surface: "canvas" };
    return project;
  }
  serialize() { return { type: this.type, payload: { entries: this.entries } }; }
}

export class ApplyCaptionPresetCommand extends SnapshotCommand {
  readonly type = "applyCaptionPreset";
  readonly renderImpact = "visual" as const;
  constructor(private readonly clipId: string, private readonly presetId: string, private readonly style: ClipStyle, private readonly transform: ClipTransform, private readonly preset: Record<string, unknown>) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (clip.kind !== "caption" || owner.kind !== "captions" || !("cues" in owner)) throw new Error("Selecione uma legenda para aplicar o preset.");
    clip.style = cloneProjectValue(this.style);
    clip.transform = cloneProjectValue(this.transform);
    clip.metadata = { ...clip.metadata, captionPresetId: this.presetId, captionPreset: cloneProjectValue(this.preset) };
    const cueId = String(clip.metadata?.["captionCueId"] ?? "");
    const cue = owner.cues.find((item) => item.id === cueId);
    if (cue) { cue.styleId = this.presetId; cue.animationId = String(this.preset["motion"] ?? "none"); }
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, presetId: this.presetId, style: this.style, transform: this.transform, preset: this.preset } }; }
}

export class MoveClipCommand extends SnapshotCommand {
  readonly type = "moveClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly clipId: string, private readonly targetTrackId: string, private readonly projectStart: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const found = locate(project, this.clipId);
    if (found.owner.locked) throw new Error(`Trilha bloqueada: ${found.owner.name}`);
    const destination = track(project, this.targetTrackId);
    if (!isTrackCompatible(found.clip, destination)) throw new Error(`${found.clip.name} não é compatível com a trilha ${destination.name}.`);
    const [clip] = found.owner.clips.splice(found.index, 1);
    const duration = Number(clip!.projectEnd) - Number(clip!.projectStart);
    const previousStart = Number(clip!.projectStart);
    const previousEnd = Number(clip!.projectEnd);
    let insertionStart = this.projectStart;
    if (project.settings.rippleEnabled) {
      found.owner.clips.filter((item) => Number(item.projectStart) >= previousEnd).forEach((item) => shiftClip(item, -duration));
      if (destination.id === found.owner.id && insertionStart > previousStart) insertionStart = Math.max(previousStart, insertionStart - duration);
      destination.clips.filter((item) => Number(item.projectStart) >= insertionStart).forEach((item) => shiftClip(item, duration));
    }
    clip!.trackId = destination.id;
    clip!.projectStart = asProjectTime(insertionStart);
    clip!.projectEnd = asProjectTime(insertionStart + duration);
    destination.clips.push(clip!);
    const cue = captionCue(project, clip!);
    if (cue) {
      const delta = insertionStart - previousStart;
      cue.start = asProjectTime(Number(cue.start) + delta);
      cue.end = asProjectTime(Number(cue.end) + delta);
      cue.words?.forEach((word) => { word.start = asProjectTime(Number(word.start) + delta); word.end = asProjectTime(Number(word.end) + delta); });
    }
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, targetTrackId: this.targetTrackId, projectStart: this.projectStart } }; }
}

/** Moves every layer of an editable compound while preserving its track and relative offset. */
export class MoveCompoundClipCommand extends SnapshotCommand {
  readonly type = "moveCompoundClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly compoundGroupId: string, private readonly anchorClipId: string, private readonly projectStart: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const anchor = locate(project, this.anchorClipId).clip;
    if (anchor.metadata?.["compoundGroupId"] !== this.compoundGroupId) throw new Error("O clipe não pertence a este composto.");
    const members = project.tracks.flatMap((owner) => owner.clips.map((clip) => ({ owner, clip }))).filter(({ clip }) => clip.metadata?.["compoundGroupId"] === this.compoundGroupId);
    if (members.length < 2) throw new Error("O clipe composto não possui camadas suficientes.");
    const earliest = Math.min(...members.map(({ clip }) => Number(clip.projectStart)));
    const requestedDelta = this.projectStart - Number(anchor.projectStart);
    const delta = Math.max(-earliest, requestedDelta);
    for (const { owner, clip } of members) {
      if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
      shiftClip(clip, delta);
      const cue = captionCue(project, clip);
      if (cue) {
        cue.start = asProjectTime(Number(cue.start) + delta);
        cue.end = asProjectTime(Number(cue.end) + delta);
        cue.words?.forEach((word) => { word.start = asProjectTime(Number(word.start) + delta); word.end = asProjectTime(Number(word.end) + delta); });
      }
    }
    project.selection = { itemIds: members.map(({ clip }) => clip.id), primaryId: this.anchorClipId, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { compoundGroupId: this.compoundGroupId, anchorClipId: this.anchorClipId, projectStart: this.projectStart } }; }
}

/** Groups existing timeline items without flattening their editable layers. */
export class CreateCompoundClipCommand extends SnapshotCommand {
  readonly type = "createCompoundClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly clipIds: string[], private readonly compoundGroupId: string, private readonly name: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const ids = [...new Set(this.clipIds)];
    if (ids.length < 2) throw new Error("Selecione pelo menos dois itens para criar um clipe composto.");
    const members = ids.map((id) => locate(project, id));
    for (const { owner } of members) if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    for (const { clip } of members) clip.metadata = { ...clip.metadata, compoundGroupId: this.compoundGroupId, compoundName: this.name };
    project.selection = { itemIds: ids, primaryId: ids.at(-1) ?? null, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipIds: this.clipIds, compoundGroupId: this.compoundGroupId, name: this.name } }; }
}

export class DissolveCompoundClipCommand extends SnapshotCommand {
  readonly type = "dissolveCompoundClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly compoundGroupId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const members = project.tracks.flatMap((owner) => owner.clips.map((clip) => ({ owner, clip }))).filter(({ clip }) => clip.metadata?.["compoundGroupId"] === this.compoundGroupId);
    if (!members.length) throw new Error("Clipe composto não encontrado.");
    for (const { owner, clip } of members) {
      if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
      const { compoundGroupId: _group, compoundName: _name, ...metadata } = clip.metadata ?? {};
      clip.metadata = metadata;
    }
    project.selection = { itemIds: members.map(({ clip }) => clip.id), primaryId: members.at(-1)?.clip.id ?? null, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { compoundGroupId: this.compoundGroupId } }; }
}

export class AddMediaClipCommand extends SnapshotCommand {
  readonly type = "addMediaClip";
  readonly renderImpact = "full" as const;
  constructor(private readonly asset: MediaAsset, private readonly clip: Clip, private readonly audioGroup?: AudioSourceGroup) { super(); }
  protected apply(project: EditorProjectV2) {
    if (project.assets.some((item) => item.id === this.asset.id)) throw new Error(`Mídia já adicionada: ${this.asset.name}`);
    const owner = track(project, this.clip.trackId);
    if (!isTrackCompatible(this.clip, owner)) throw new Error(`${this.asset.name} não é compatível com ${owner.name}.`);
    project.assets.push(cloneProjectValue(this.asset));
    owner.clips.push(cloneProjectValue(this.clip));
    if (this.audioGroup) {
      if (this.asset.kind !== "video" || this.audioGroup.sourceAssetId !== this.asset.id || this.audioGroup.sourceVideoClipId !== this.clip.id) throw new Error("O grupo de áudio embutido não corresponde ao vídeo importado.");
      if (project.audioGroups.some((item) => item.id === this.audioGroup!.id)) throw new Error(`Grupo de áudio já existe: ${this.audioGroup.id}`);
      project.audioGroups.push({ ...cloneProjectValue(this.audioGroup), activeRepresentation: "embedded" });
    }
    project.selection = { itemIds: [this.clip.id], primaryId: this.clip.id, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { asset: this.asset, clip: this.clip, ...(this.audioGroup ? { audioGroup: this.audioGroup } : {}) } }; }
}

/** Registers the original extracted stream and switches playback atomically. */
export class RegisterExtractedAudioCommand extends SnapshotCommand {
  readonly type = "registerExtractedAudio";
  readonly renderImpact = "full" as const;
  constructor(private readonly group: AudioSourceGroup, private readonly asset: MediaAsset, private readonly clip: Clip) { super(); }
  protected apply(project: EditorProjectV2) {
    if (this.asset.kind !== "audio" || this.clip.kind !== "audio" || !this.clip.audio) throw new Error("A extração exige um asset e um clipe de áudio.");
    if (this.group.originalAudioAssetId !== this.asset.id || this.group.extractedClipId !== this.clip.id || this.clip.assetId !== this.asset.id) throw new Error("Asset, clipe e grupo extraído não correspondem.");
    const sourceClip = this.group.sourceVideoClipId ? locate(project, this.group.sourceVideoClipId).clip : undefined;
    if (!project.assets.some((item) => item.id === this.group.sourceAssetId) || (sourceClip && sourceClip.assetId !== this.group.sourceAssetId)) throw new Error("A fonte do áudio não existe no projeto.");
    const owner = track(project, this.clip.trackId);
    if (!isTrackCompatible(this.clip, owner)) throw new Error(`${this.clip.name} não é compatível com ${owner.name}.`);
    const existingGroup = project.audioGroups.find((item) => item.id === this.group.id);
    if (existingGroup && (existingGroup.sourceAssetId !== this.group.sourceAssetId || existingGroup.sourceStreamIndex !== this.group.sourceStreamIndex)) throw new Error("O grupo existente pertence a outra fonte de áudio.");
    const previousClipId = existingGroup?.extractedClipId;
    const previousAssetId = previousClipId ? project.tracks.flatMap((item) => item.clips).find((item) => item.id === previousClipId)?.assetId : undefined;
    if (previousClipId) for (const candidate of project.tracks) candidate.clips = candidate.clips.filter((item) => item.id !== previousClipId);
    upsertAsset(project, {
      ...cloneProjectValue(this.asset),
      sourceAudio: {
        ...cloneProjectValue(this.asset.sourceAudio),
        sourceAssetId: this.group.sourceAssetId,
        streamIndex: this.group.sourceStreamIndex,
      },
    });
    owner.clips.push({ ...cloneProjectValue(this.clip), audioGroupId: this.group.id, audio: { ...cloneProjectValue(this.clip.audio), stemRole: "original" } });
    if (existingGroup) Object.assign(existingGroup, cloneProjectValue(this.group), { activeRepresentation: "extracted" as const });
    else project.audioGroups.push({ ...cloneProjectValue(this.group), activeRepresentation: "extracted" });
    if (previousAssetId && previousAssetId !== this.asset.id && !project.tracks.some((candidate) => candidate.clips.some((item) => item.assetId === previousAssetId))) project.assets = project.assets.filter((item) => item.id !== previousAssetId);
    project.selection = { itemIds: [this.clip.id], primaryId: this.clip.id, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { group: this.group, asset: this.asset, clip: this.clip } }; }
}

/** Replaces only this group's separated revision and activates both stems together. */
export class ApplySeparatedAudioCommand extends SnapshotCommand {
  readonly type = "applySeparatedAudio";
  readonly renderImpact = "full" as const;
  constructor(
    private readonly groupId: string,
    private readonly dialogueAsset: MediaAsset,
    private readonly musicAsset: MediaAsset,
    private readonly dialogueClip: Clip,
    private readonly musicClip: Clip,
  ) { super(); }
  protected apply(project: EditorProjectV2) {
    const group = project.audioGroups.find((item) => item.id === this.groupId);
    if (!group) throw new Error(`Grupo de áudio não encontrado: ${this.groupId}`);
    const dialogueTrack = track(project, this.dialogueClip.trackId);
    const musicTrack = track(project, this.musicClip.trackId);
    validateStemPair(group, this.dialogueAsset, this.musicAsset, this.dialogueClip, this.musicClip);
    if (!isTrackCompatible(this.dialogueClip, dialogueTrack) || !isTrackCompatible(this.musicClip, musicTrack)) throw new Error("As trilhas separadas não são compatíveis com o destino.");

    const previousClipIds = [group.dialogueClipId, group.musicClipId].filter((id): id is string => Boolean(id));
    const previousAssetIds = project.tracks.flatMap((owner) => owner.clips).filter((clip) => previousClipIds.includes(clip.id)).map((clip) => clip.assetId).filter((id): id is string => Boolean(id));
    for (const owner of project.tracks) owner.clips = owner.clips.filter((clip) => !previousClipIds.includes(clip.id));
    upsertAsset(project, this.dialogueAsset);
    upsertAsset(project, this.musicAsset);
    dialogueTrack.clips.push({ ...cloneProjectValue(this.dialogueClip), audioGroupId: group.id });
    musicTrack.clips.push({ ...cloneProjectValue(this.musicClip), audioGroupId: group.id });
    group.dialogueClipId = this.dialogueClip.id;
    group.musicClipId = this.musicClip.id;
    group.activeRepresentation = "separated";
    group.sourceRevision = Math.max(group.sourceRevision, this.dialogueAsset.stem!.revision, this.musicAsset.stem!.revision);

    const activeAssetIds = new Set(project.tracks.flatMap((owner) => owner.clips).map((clip) => clip.assetId).filter(Boolean));
    const protectedAssetIds = new Set(project.audioGroups.flatMap((item) => [item.sourceAssetId, item.originalAudioAssetId]).filter(Boolean));
    project.assets = project.assets.filter((asset) => !previousAssetIds.includes(asset.id) || activeAssetIds.has(asset.id) || protectedAssetIds.has(asset.id));
    project.selection = { itemIds: [this.dialogueClip.id, this.musicClip.id], primaryId: this.dialogueClip.id, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { groupId: this.groupId, dialogueAsset: this.dialogueAsset, musicAsset: this.musicAsset, dialogueClip: this.dialogueClip, musicClip: this.musicClip } }; }
}

export class SetAudioRepresentationCommand extends SnapshotCommand {
  readonly type = "setAudioRepresentation";
  readonly renderImpact = "audio" as const;
  constructor(private readonly groupId: string, private readonly representation: AudioRepresentation) { super(); }
  protected apply(project: EditorProjectV2) {
    const group = project.audioGroups.find((item) => item.id === this.groupId);
    if (!group) throw new Error(`Grupo de áudio não encontrado: ${this.groupId}`);
    assertRepresentationAvailable(project, group, this.representation);
    group.activeRepresentation = this.representation;
    const selected = this.representation === "embedded" ? group.sourceVideoClipId : this.representation === "extracted" ? group.extractedClipId : group.dialogueClipId;
    project.selection = selected ? { itemIds: [selected], primaryId: selected, surface: "timeline" } : project.selection;
    return project;
  }
  serialize() { return { type: this.type, payload: { groupId: this.groupId, representation: this.representation } }; }
}

export class RestoreOriginalAudioCommand extends SnapshotCommand {
  readonly type = "restoreOriginalAudio";
  readonly renderImpact = "audio" as const;
  constructor(private readonly groupId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const group = project.audioGroups.find((item) => item.id === this.groupId);
    if (!group) throw new Error(`Grupo de áudio não encontrado: ${this.groupId}`);
    const representation: AudioRepresentation = group.extractedClipId ? "extracted" : "embedded";
    assertRepresentationAvailable(project, group, representation);
    group.activeRepresentation = representation;
    const selected = representation === "extracted" ? group.extractedClipId : group.sourceVideoClipId;
    project.selection = selected ? { itemIds: [selected], primaryId: selected, surface: "timeline" } : project.selection;
    return project;
  }
  serialize() { return { type: this.type, payload: { groupId: this.groupId } }; }
}

export class UpdateTrackCommand extends SnapshotCommand {
  readonly type = "updateTrack";
  readonly renderImpact = "full" as const;
  constructor(private readonly trackId: string, private readonly patch: Partial<Pick<Track, "muted" | "solo" | "gain" | "hidden" | "locked" | "name">>) { super(); }
  protected apply(project: EditorProjectV2) {
    const owner = project.tracks.find((item) => item.id === this.trackId);
    if (!owner) throw new Error(`Trilha não encontrada: ${this.trackId}`);
    Object.assign(owner, cloneProjectValue(this.patch));
    return project;
  }
  serialize() { return { type: this.type, payload: { trackId: this.trackId, patch: this.patch } }; }
}

export class AddTrackCommand extends SnapshotCommand {
  readonly type = "addTrack";
  readonly renderImpact = "full" as const;
  constructor(private readonly newTrack: Track) { super(); }
  protected apply(project: EditorProjectV2) {
    if (project.tracks.some((item) => item.id === this.newTrack.id)) throw new Error(`A camada já existe: ${this.newTrack.name}`);
    if (this.newTrack.kind === "video" || this.newTrack.kind === "captions") throw new Error("Use uma camada de sobreposição ou áudio adicional.");
    project.tracks.push(cloneProjectValue(this.newTrack));
    project.tracks.sort((a, b) => a.order - b.order);
    return project;
  }
  serialize() { return { type: this.type, payload: { track: this.newTrack } }; }
}

export class UpdateAssetAnalysisCommand extends SnapshotCommand {
  readonly type = "updateAssetAnalysis";
  readonly renderImpact = "none" as const;
  constructor(private readonly assetId: string, private readonly analysis: NonNullable<MediaAsset["audioAnalysis"]>) { super(); }
  protected apply(project: EditorProjectV2) {
    const asset = project.assets.find((item) => item.id === this.assetId);
    if (!asset) throw new Error(`Asset não encontrado: ${this.assetId}`);
    asset.audioAnalysis = cloneProjectValue(this.analysis);
    return project;
  }
  serialize() { return { type: this.type, payload: { assetId: this.assetId, analysis: this.analysis } }; }
}

/** Updates durable asset metadata after persistence/relink without adding history noise. */
export class UpdateMediaAssetCommand extends SnapshotCommand {
  readonly type = "updateMediaAsset";
  readonly renderImpact = "none" as const;
  constructor(private readonly assetId: string, private readonly patch: Partial<Pick<MediaAsset, "storagePath" | "hash" | "mimeType">>) { super(); }
  protected apply(project: EditorProjectV2) {
    const asset = project.assets.find((item) => item.id === this.assetId);
    if (!asset) throw new Error(`Asset não encontrado: ${this.assetId}`);
    Object.assign(asset, cloneProjectValue(this.patch));
    return project;
  }
  serialize() { return { type: this.type, payload: { assetId: this.assetId, patch: this.patch } }; }
}

export type AutoSplitSelectionMode = "all" | "odd" | "even";

export function resolveAutoSplitSelection(project: EditorProjectV2, referenceIds: string[], mode: AutoSplitSelectionMode) {
  const clips = project.tracks.flatMap((owner) => owner.clips);
  const clipById = new Map(clips.map((clip) => [clip.id, clip]));
  const referenceClips = referenceIds
    .map((id) => clipById.get(id))
    .filter((clip): clip is Clip => clip?.kind === "video")
    .sort((left, right) => Number(left.projectStart) - Number(right.projectStart));
  const groupIds = new Set(
    referenceClips
      .map((clip) => clip.metadata?.["autoSplitGroupId"])
      .filter((id): id is string => typeof id === "string"),
  );
  const candidates = groupIds.size
    ? clips.filter((clip) => clip.kind === "video" && groupIds.has(String(clip.metadata?.["autoSplitGroupId"] ?? "")))
    : referenceClips;
  return candidates
    .filter((clip) => {
      if (mode === "all") return true;
      const part = Number(clip.metadata?.["autoSplitPart"] ?? candidates.indexOf(clip) + 1);
      return Number.isInteger(part) && (mode === "odd" ? part % 2 === 1 : part % 2 === 0);
    })
    .sort((left, right) => Number(left.projectStart) - Number(right.projectStart) || Number(left.metadata?.["autoSplitPart"] ?? 0) - Number(right.metadata?.["autoSplitPart"] ?? 0))
    .map((clip) => clip.id);
}

/** Selects positions inside the automatic-cut group without creating an undo entry. */
export class SelectAutoSplitPartsCommand extends SnapshotCommand {
  readonly type = "selectAutoSplitParts";
  readonly renderImpact = "none" as const;
  constructor(private readonly referenceIds: string[], private readonly mode: AutoSplitSelectionMode) { super(); }
  protected apply(project: EditorProjectV2) {
    const referenced = this.referenceIds
      .map((id) => project.tracks.flatMap((owner) => owner.clips).find((clip) => clip.id === id))
      .filter((clip): clip is Clip => clip?.kind === "video")
      .sort((left, right) => Number(left.projectStart) - Number(right.projectStart));
    if (referenced.length > 1 && !referenced.some((clip) => typeof clip.metadata?.["autoSplitGroupId"] === "string")) {
      const groupId = `${referenced[0]!.id}-alternating-selection`;
      referenced.forEach((clip, index) => {
        clip.metadata = {
          ...clip.metadata,
          autoSplitGroupId: groupId,
          autoSplitPart: index + 1,
          autoSplitPartCount: referenced.length,
          autoSplitSourceId: referenced[0]!.id,
        };
      });
    }
    const ids = resolveAutoSplitSelection(project, this.referenceIds, this.mode);
    if (!ids.length) throw new Error("Selecione um trecho criado pelos cortes automáticos.");
    project.selection = { itemIds: ids, primaryId: ids.at(-1) ?? null, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { referenceIds: this.referenceIds, mode: this.mode } }; }
}

/** Removes an unused source, or only hides a source that still feeds timeline clips. */
export class RemoveMediaAssetFromLibraryCommand extends SnapshotCommand {
  readonly type = "removeMediaAssetFromLibrary";
  readonly renderImpact = "none" as const;
  constructor(private readonly assetId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const asset = project.assets.find((item) => item.id === this.assetId);
    if (!asset) throw new Error(`Mídia não encontrada: ${this.assetId}`);
    const inUse = project.tracks.some((owner) => owner.clips.some((clip) => clip.assetId === this.assetId));
    if (inUse) asset.libraryHidden = true;
    else project.assets = project.assets.filter((item) => item.id !== this.assetId);
    return project;
  }
  serialize() { return { type: this.type, payload: { assetId: this.assetId } }; }
}

export class UpsertAudioEnvelopePointCommand extends SnapshotCommand {
  readonly type = "upsertAudioEnvelopePoint";
  readonly renderImpact = "audio" as const;
  constructor(private readonly clipId: string, private readonly pointId: string, private readonly time: number, private readonly gain: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked || clip.kind !== "audio" || !clip.audio) throw new Error("Selecione um clipe de áudio desbloqueado.");
    const duration = Number(clip.projectEnd) - Number(clip.projectStart);
    const value = { id: this.pointId, time: asProjectTime(Math.max(0, Math.min(duration, this.time))), gain: Math.max(0, Math.min(2, this.gain)) };
    const existing = clip.audio.envelope.find((point) => point.id === this.pointId || Math.abs(Number(point.time) - Number(value.time)) < 1 / 120);
    if (existing) Object.assign(existing, value); else clip.audio.envelope.push(value);
    clip.audio.envelope.sort((a, b) => Number(a.time) - Number(b.time));
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, pointId: this.pointId, time: this.time, gain: this.gain } }; }
}

export class DeleteAudioEnvelopePointCommand extends SnapshotCommand {
  readonly type = "deleteAudioEnvelopePoint";
  readonly renderImpact = "audio" as const;
  constructor(private readonly clipId: string, private readonly pointId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked || !clip.audio) throw new Error("Envelope de áudio não encontrado.");
    clip.audio.envelope = clip.audio.envelope.filter((point) => point.id !== this.pointId);
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, pointId: this.pointId } }; }
}

export class DuplicateClipsCommand extends SnapshotCommand {
  readonly type = "duplicateClips";
  readonly renderImpact = "full" as const;
  constructor(private readonly clipIds: string[], private readonly suffix: string, private readonly offset?: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const sources = this.clipIds.map((clipId) => locate(project, clipId));
    if (!sources.length) throw new Error("Selecione ao menos um clipe para duplicar.");
    const selectionStart = Math.min(...sources.map(({ clip }) => Number(clip.projectStart)));
    const selectionEnd = Math.max(...sources.map(({ clip }) => Number(clip.projectEnd)));
    const shift = this.offset ?? Math.max(0.04, selectionEnd - selectionStart);
    const copies: Clip[] = [];
    const compoundCounts = new Map<string, number>();
    for (const { clip } of sources) {
      const groupId = clip.metadata?.["compoundGroupId"];
      if (typeof groupId === "string") compoundCounts.set(groupId, (compoundCounts.get(groupId) ?? 0) + 1);
    }
    for (const { clip, owner } of sources) {
      if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
      const copy = cloneProjectValue(clip);
      copy.id = `${clip.id}-copy-${this.suffix}-${copies.length + 1}`;
      copy.name = `${clip.name} · cópia`;
      const sourceCompoundId = copy.metadata?.["compoundGroupId"];
      if (typeof sourceCompoundId === "string") {
        if ((compoundCounts.get(sourceCompoundId) ?? 0) > 1) copy.metadata = { ...copy.metadata, compoundGroupId: `${sourceCompoundId}-copy-${this.suffix}` };
        else {
          const { compoundGroupId: _group, compoundName: _name, ...metadata } = copy.metadata ?? {};
          copy.metadata = metadata;
        }
      }
      shiftClip(copy, shift);
      if (copy.kind === "caption" && owner.kind === "captions" && "cues" in owner) {
        const sourceCue = owner.cues.find((cue) => cue.id === clip.metadata?.["captionCueId"]);
        if (sourceCue) {
          const cue = cloneProjectValue(sourceCue);
          cue.id = `${sourceCue.id}-copy-${this.suffix}-${copies.length + 1}`;
          cue.start = asProjectTime(Number(cue.start) + shift);
          cue.end = asProjectTime(Number(cue.end) + shift);
          cue.words?.forEach((word, index) => {
            word.id = `${word.id}-copy-${this.suffix}-${index + 1}`;
            word.start = asProjectTime(Number(word.start) + shift);
            word.end = asProjectTime(Number(word.end) + shift);
          });
          copy.metadata = { ...copy.metadata, captionCueId: cue.id };
          owner.cues.push(cue);
        }
      }
      owner.clips.push(copy);
      copies.push(copy);
    }
    project.selection = { itemIds: copies.map((clip) => clip.id), primaryId: copies.at(-1)?.id ?? null, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipIds: this.clipIds, suffix: this.suffix, placement: this.offset === undefined ? "after-selection" : "offset", offset: this.offset } }; }
}

export class TrimClipCommand extends SnapshotCommand {
  readonly type = "trimClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly clipId: string, private readonly projectStart: number, private readonly projectEnd: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    const previousStart = Number(clip.projectStart);
    const start = Math.max(0, this.projectStart);
    const end = Math.max(start + 0.04, this.projectEnd);
    const previousEnd = Number(clip.projectEnd);
    const previousDuration = previousEnd - previousStart;
    const requestedDuration = end - start;
    const sourceStartDelta = Math.max(0, start - Number(clip.projectStart)) * clip.playbackRate;
    const sourceEndDelta = Math.max(0, previousEnd - end) * clip.playbackRate;
    clip.projectStart = asProjectTime(project.settings.rippleEnabled ? previousStart : start);
    clip.projectEnd = asProjectTime(project.settings.rippleEnabled ? previousStart + requestedDuration : end);
    if (clip.reversed) {
      clip.sourceOut = Math.max(clip.sourceIn, clip.sourceOut - sourceStartDelta);
      clip.sourceIn = Math.min(clip.sourceOut, clip.sourceIn + sourceEndDelta);
    } else {
      clip.sourceIn = Math.min(clip.sourceOut, clip.sourceIn + sourceStartDelta);
      clip.sourceOut = Math.max(clip.sourceIn, clip.sourceOut - sourceEndDelta);
    }
    const cue = captionCue(project, clip);
    if (cue) {
      cue.start = clip.projectStart;
      cue.end = clip.projectEnd;
      if (cue.words) cue.words = cue.words.filter((word) => Number(word.end) > Number(cue.start) && Number(word.start) < Number(cue.end)).map((word) => ({ ...word, start: asProjectTime(Math.max(Number(cue.start), Number(word.start))), end: asProjectTime(Math.min(Number(cue.end), Number(word.end))) }));
    }
    if (project.settings.rippleEnabled && requestedDuration !== previousDuration) {
      owner.clips.filter((item) => item.id !== clip.id && Number(item.projectStart) >= previousEnd).forEach((item) => shiftClip(item, requestedDuration - previousDuration));
    }
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, projectStart: this.projectStart, projectEnd: this.projectEnd } }; }
}

export class SplitClipCommand extends SnapshotCommand {
  readonly type = "splitClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly clipId: string, private readonly at: number, private readonly rightClipId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner, index } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    if (this.at <= Number(clip.projectStart) + 0.04 || this.at >= Number(clip.projectEnd) - 0.04) {
      throw new Error("O corte precisa ficar dentro do clipe.");
    }
    const originalStart = Number(clip.projectStart);
    const originalEnd = Number(clip.projectEnd);
    const originalSourceIn = clip.sourceIn;
    const originalSourceOut = clip.sourceOut;
    const sourceAudioGroup = project.audioGroups.find((group) => group.sourceVideoClipId === clip.id || group.id === clip.audioGroupId);
    const sourceAt = projectToSourceTime(clip, asProjectTime(this.at));
    if (sourceAt === null) throw new Error("O corte precisa ficar dentro do clipe.");
    const splitLocalTime = this.at - Number(clip.projectStart);
    const right: Clip = {
      ...cloneProjectValue(clip),
      id: this.rightClipId,
      name: `${clip.name} · 2`,
      projectStart: asProjectTime(this.at),
      sourceIn: clip.reversed ? originalSourceIn : sourceAt,
      sourceOut: clip.reversed ? sourceAt : originalSourceOut,
      animations: animationsForRange(clip, splitLocalTime, originalEnd - originalStart),
    };
    if (sourceAudioGroup) {
      clip.audioGroupId = sourceAudioGroup.id;
      right.audioGroupId = sourceAudioGroup.id;
    }
    clip.animations = animationsForRange(clip, 0, splitLocalTime);
    clip.projectEnd = asProjectTime(this.at);
    clip.sourceIn = clip.reversed ? sourceAt : originalSourceIn;
    clip.sourceOut = clip.reversed ? originalSourceOut : sourceAt;
    owner.clips.splice(index + 1, 0, right);
    reconnectSplitReferences(project, clip.id, [clip.id, right.id]);
    if (owner.kind === "captions" && "cues" in owner) {
      const originalCue = owner.cues.find((cue) => cue.id === clip.metadata?.["captionCueId"]);
      if (originalCue) {
        const rightCueId = `${originalCue.id}-split`;
        const rightWords = originalCue.words?.filter((word) => Number(word.end) > this.at).map((word) => ({ ...word, id: `${word.id}-right`, start: asProjectTime(Math.max(this.at, Number(word.start))) }));
        if (originalCue.words) originalCue.words = originalCue.words.filter((word) => Number(word.start) < this.at).map((word) => ({ ...word, end: asProjectTime(Math.min(this.at, Number(word.end))) }));
        originalCue.end = asProjectTime(this.at);
        const rightCue: CaptionCue = { ...cloneProjectValue(originalCue), id: rightCueId, start: asProjectTime(this.at), end: right.projectEnd, ...(rightWords ? { words: rightWords } : {}) };
        right.metadata = { ...right.metadata, captionCueId: rightCueId };
        owner.cues.push(rightCue);
      }
    }
    project.selection = { itemIds: [right.id], primaryId: right.id, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, at: this.at, rightClipId: this.rightClipId } }; }
}

/** Adds another clip instance for an asset that is already registered in the project. */
export class InsertMediaClipCommand extends SnapshotCommand {
  readonly type = "insertMediaClip";
  readonly renderImpact = "full" as const;
  constructor(private readonly clip: Clip, private readonly audioGroup?: AudioSourceGroup) { super(); }
  protected apply(project: EditorProjectV2) {
    if (!this.clip.assetId || !project.assets.some((item) => item.id === this.clip.assetId)) throw new Error("A mídia precisa estar na biblioteca antes de ser inserida.");
    if (project.tracks.some((item) => item.clips.some((clip) => clip.id === this.clip.id))) throw new Error(`Clipe já existe: ${this.clip.id}`);
    const owner = track(project, this.clip.trackId);
    if (!isTrackCompatible(this.clip, owner)) throw new Error(`${this.clip.name} não é compatível com ${owner.name}.`);
    owner.clips.push(cloneProjectValue(this.clip));
    if (this.audioGroup) {
      if (this.audioGroup.sourceAssetId !== this.clip.assetId || this.audioGroup.sourceVideoClipId !== this.clip.id) throw new Error("O grupo de áudio não corresponde ao vídeo inserido.");
      if (project.audioGroups.some((item) => item.id === this.audioGroup!.id)) throw new Error(`Grupo de áudio já existe: ${this.audioGroup.id}`);
      project.audioGroups.push(cloneProjectValue(this.audioGroup));
    }
    project.selection = { itemIds: [this.clip.id], primaryId: this.clip.id, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { clip: this.clip, ...(this.audioGroup ? { audioGroup: this.audioGroup } : {}) } }; }
}

export class AutoSplitClipsCommand extends SnapshotCommand {
  readonly type = "autoSplitClips";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly clipIds: string[], private readonly interval: number, private readonly suffix: string) { super(); }
  protected apply(project: EditorProjectV2) {
    if (!Number.isFinite(this.interval)) throw new Error("Informe um intervalo válido.");
    const interval = Math.max(0.25, Math.min(60, this.interval));
    const selected: string[] = [];
    let cutCount = 0;
    for (const clipId of this.clipIds) {
      const { clip, owner, index } = locate(project, clipId);
      if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
      if (clip.kind !== "video") continue;
      const start = Number(clip.projectStart);
      const end = Number(clip.projectEnd);
      const duration = end - start;
      if (duration <= interval + 0.04) continue;
      const sourceAudioGroup = project.audioGroups.find((group) => group.sourceVideoClipId === clip.id || group.id === clip.audioGroupId);
      const segments: Clip[] = [];
      const groupId = `${clip.id}-auto-${this.suffix}`;
      const partCount = Math.ceil(duration / interval);
      for (let localStart = 0, part = 1; localStart < duration - 0.001; localStart += interval, part += 1) {
        const localEnd = Math.min(duration, localStart + interval);
        const segmentStart = start + localStart;
        const segmentEnd = start + localEnd;
        const range = sourceRangeForProjectRange(clip, segmentStart, segmentEnd);
        const segment = cloneProjectValue(clip);
        segment.id = part === 1 ? clip.id : `${clip.id}-auto-${this.suffix}-${part}`;
        segment.name = `${clip.name} · ${part}`;
        segment.projectStart = asProjectTime(segmentStart);
        segment.projectEnd = asProjectTime(segmentEnd);
        segment.sourceIn = range.sourceIn;
        segment.sourceOut = range.sourceOut;
        segment.metadata = { ...segment.metadata, autoSplitGroupId: groupId, autoSplitPart: part, autoSplitPartCount: partCount, autoSplitSourceId: clip.id };
        if (sourceAudioGroup) segment.audioGroupId = sourceAudioGroup.id;
        segment.animations = animationsForRange(clip, localStart, localEnd);
        segments.push(segment);
      }
      owner.clips.splice(index, 1, ...segments);
      reconnectSplitReferences(project, clip.id, segments.map((segment) => segment.id));
      selected.push(...segments.map((segment) => segment.id));
      cutCount += segments.length - 1;
    }
    if (!cutCount) throw new Error("Nenhum vídeo selecionado é maior que o intervalo informado.");
    project.selection = { itemIds: selected, primaryId: selected.at(-1) ?? null, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipIds: this.clipIds, interval: this.interval, suffix: this.suffix } }; }
}

export interface SilenceClipPlan {
  clipId: string;
  keepSourceRanges: { start: number; end: number }[];
}

/** Removes detected pauses and closes the gaps in one reversible edit. */
export class RemoveSilenceCommand extends SnapshotCommand {
  readonly type = "removeSilence";
  readonly renderImpact = "full" as const;
  constructor(private readonly plans: SilenceClipPlan[], private readonly suffix: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const selected: string[] = [];
    let removed = 0;
    for (const plan of this.plans) {
      const { clip, owner, index } = locate(project, plan.clipId);
      if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
      if (clip.kind !== "video") continue;
      const orderedRanges = [...plan.keepSourceRanges]
        .filter((range) => range.end - range.start >= .04)
        .sort((left, right) => left.start - right.start);
      if (clip.reversed) orderedRanges.reverse();
      if (!orderedRanges.length) continue;
      const originalDuration = Number(clip.projectEnd) - Number(clip.projectStart);
      let cursor = Number(clip.projectStart);
      const sourceAudioGroup = project.audioGroups.find((group) => group.sourceVideoClipId === clip.id || group.id === clip.audioGroupId);
      const segments = orderedRanges.map((range, rangeIndex) => {
        const segment = cloneProjectValue(clip);
        const projectDuration = (range.end - range.start) / Math.max(.05, clip.playbackRate);
        const originalFirst = sourceToProjectTime(clip, range.start);
        const originalLast = sourceToProjectTime(clip, range.end);
        const localStart = Math.max(0, Math.min(Number(originalFirst ?? clip.projectStart), Number(originalLast ?? clip.projectStart)) - Number(clip.projectStart));
        const localEnd = Math.min(originalDuration, Math.max(Number(originalFirst ?? clip.projectEnd), Number(originalLast ?? clip.projectEnd)) - Number(clip.projectStart));
        segment.id = rangeIndex === 0 ? clip.id : `${clip.id}-speech-${this.suffix}-${rangeIndex + 1}`;
        segment.name = `${clip.name} · fala ${rangeIndex + 1}`;
        segment.projectStart = asProjectTime(cursor);
        segment.projectEnd = asProjectTime(cursor + projectDuration);
        segment.sourceIn = range.start;
        segment.sourceOut = range.end;
        segment.animations = animationsForRange(clip, localStart, localEnd);
        if (sourceAudioGroup) segment.audioGroupId = sourceAudioGroup.id;
        cursor += projectDuration;
        return segment;
      });
      const kept = segments.reduce((total, segment) => total + Number(segment.projectEnd) - Number(segment.projectStart), 0);
      removed += Math.max(0, originalDuration - kept);
      owner.clips.splice(index, 1, ...segments);
      reconnectSplitReferences(project, clip.id, segments.map((segment) => segment.id));
      selected.push(...segments.map((segment) => segment.id));
    }
    if (removed < .04) throw new Error("Nenhuma pausa longa o suficiente foi encontrada na seleção.");
    project.selection = { itemIds: selected, primaryId: selected.at(-1) ?? null, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { plans: this.plans, suffix: this.suffix } }; }
}

export class DeleteClipCommand extends SnapshotCommand {
  readonly type = "deleteClip";
  readonly renderImpact = "full" as const;
  constructor(private readonly clipId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const { owner, index } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    const [removed] = owner.clips.splice(index, 1);
    unlinkAudioClips(project, new Set([this.clipId]));
    if (owner.kind === "captions" && "cues" in owner) owner.cues = owner.cues.filter((cue) => cue.id !== removed?.metadata?.["captionCueId"]);
    project.templates = project.templates.map((instance) => ({ ...instance, clipIds: instance.clipIds.filter((id) => id !== this.clipId) })).filter((instance) => instance.clipIds.length > 0);
    project.transitions = project.transitions.filter((item) => item.fromClipId !== this.clipId && item.toClipId !== this.clipId);
    project.selection = { itemIds: [], primaryId: null, surface: null };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId } }; }
}

export class DeleteClipsCommand extends SnapshotCommand {
  readonly type = "deleteClips";
  readonly renderImpact = "full" as const;
  constructor(private readonly clipIds: string[]) { super(); }
  protected apply(project: EditorProjectV2) {
    const ids = new Set(this.clipIds);
    for (const owner of project.tracks) {
      if (owner.locked && owner.clips.some((clip) => ids.has(clip.id))) throw new Error(`Trilha bloqueada: ${owner.name}`);
      const removed = owner.clips.filter((clip) => ids.has(clip.id)).map((clip) => ({ start: Number(clip.projectStart), end: Number(clip.projectEnd) }));
      owner.clips = owner.clips.filter((clip) => !ids.has(clip.id));
      if (owner.kind === "captions" && "cues" in owner) {
        const remainingCueIds = new Set(owner.clips.map((clip) => clip.metadata?.["captionCueId"]).filter(Boolean));
        owner.cues = owner.cues.filter((cue) => remainingCueIds.has(cue.id));
      }
      if (project.settings.rippleEnabled && removed.length) {
        owner.clips.forEach((clip) => {
          const shift = removed.filter((range) => range.end <= Number(clip.projectStart)).reduce((total, range) => total + range.end - range.start, 0);
          if (shift) shiftClip(clip, -shift);
        });
      }
    }
    unlinkAudioClips(project, ids);
    project.transitions = project.transitions.filter((item) => !ids.has(item.fromClipId) && !ids.has(item.toClipId));
    project.templates = project.templates.map((instance) => ({ ...instance, clipIds: instance.clipIds.filter((id) => !ids.has(id)) })).filter((instance) => instance.clipIds.length > 0);
    project.selection = { itemIds: [], primaryId: null, surface: null };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipIds: this.clipIds } }; }
}

export class UpdateClipCommand extends SnapshotCommand {
  readonly type = "updateClip";
  readonly renderImpact = "full" as const;
  constructor(private readonly clipId: string, private readonly patch: Partial<Omit<Clip, "id" | "trackId">>) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    Object.assign(clip, cloneProjectValue(this.patch));
    if (clip.kind === "caption" && this.patch.style?.text && owner.kind === "captions" && "cues" in owner) {
      const cue = owner.cues.find((item) => item.id === clip.metadata?.["captionCueId"]);
      if (cue) {
        cue.text = this.patch.style.text;
        const words = cue.text.split(/\s+/).filter(Boolean);
        const duration = Number(cue.end) - Number(cue.start);
        cue.words = words.map((text, index) => ({ id: `${cue.id}-word-${index + 1}`, text, start: asProjectTime(Number(cue.start) + duration * index / words.length), end: asProjectTime(Number(cue.start) + duration * (index + 1) / words.length) }));
      }
    }
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, patch: this.patch } }; }
}

export interface ClipBatchUpdate {
  clipId: string;
  patch: Partial<Omit<Clip, "id" | "trackId">>;
}

/** Applies a multi-selection edit as one history entry. */
export class UpdateClipsCommand extends SnapshotCommand {
  readonly type = "updateClips";
  readonly renderImpact = "full" as const;
  constructor(private readonly updates: ClipBatchUpdate[]) { super(); }
  protected apply(project: EditorProjectV2) {
    if (!this.updates.length) throw new Error("Selecione ao menos um clipe para editar.");
    for (const update of this.updates) {
      const { clip, owner } = locate(project, update.clipId);
      if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
      Object.assign(clip, cloneProjectValue(update.patch));
      if (clip.kind === "caption" && update.patch.style?.text && owner.kind === "captions" && "cues" in owner) {
        const cue = owner.cues.find((item) => item.id === clip.metadata?.["captionCueId"]);
        if (cue) {
          cue.text = update.patch.style.text;
          const words = cue.text.split(/\s+/).filter(Boolean);
          const duration = Number(cue.end) - Number(cue.start);
          cue.words = words.map((text, index) => ({ id: `${cue.id}-word-${index + 1}`, text, start: asProjectTime(Number(cue.start) + duration * index / words.length), end: asProjectTime(Number(cue.start) + duration * (index + 1) / words.length) }));
        }
      }
    }
    return project;
  }
  serialize() { return { type: this.type, payload: { updates: this.updates } }; }
}

export class UpsertKeyframeCommand extends SnapshotCommand {
  readonly type = "upsertKeyframe";
  readonly renderImpact = "visual" as const;
  constructor(private readonly clipId: string, private readonly property: AnimatableProperty, private readonly time: number, private readonly value: number, private readonly easing: Easing, private readonly keyframeId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    const duration = Number(clip.projectEnd) - Number(clip.projectStart);
    let animation = clip.animations.find((item) => item.property === this.property);
    if (!animation) { animation = { property: this.property, keyframes: [] }; clip.animations.push(animation); }
    const time = asProjectTime(Math.min(duration, Math.max(0, this.time)));
    const existing = animation.keyframes.find((item) => item.id === this.keyframeId || Math.abs(Number(item.time) - Number(time)) < 1 / 120);
    if (existing) Object.assign(existing, { time, value: this.value, easing: this.easing });
    else animation.keyframes.push({ id: this.keyframeId, time, value: this.value, easing: this.easing });
    animation.keyframes.sort((a, b) => Number(a.time) - Number(b.time));
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, property: this.property, time: this.time, value: this.value, easing: this.easing, keyframeId: this.keyframeId } }; }
}

export class UpdateTransformAtTimeCommand extends SnapshotCommand {
  readonly type = "updateTransformAtTime";
  readonly renderImpact = "visual" as const;
  constructor(private readonly clipId: string, private readonly projectTime: number, private readonly transform: NonNullable<Clip["transform"]>, private readonly easing: Easing, private readonly suffix: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    const localTime = Math.min(Number(clip.projectEnd) - Number(clip.projectStart), Math.max(0, this.projectTime - Number(clip.projectStart)));
    const animated = new Set(clip.animations.map((item) => item.property));
    clip.transform = { ...this.transform };
    for (const property of animated) {
      const animation = clip.animations.find((item) => item.property === property)!;
      const existing = animation.keyframes.find((item) => Math.abs(Number(item.time) - localTime) < 1 / 120);
      const value = this.transform[property];
      if (existing) Object.assign(existing, { value, easing: this.easing });
      else animation.keyframes.push({ id: `${this.clipId}-${property}-${this.suffix}`, time: asProjectTime(localTime), value, easing: this.easing });
      animation.keyframes.sort((a, b) => Number(a.time) - Number(b.time));
    }
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, projectTime: this.projectTime, transform: this.transform, easing: this.easing, suffix: this.suffix } }; }
}

export class MoveKeyframeCommand extends SnapshotCommand {
  readonly type = "moveKeyframe";
  readonly renderImpact = "visual" as const;
  constructor(private readonly clipId: string, private readonly property: AnimatableProperty, private readonly keyframeId: string, private readonly time: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    const animation = clip.animations.find((item) => item.property === this.property);
    const keyframe = animation?.keyframes.find((item) => item.id === this.keyframeId);
    if (!keyframe || !animation) throw new Error("Keyframe não encontrado.");
    keyframe.time = asProjectTime(Math.min(Number(clip.projectEnd) - Number(clip.projectStart), Math.max(0, this.time)));
    animation.keyframes.sort((a, b) => Number(a.time) - Number(b.time));
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, property: this.property, keyframeId: this.keyframeId, time: this.time } }; }
}

export class DeleteKeyframeCommand extends SnapshotCommand {
  readonly type = "deleteKeyframe";
  readonly renderImpact = "visual" as const;
  constructor(private readonly clipId: string, private readonly property: AnimatableProperty, private readonly keyframeId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    const animation = clip.animations.find((item) => item.property === this.property);
    if (!animation) throw new Error("Propriedade animada não encontrada.");
    animation.keyframes = animation.keyframes.filter((item) => item.id !== this.keyframeId);
    clip.animations = clip.animations.filter((item) => item.keyframes.length > 0);
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, property: this.property, keyframeId: this.keyframeId } }; }
}

export class ApplyTransitionCommand extends SnapshotCommand {
  readonly type = "applyTransition";
  readonly renderImpact = "full" as const;
  constructor(private readonly transition: Transition) { super(); }
  protected apply(project: EditorProjectV2) {
    const from = locate(project, this.transition.fromClipId);
    const to = locate(project, this.transition.toClipId);
    if (from.owner.id !== to.owner.id || from.owner.locked) throw new Error("A transição exige dois clipes consecutivos na mesma trilha desbloqueada.");
    const ordered = [...from.owner.clips].sort((a, b) => Number(a.projectStart) - Number(b.projectStart));
    if (ordered.indexOf(to.clip) !== ordered.indexOf(from.clip) + 1) throw new Error("Selecione dois clipes consecutivos para aplicar a transição.");
    const maximum = Math.min(Number(from.clip.projectEnd) - Number(from.clip.projectStart), Number(to.clip.projectEnd) - Number(to.clip.projectStart)) / 2;
    if (this.transition.duration < 0 || this.transition.duration > maximum) throw new Error(`A duração máxima desta transição é ${maximum.toFixed(2)}s.`);
    project.transitions = project.transitions.filter((item) => item.fromClipId !== from.clip.id || item.toClipId !== to.clip.id);
    project.transitions.push(cloneProjectValue(this.transition));
    return project;
  }
  serialize() { return { type: this.type, payload: { transition: this.transition } }; }
}

export class DeleteTransitionCommand extends SnapshotCommand {
  readonly type = "deleteTransition";
  readonly renderImpact = "full" as const;
  constructor(private readonly transitionId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    project.transitions = project.transitions.filter((item) => item.id !== this.transitionId);
    return project;
  }
  serialize() { return { type: this.type, payload: { transitionId: this.transitionId } }; }
}

export class UpdateProjectSettingsCommand extends SnapshotCommand {
  readonly type = "updateProjectSettings";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly patch: Partial<ProjectSettings>) { super(); }
  protected apply(project: EditorProjectV2) {
    project.settings = { ...project.settings, ...cloneProjectValue(this.patch) };
    return project;
  }
  serialize() { return { type: this.type, payload: { patch: this.patch } }; }
}

/** Changes canvas and export dimensions atomically for a supported aspect ratio. */
export class SetProjectAspectRatioCommand extends SnapshotCommand {
  readonly type = "setProjectAspectRatio";
  readonly renderImpact = "full" as const;
  constructor(private readonly aspectRatio: AspectRatio) { super(); }
  protected apply(project: EditorProjectV2) {
    const size = ASPECT_SIZES[this.aspectRatio];
    if (!size) throw new Error("Proporção de vídeo inválida.");
    project.settings = { ...project.settings, aspectRatio: this.aspectRatio, ...size };
    return project;
  }
  serialize() { return { type: this.type, payload: { aspectRatio: this.aspectRatio } }; }
}

export class EditorCommandBus {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  constructor(private project: EditorProjectV2) {}
  getState() { return this.project; }
  execute(command: EditorCommand) {
    this.project = command.execute(this.project);
    if (command.renderImpact !== "none") {
      this.undoStack.push(command);
      this.redoStack = [];
    }
    return this.project;
  }
  undo() {
    const command = this.undoStack.pop();
    if (!command) return this.project;
    this.project = command.undo(this.project);
    this.redoStack.push(command);
    return this.project;
  }
  redo() {
    const command = this.redoStack.pop();
    if (!command) return this.project;
    this.project = command.redo(this.project);
    this.undoStack.push(command);
    return this.project;
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

function cloneProjectValue<T>(value: T): T {
  return structuredClone(value);
}

function upsertAsset(project: EditorProjectV2, asset: MediaAsset) {
  const index = project.assets.findIndex((item) => item.id === asset.id);
  if (index >= 0) project.assets[index] = cloneProjectValue(asset);
  else project.assets.push(cloneProjectValue(asset));
}

function validateStemPair(group: AudioSourceGroup, dialogueAsset: MediaAsset, musicAsset: MediaAsset, dialogueClip: Clip, musicClip: Clip) {
  if (dialogueAsset.id === musicAsset.id || dialogueClip.id === musicClip.id) throw new Error("Voz e música precisam de IDs distintos.");
  if (dialogueAsset.kind !== "audio" || musicAsset.kind !== "audio" || dialogueAsset.stem?.role !== "voice" || musicAsset.stem?.role !== "music") throw new Error("O resultado precisa conter os stems Voz e Música.");
  if (dialogueAsset.stem.sourceAssetId !== group.sourceAssetId || musicAsset.stem.sourceAssetId !== group.sourceAssetId) throw new Error("Os stems não pertencem à fonte selecionada.");
  if (dialogueClip.kind !== "audio" || musicClip.kind !== "audio" || !dialogueClip.audio || !musicClip.audio || dialogueClip.assetId !== dialogueAsset.id || musicClip.assetId !== musicAsset.id) throw new Error("Clipes e assets separados não correspondem.");
  if (dialogueClip.audio.stemRole !== "voice" || musicClip.audio.stemRole !== "music") throw new Error("Os papéis de Voz e Música estão incorretos.");
}

function assertRepresentationAvailable(project: EditorProjectV2, group: AudioSourceGroup, representation: AudioRepresentation) {
  const clipIds = representation === "embedded" ? [group.sourceVideoClipId] : representation === "extracted" ? [group.extractedClipId] : [group.dialogueClipId, group.musicClipId];
  if (clipIds.some((id) => !id) || clipIds.some((id) => !project.tracks.some((owner) => owner.clips.some((clip) => clip.id === id)))) throw new Error(`Representação de áudio indisponível: ${representation}`);
}

function unlinkAudioClips(project: EditorProjectV2, clipIds: Set<string>) {
  project.audioGroups = project.audioGroups.map((group) => {
    const next = cloneProjectValue(group);
    if (next.sourceVideoClipId && clipIds.has(next.sourceVideoClipId)) {
      const replacement = project.tracks.flatMap((owner) => owner.clips).find((clip) => clip.kind === "video" && clip.audioGroupId === next.id && !clipIds.has(clip.id));
      if (replacement) next.sourceVideoClipId = replacement.id; else delete next.sourceVideoClipId;
    }
    if (next.extractedClipId && clipIds.has(next.extractedClipId)) delete next.extractedClipId;
    if (next.dialogueClipId && clipIds.has(next.dialogueClipId)) delete next.dialogueClipId;
    if (next.musicClipId && clipIds.has(next.musicClipId)) delete next.musicClipId;
    return next;
  }).filter((group) => Boolean(group.sourceVideoClipId || group.extractedClipId || group.dialogueClipId || group.musicClipId));
}

function shiftClip(clip: Clip, delta: number) {
  clip.projectStart = asProjectTime(Number(clip.projectStart) + delta);
  clip.projectEnd = asProjectTime(Number(clip.projectEnd) + delta);
}
