/**
 * Envio de mídia do ChatScene (foto, figurinha, GIF, vídeo curto).
 *
 * O arquivo vai para o armazenamento da conta, para que a conversa salva
 * continue funcionando depois. Se o envio falhar, a mídia ainda funciona na
 * sessão atual por um endereço temporário do navegador.
 */
import { uploadPostMedia } from "@/lib/social";

export interface UploadedMedia {
  url: string;
  /** largura / altura do arquivo, usada no layout da bolha */
  aspect: number | null;
  /** true quando ficou apenas no navegador (a conversa salva perde a mídia) */
  temporary: boolean;
}

async function measure(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("video/")) {
      return await new Promise<number | null>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(v.videoWidth / Math.max(1, v.videoHeight));
        v.onerror = () => resolve(null);
        v.src = url;
      });
    }
    return await new Promise<number | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export async function uploadChatSceneMedia(file: File): Promise<UploadedMedia> {
  const aspect = await measure(file);
  try {
    const { url } = await uploadPostMedia(file, `chatscene-${file.name}`);
    if (url) return { url, aspect, temporary: false };
  } catch {
    /* segue para o endereço temporário */
  }
  return { url: URL.createObjectURL(file), aspect, temporary: true };
}
