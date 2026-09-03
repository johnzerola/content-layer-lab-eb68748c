/**
 * MÍDIA NA NUVEM
 * O arquivo de origem do projeto deixa de viver só no navegador: ele é enviado
 * para o armazenamento privado da conta, então o projeto pode ser reaberto em
 * outro aparelho (ou depois de limpar o navegador) e continuar editável.
 *
 * Só transporte de arquivo — nenhuma regra de negócio do editor muda.
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "editor-sources";
/** acima disso o upload é lento demais para valer a pena — segue só local */
const MAX_UPLOAD = 1_500 * 1024 * 1024;

function safeName(name: string): string {
  return name.replace(/[^a-z0-9.\-_]+/gi, "-").slice(-80) || "video.mp4";
}

/** Envia o vídeo de origem e devolve o caminho salvo (ou null se não deu). */
export async function uploadSourceFile(
  sourceId: string,
  file: File,
  onProgress?: (p: number) => void,
): Promise<string | null> {
  if (file.size > MAX_UPLOAD) return null;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const path = `${userId}/${sourceId}/${safeName(file.name)}`;
  onProgress?.(0.05);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "video/mp4",
  });
  onProgress?.(1);
  if (error) return null;
  return path;
}

/** Baixa o vídeo de origem salvo na conta. */
export async function downloadSourceFile(path: string): Promise<File | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const name = path.split("/").pop() || "video.mp4";
  return new File([data], name, { type: data.type || "video/mp4" });
}

/** Remove o arquivo da nuvem (usado ao trocar a mídia do projeto). */
export async function removeSourceFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
}
