import { downloadZip } from "client-zip";

export interface OutFile {
  name: string;
  blob: Blob;
}

/** Progresso de download/salvamento em linguagem simples. */
export interface SaveProgress {
  /** bytes já gravados */
  bytes: number;
  /** total estimado de bytes (0 = desconhecido) */
  total: number;
  /** arquivos já concluídos (quando aplicável) */
  files: number;
  /** para onde está indo: disco em streaming ou memória */
  target: "disco" | "memória";
}

type SavePicker = (opts?: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

type DirPicker = () => Promise<FileSystemDirectoryHandle>;

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function totalBytes(files: OutFile[]) {
  return files.reduce((n, f) => n + f.blob.size, 0);
}

export function fsAccessSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function saveFilePickerSupported() {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/** Formata bytes para exibir na interface (ex.: "1,2 GB"). */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} ${units[i]}`;
}

/**
 * Baixa vários arquivos como ZIP.
 *
 * O pacote é montado em pedaços (com progresso real em bytes) e entregue como
 * download direto — sem diálogo de "salvar como", que em iframes/abas sem
 * ativação de usuário podia travar silenciosamente e nada baixar.
 */
export async function downloadAsZip(
  files: OutFile[],
  zipName = "vaiviral.zip",
  onProgress?: (p: SaveProgress) => void,
) {
  if (!files.length) return;
  // um único arquivo não precisa de ZIP (evita cópia de centenas de MB na memória)
  if (files.length === 1) {
    triggerDownload(files[0]!.blob, files[0]!.name);
    return;
  }

  const total = totalBytes(files);
  const entries = files.map((f) => ({ name: f.name, input: f.blob, lastModified: new Date() }));

  const stream = downloadZip(entries).body;
  if (!stream) {
    triggerDownload(await downloadZip(entries).blob(), zipName);
    return;
  }
  const reader = stream.getReader();
  const chunks: BlobPart[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytes += value.byteLength;
    onProgress?.({ bytes, total, files: 0, target: "memória" });
  }
  triggerDownload(new Blob(chunks, { type: "application/zip" }), zipName);
}

/** Pede uma pasta ao usuário (para salvar agora ou automaticamente durante o lote). */
export async function pickFolder() {
  const picker = (window as unknown as { showDirectoryPicker: DirPicker }).showDirectoryPicker;
  return picker();
}

/** Grava um arquivo numa pasta já escolhida, sem sobrescrever nomes repetidos. */
export async function writeToFolder(dir: FileSystemDirectoryHandle, file: OutFile) {
  let name = file.name;
  // se já existe um arquivo com esse nome, adiciona (2), (3)…
  for (let i = 2; i < 100; i++) {
    const exists = await dir
      .getFileHandle(name)
      .then(() => true)
      .catch(() => false);
    if (!exists) break;
    const dot = file.name.lastIndexOf(".");
    name =
      dot > 0 ? `${file.name.slice(0, dot)} (${i})${file.name.slice(dot)}` : `${file.name} (${i})`;
  }
  const handle = await dir.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  await w.write(file.blob);
  await w.close();
  return name;
}

/** Salva direto numa pasta escolhida pelo usuário (File System Access API). */
export async function saveToFolder(
  files: OutFile[],
  onProgress?: (p: SaveProgress) => void,
  dirHandle?: FileSystemDirectoryHandle,
) {
  const dir = dirHandle ?? (await pickFolder());
  const total = totalBytes(files);
  let bytes = 0;
  let i = 0;
  for (const f of files) {
    await writeToFolder(dir, f);
    bytes += f.blob.size;
    onProgress?.({ bytes, total, files: ++i, target: "disco" });
  }
  return i;
}
