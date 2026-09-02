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

export async function listEditorProjects(limit = 60): Promise<EditorProjectRecord[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("mode", EDITOR_PROJECT_MODE)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => toRecord(row as Row));
}

export async function createEditorProjectRecord(doc: EditorProjectDoc): Promise<EditorProjectRecord> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sessão expirada.");
  const { data, error } = await supabase
    .from("projects")
    .insert({
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
  const doc = { ...createEditorProject(videoId, { title: fallback?.title }), ...fallback };
  return createEditorProjectRecord(doc as EditorProjectDoc);
}
