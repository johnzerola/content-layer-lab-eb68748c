import { asProjectTime, type Clip, type EditorProjectV2, type RenderImpact, type SelectionState } from "./types";
import { cloneProject, normalizeProject } from "./project";

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
    changed.revisions.document += 1;
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

export class MoveClipCommand extends SnapshotCommand {
  readonly type = "moveClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly clipId: string, private readonly targetTrackId: string, private readonly projectStart: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const found = locate(project, this.clipId);
    if (found.owner.locked) throw new Error(`Trilha bloqueada: ${found.owner.name}`);
    const destination = track(project, this.targetTrackId);
    const [clip] = found.owner.clips.splice(found.index, 1);
    const duration = Number(clip!.projectEnd) - Number(clip!.projectStart);
    clip!.trackId = destination.id;
    clip!.projectStart = asProjectTime(this.projectStart);
    clip!.projectEnd = asProjectTime(this.projectStart + duration);
    destination.clips.push(clip!);
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, targetTrackId: this.targetTrackId, projectStart: this.projectStart } }; }
}

export class TrimClipCommand extends SnapshotCommand {
  readonly type = "trimClip";
  readonly renderImpact = "timeline" as const;
  constructor(private readonly clipId: string, private readonly projectStart: number, private readonly projectEnd: number) { super(); }
  protected apply(project: EditorProjectV2) {
    const { clip, owner } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    const start = Math.max(0, this.projectStart);
    const end = Math.max(start + 0.04, this.projectEnd);
    const sourceStartDelta = Math.max(0, start - Number(clip.projectStart)) * clip.playbackRate;
    const sourceEndDelta = Math.max(0, Number(clip.projectEnd) - end) * clip.playbackRate;
    clip.projectStart = asProjectTime(start);
    clip.projectEnd = asProjectTime(end);
    clip.sourceIn = Math.min(clip.sourceOut, clip.sourceIn + sourceStartDelta);
    clip.sourceOut = Math.max(clip.sourceIn, clip.sourceOut - sourceEndDelta);
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
    const sourceAt = clip.sourceIn + (this.at - Number(clip.projectStart)) * clip.playbackRate;
    const right: Clip = {
      ...cloneProjectValue(clip),
      id: this.rightClipId,
      name: `${clip.name} · 2`,
      projectStart: asProjectTime(this.at),
      sourceIn: sourceAt,
    };
    clip.projectEnd = asProjectTime(this.at);
    clip.sourceOut = sourceAt;
    owner.clips.splice(index + 1, 0, right);
    project.selection = { itemIds: [right.id], primaryId: right.id, surface: "timeline" };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId, at: this.at, rightClipId: this.rightClipId } }; }
}

export class DeleteClipCommand extends SnapshotCommand {
  readonly type = "deleteClip";
  readonly renderImpact = "full" as const;
  constructor(private readonly clipId: string) { super(); }
  protected apply(project: EditorProjectV2) {
    const { owner, index } = locate(project, this.clipId);
    if (owner.locked) throw new Error(`Trilha bloqueada: ${owner.name}`);
    owner.clips.splice(index, 1);
    project.transitions = project.transitions.filter((item) => item.fromClipId !== this.clipId && item.toClipId !== this.clipId);
    project.selection = { itemIds: [], primaryId: null, surface: null };
    return project;
  }
  serialize() { return { type: this.type, payload: { clipId: this.clipId } }; }
}

export class EditorCommandBus {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  constructor(private project: EditorProjectV2) {}
  getState() { return this.project; }
  execute(command: EditorCommand) {
    this.project = command.execute(this.project);
    this.undoStack.push(command);
    this.redoStack = [];
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

