import type { EditorProjectV2 } from "./types";

export type AudioSeparationJobStatus =
  | "pending_upload"
  | "uploaded"
  | "queued"
  | "processing"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

export interface AudioSeparationJobRecord {
  schemaVersion: 1;
  id: string;
  projectId: string;
  groupId: string;
  sourceAssetId: string;
  sourceRevision: number;
  sourceFingerprint: string;
  sourceInterval: { in: number; out: number };
  recipe: { id: string; revision: string };
  status: AudioSeparationJobStatus;
  resultRevision: number;
  createdAt: string;
  updatedAt: string;
  outputs?: {
    dialogueStorageKey: string;
    musicStorageKey: string;
    duration: number;
  };
  error?: { code: string; retryable: boolean };
}

export type AudioSeparationJobPatch = Pick<AudioSeparationJobRecord, "outputs" | "error">;

const TRANSITIONS: Record<AudioSeparationJobStatus, ReadonlySet<AudioSeparationJobStatus>> = {
  pending_upload: new Set(["pending_upload", "uploaded", "failed", "cancelling", "cancelled"]),
  uploaded: new Set(["uploaded", "queued", "processing", "downloading", "failed", "cancelling", "cancelled"]),
  queued: new Set(["queued", "processing", "downloading", "failed", "cancelling", "cancelled"]),
  processing: new Set(["processing", "downloading", "completed", "failed", "cancelling", "cancelled"]),
  downloading: new Set(["downloading", "completed", "failed", "cancelling", "cancelled"]),
  cancelling: new Set(["cancelling", "cancelled", "completed", "failed"]),
  completed: new Set(["completed"]),
  failed: new Set(["failed"]),
  cancelled: new Set(["cancelled"]),
};

const STORAGE_PREFIX = "vaiviral.editor-v2.audio-job.";

function validateRecord(record: AudioSeparationJobRecord): void {
  if (!record.id || !record.projectId || !record.groupId || !record.sourceAssetId) throw new Error("Job de áudio incompleto.");
  if (!record.sourceFingerprint || !record.recipe.id || !record.recipe.revision) throw new Error("Job de áudio sem origem ou receita congelada.");
  if (!Number.isInteger(record.sourceRevision) || record.sourceRevision < 0) throw new Error("Revisão de origem inválida.");
  if (!Number.isInteger(record.resultRevision) || record.resultRevision < 0) throw new Error("Revisão de resultado inválida.");
  if (!Number.isFinite(record.sourceInterval.in) || !Number.isFinite(record.sourceInterval.out) || record.sourceInterval.out <= record.sourceInterval.in) throw new Error("Intervalo fonte inválido.");
  if (record.status === "completed") {
    if (!record.outputs?.dialogueStorageKey || !record.outputs.musicStorageKey || !Number.isFinite(record.outputs.duration) || record.outputs.duration <= 0) {
      throw new Error("Resultado completo exige as duas trilhas persistidas.");
    }
  }
}

/** Creates the durable metadata before any upload. Tickets stay only in memory. */
export function createAudioSeparationJob(input: Omit<AudioSeparationJobRecord, "schemaVersion" | "status" | "resultRevision" | "createdAt" | "updatedAt">, now = new Date()): AudioSeparationJobRecord {
  const timestamp = now.toISOString();
  const record: AudioSeparationJobRecord = {
    ...input,
    schemaVersion: 1,
    status: "pending_upload",
    resultRevision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  validateRecord(record);
  return record;
}

export function transitionAudioSeparationJob(
  current: AudioSeparationJobRecord,
  nextStatus: AudioSeparationJobStatus,
  patch: Partial<AudioSeparationJobPatch> = {},
  now = new Date(),
): AudioSeparationJobRecord {
  if (!TRANSITIONS[current.status].has(nextStatus)) throw new Error(`Transição de job inválida: ${current.status} → ${nextStatus}.`);
  const next: AudioSeparationJobRecord = {
    ...current,
    ...patch,
    status: nextStatus,
    resultRevision: nextStatus === "completed" && current.status !== "completed" ? current.resultRevision + 1 : current.resultRevision,
    updatedAt: now.toISOString(),
  };
  validateRecord(next);
  return next;
}

/** A late result is applicable only to the exact source revision that started it. */
export function isAudioSeparationResultCurrent(project: EditorProjectV2, job: AudioSeparationJobRecord): boolean {
  if (job.status !== "completed" || project.id !== job.projectId) return false;
  const group = project.audioGroups.find(item => item.id === job.groupId);
  const source = project.assets.find(item => item.id === job.sourceAssetId);
  return Boolean(
    group
    && source
    && group.sourceAssetId === job.sourceAssetId
    && group.sourceRevision === job.sourceRevision
    && (source.hash ?? `asset:${source.id}`) === job.sourceFingerprint,
  );
}

/** Explicit projection prevents worker tokens and temporary result URLs entering storage. */
export function serializeAudioSeparationJob(record: AudioSeparationJobRecord): string {
  validateRecord(record);
  return JSON.stringify({
    schemaVersion: 1,
    id: record.id,
    projectId: record.projectId,
    groupId: record.groupId,
    sourceAssetId: record.sourceAssetId,
    sourceRevision: record.sourceRevision,
    sourceFingerprint: record.sourceFingerprint,
    sourceInterval: record.sourceInterval,
    recipe: record.recipe,
    status: record.status,
    resultRevision: record.resultRevision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.outputs ? { outputs: record.outputs } : {}),
    ...(record.error ? { error: record.error } : {}),
  } satisfies AudioSeparationJobRecord);
}

export function parseAudioSeparationJob(serialized: string): AudioSeparationJobRecord {
  const record = JSON.parse(serialized) as AudioSeparationJobRecord;
  if (record.schemaVersion !== 1 || !(record.status in TRANSITIONS)) throw new Error("Versão ou estado de job de áudio incompatível.");
  validateRecord(record);
  return record;
}

export class AudioSeparationJobRepository {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">) {}

  save(record: AudioSeparationJobRecord): void {
    this.storage.setItem(`${STORAGE_PREFIX}${record.projectId}.${record.id}`, serializeAudioSeparationJob(record));
  }

  get(projectId: string, jobId: string): AudioSeparationJobRecord | null {
    const value = this.storage.getItem(`${STORAGE_PREFIX}${projectId}.${jobId}`);
    return value ? parseAudioSeparationJob(value) : null;
  }

  list(projectId: string): AudioSeparationJobRecord[] {
    const prefix = `${STORAGE_PREFIX}${projectId}.`;
    const records: AudioSeparationJobRecord[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const value = this.storage.getItem(key);
      if (value) records.push(parseAudioSeparationJob(value));
    }
    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  remove(projectId: string, jobId: string): void {
    this.storage.removeItem(`${STORAGE_PREFIX}${projectId}.${jobId}`);
  }
}
