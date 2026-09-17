import { describe, expect, it } from "vitest";
import {
  AudioSeparationJobRepository,
  createAudioSeparationJob,
  createEditorProjectV2,
  isAudioSeparationResultCurrent,
  parseAudioSeparationJob,
  serializeAudioSeparationJob,
  transitionAudioSeparationJob,
  type AudioSeparationJobRecord,
} from "@/lib/editor-v2";

function createJob() {
  return createAudioSeparationJob({
    id: "job-1",
    projectId: "project-1",
    groupId: "group-1",
    sourceAssetId: "source-1",
    sourceRevision: 0,
    sourceFingerprint: "sha256:source",
    sourceInterval: { in: 0, out: 5 },
    recipe: { id: "b2", revision: "sha256:model" },
  }, new Date("2026-09-13T00:00:00Z"));
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
  };
}

describe("Editor V2 audio separation jobs", () => {
  it("freezes source, interval and recipe without persisting tickets", () => {
    const job = createJob();
    const serialized = serializeAudioSeparationJob({ ...job, uploadToken: "secret" } as AudioSeparationJobRecord);
    expect(serialized).not.toContain("secret");
    expect(parseAudioSeparationJob(serialized)).toMatchObject({
      sourceFingerprint: "sha256:source",
      sourceInterval: { in: 0, out: 5 },
      recipe: { id: "b2", revision: "sha256:model" },
    });
  });

  it("accepts queued and increments resultRevision exactly once", () => {
    let job = transitionAudioSeparationJob(createJob(), "uploaded");
    job = transitionAudioSeparationJob(job, "queued");
    job = transitionAudioSeparationJob(job, "processing");
    job = transitionAudioSeparationJob(job, "downloading");
    job = transitionAudioSeparationJob(job, "completed", {
      outputs: { dialogueStorageKey: "dialogue.wav", musicStorageKey: "music.wav", duration: 5 },
    });
    expect(job.resultRevision).toBe(1);
    expect(transitionAudioSeparationJob(job, "completed").resultRevision).toBe(1);
    expect(() => transitionAudioSeparationJob(job, "processing")).toThrow("Transição de job inválida");
  });

  it("allows download when a fast job completes between client polls", () => {
    let job = transitionAudioSeparationJob(createJob(), "uploaded");
    job = transitionAudioSeparationJob(job, "downloading");
    job = transitionAudioSeparationJob(job, "completed", {
      outputs: { dialogueStorageKey: "dialogue.wav", musicStorageKey: "music.wav", duration: 5 },
    });
    expect(job).toMatchObject({ status: "completed", resultRevision: 1 });
  });

  it("rejects a late result after the source group revision changed", () => {
    const project = createEditorProjectV2({ id: "project-1", name: "Teste" });
    project.assets.push({
      id: "source-1",
      kind: "video",
      name: "source.mp4",
      mimeType: "video/mp4",
      duration: 5,
      hash: "sha256:source",
      license: { provider: "user", sourceUrl: "local", licenseType: "user-owned", licenseUrl: "local", author: "user", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: true },
    });
    project.audioGroups.push({ id: "group-1", sourceAssetId: "source-1", sourceStreamIndex: 0, activeRepresentation: "embedded", linkedEditing: true, sourceRevision: 0 });
    const completed = transitionAudioSeparationJob(
      transitionAudioSeparationJob(transitionAudioSeparationJob(createJob(), "uploaded"), "processing"),
      "completed",
      { outputs: { dialogueStorageKey: "dialogue.wav", musicStorageKey: "music.wav", duration: 5 } },
    );
    expect(isAudioSeparationResultCurrent(project, completed)).toBe(true);
    project.audioGroups[0]!.sourceRevision += 1;
    expect(isAudioSeparationResultCurrent(project, completed)).toBe(false);
  });

  it("persists terminal metadata separately from the project", () => {
    const storage = memoryStorage();
    const repository = new AudioSeparationJobRepository(storage);
    expect(repository.save(createJob())).toBe(true);
    expect(repository.get("project-1", "job-1")?.status).toBe("pending_upload");
    expect(repository.list("project-1")).toHaveLength(1);
    repository.remove("project-1", "job-1");
    expect(repository.get("project-1", "job-1")).toBeNull();
  });

  it("keeps processing possible when browser storage is full", () => {
    const storage = {
      ...memoryStorage(),
      setItem: () => { throw new DOMException("Espaço insuficiente", "QuotaExceededError"); },
    };
    const repository = new AudioSeparationJobRepository(storage);

    expect(repository.save(createJob())).toBe(false);
  });
});
