import { describe, expect, it } from "vitest";
import {
  createEditorProjectV2,
  editorMediaStorageKey,
  editorMediaStoragePath,
  persistEditorProject,
  readEditorProject,
  serializeEditorProject,
  validateRelinkFile,
  type MediaAsset,
} from "@/lib/editor-v2";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function localVideo(): MediaAsset {
  return {
    id: "asset-video",
    kind: "video",
    name: "entrevista.mp4",
    mimeType: "video/mp4",
    sourceUrl: "blob:runtime-video",
    proxyUrl: "blob:runtime-proxy",
    thumbnailUrl: "blob:runtime-poster",
    storagePath: editorMediaStoragePath("editor-v2-local", "asset-video"),
    hash: "entrevista.mp4:1234:99",
    license: { provider: "Arquivo local", sourceUrl: "local-session://asset-video", licenseType: "Fornecida pelo usuário", licenseUrl: "internal://editor-v2/local-media", author: "Usuário", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false },
  };
}

describe("persistência local do Editor V2", () => {
  it("salva o documento sem URLs efêmeras e restaura o contrato normalizado", () => {
    const storage = memoryStorage();
    const project = createEditorProjectV2({ id: "editor-v2-local" });
    project.revisions.document = 7;
    project.assets.push(localVideo());
    expect(serializeEditorProject(project)).not.toContain("blob:");
    expect(persistEditorProject(project, storage)).toBe(true);
    const restored = readEditorProject(project.id, storage);
    expect(restored).toMatchObject({ id: project.id, revisions: { document: 7, saved: 7 }, audioGroups: [] });
    expect(restored?.assets[0]).toMatchObject({ id: "asset-video", storagePath: "indexeddb://editor-v2-media:editor-v2-local:asset-video" });
    expect(restored?.assets[0]?.sourceUrl).toBeUndefined();
  });

  it("usa chave isolada por projeto e asset", () => {
    expect(editorMediaStorageKey("project-a", "asset-a")).toBe("editor-v2-media:project-a:asset-a");
    expect(editorMediaStorageKey("project-b", "asset-a")).not.toBe(editorMediaStorageKey("project-a", "asset-a"));
  });

  it("recusa relink de tipo ou tamanho incompatível", () => {
    const asset = localVideo();
    expect(validateRelinkFile(asset, new File([new Uint8Array(1234)], "renomeado.mp4", { type: "video/mp4" }))).toEqual({ ok: true });
    expect(validateRelinkFile(asset, new File([new Uint8Array(12)], "curto.mp4", { type: "video/mp4" }))).toMatchObject({ ok: false });
    expect(validateRelinkFile(asset, new File([new Uint8Array(1234)], "audio.wav", { type: "audio/wav" }))).toMatchObject({ ok: false });
  });
});
