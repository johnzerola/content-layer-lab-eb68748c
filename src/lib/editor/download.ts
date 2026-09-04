/**
 * DOWNLOAD DO VÍDEO EXPORTADO
 * No celular o link `download` costuma abrir o vídeo em uma aba em vez de
 * salvar. Quando o aparelho suporta compartilhamento de arquivos, usamos a
 * folha nativa ("Salvar em Arquivos" / "Salvar vídeo"); no computador segue o
 * download normal. Só apresentação — não muda o arquivo gerado.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

/** Salva/compartilha o MP4 já renderizado. Devolve como o arquivo foi entregue. */
export async function saveRenderedVideo(file: File): Promise<"share" | "download"> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  if (isMobileDevice() && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "share";
    } catch {
      /* usuário cancelou ou não deu — cai no download normal */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
  return "download";
}
