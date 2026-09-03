/**
 * Guarda o arquivo de vídeo de origem no IndexedDB do navegador para que o
 * projeto continue editável depois de recarregar a página (o documento em si
 * fica no banco; só o arquivo bruto vive aqui, sem upload).
 */
const DB_NAME = "vaiviral-media";
const STORE = "sources";
const MAX_BYTES = 900 * 1024 * 1024; // arquivos gigantes ficam só em memória

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function persistSourceFile(sourceId: string, file: File): Promise<void> {
  if (file.size > MAX_BYTES) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ name: file.name, type: file.type, blob: file }, sourceId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function readSourceFile(sourceId: string): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;
  const value = await new Promise<{ name: string; type: string; blob: Blob } | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(sourceId);
      req.onsuccess = () => resolve((req.result as { name: string; type: string; blob: Blob } | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  if (!value?.blob) return null;
  return new File([value.blob], value.name || "video.mp4", { type: value.type || "video/mp4" });
}

export async function forgetSourceFile(sourceId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(sourceId);
  } catch {
    /* ignora */
  }
  db.close();
}
