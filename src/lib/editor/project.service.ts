/** Persistência do projeto de edição — reutiliza a tabela `projects` existente. */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { createEditorProject, EDITOR_PROJECT_MODE, type EditorProjectDoc } from "./project";

export interface EditorProjectRecord {
  id: string;
  user_id: string;
  name: string;
  doc: EditorProjectDoc;
  updated_at: string;
}

type Row = Record<string, unknown>;

function toRecord(row: Row): EditorProjectRecord {
  const data = (row["data"] ?? {}) as Partial<EditorProjectDoc>;
  const fallback = createEditorProject((data.videoId as string) ?? "", { title: (row["name"] as string) ?? "Projeto" });
  return {
    id: row["id"] as string,
    user_id: row["user_id"] as string,
    name: (row["name"] as string) ?? "Projeto",
    doc: { ...fallback, ...data, composition: data.composition ?? fallback.composition },
    updated_at: (row["updated_at"] as string) ?? new Date().toISOString(),
  };
}

export async function getEditorProject(id: string): Promise<EditorProjectRecord | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toRecord(data as Row) : null;
}

/** Cabeçalho de um projeto salvo, sem o conteúdo pesado da edição. */
export interface EditorProjectSummary {
  id: string;
  name: string;
  updated_at: string;
  videoId: string;
  duration: number | null;
}

/**
 * Listagem leve: lê só nome, data e dois campos do documento. O projeto
 * inteiro (que pode ter megabytes de timeline) só é carregado ao reabrir.
 */
export async function listEditorProjects(limit = 30): Promise<EditorProjectSummary[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,updated_at,videoId:data->>videoId,duration:data->media->>duration")
    .eq("mode", EDITOR_PROJECT_MODE)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      id: r["id"] as string,
      name: (r["name"] as string) ?? "Projeto",
      updated_at: (r["updated_at"] as string) ?? new Date().toISOString(),
      videoId: (r["videoId"] as string) ?? "",
      duration: r["duration"] == null ? null : Number(r["duration"]),
    };
  });
}

/** Renomeia a linha e o título dentro do documento, para o editor não voltar ao nome antigo. */
export async function renameEditorProject(id: string, name: string): Promise<void> {
  const { data, error: readError } = await supabase.from("projects").select("data").eq("id", id).maybeSingle();
  if (readError) throw readError;
  const doc = ((data as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("projects")
    .update({ name, data: { ...doc, title: name } as unknown as Json } as never)
    .eq("id", id);
  if (error) throw error;
}


export async function createEditorProjectRecord(
  doc: EditorProjectDoc,
  requestedId?: string,
): Promise<EditorProjectRecord> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sessão expirada.");
  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...(requestedId ? { id: requestedId } : {}),
      user_id: userId,
      mode: EDITOR_PROJECT_MODE,
      name: doc.title,
      data: doc as unknown as Json,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  return toRecord(data as Row);
}

export async function saveEditorProject(id: string, doc: EditorProjectDoc): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ name: doc.title, data: doc as unknown as Json } as never)
    .eq("id", id);
  if (error) throw error;
}

/** Abre (ou cria) o projeto de edição de um vídeo específico. */
export async function openProjectForVideo(
  projectId: string,
  videoId: string,
  fallback?: Partial<EditorProjectDoc>,
): Promise<EditorProjectRecord> {
  if (projectId !== "novo") {
    const found = await getEditorProject(projectId);
    if (found) return found;
  }
  const doc = {
    ...createEditorProject(videoId, {
      title: fallback?.title ?? `Novo corte ${videoId.slice(0, 8)}`,
    }),
    ...fallback,
  };
  if (projectId === "novo") return createEditorProjectRecord(doc as EditorProjectDoc);

  // React pode iniciar o mesmo efeito duas vezes em desenvolvimento. Usar o ID
  // da URL torna a criação determinística; se outra chamada vencer a corrida,
  // recuperamos o registro já criado em vez de deixar o editor sem documento.
  try {
    return await createEditorProjectRecord(doc as EditorProjectDoc, projectId);
  } catch (error) {
    const createdByConcurrentOpen = await getEditorProject(projectId);
    if (createdByConcurrentOpen) return createdByConcurrentOpen;
    throw error;
  }
}
