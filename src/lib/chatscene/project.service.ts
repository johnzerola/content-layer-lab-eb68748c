/**
 * Persistência dos projetos do ChatScene.
 *
 * Reaproveita a tabela `projects` já existente, com um `mode` próprio para não
 * se misturar com os projetos do editor. O documento inteiro vai em `data`.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  CHATSCENE_PROJECT_MODE,
  normalizeChatSceneProject,
  type ChatSceneProject,
} from "./types";

export interface ChatSceneRecord {
  id: string;
  name: string;
  updatedAt: string;
  doc: ChatSceneProject;
}

interface Row {
  id: string;
  name: string | null;
  updated_at: string | null;
  created_at: string | null;
  data: unknown;
}

function toRecord(row: Row): ChatSceneRecord {
  const doc = normalizeChatSceneProject(row.data as Partial<ChatSceneProject>);
  return {
    id: row.id,
    name: row.name ?? doc.title,
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    doc,
  };
}

export async function listChatSceneProjects(): Promise<ChatSceneRecord[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,data,created_at,updated_at")
    .eq("mode", CHATSCENE_PROJECT_MODE)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => toRecord(row as Row));
}

export async function getChatSceneProject(id: string): Promise<ChatSceneRecord | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,data,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toRecord(data as Row) : null;
}

/** Cria ou atualiza; devolve o id salvo. */
export async function saveChatSceneProject(
  doc: ChatSceneProject,
  recordId?: string | null,
): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Entre na sua conta para salvar a conversa.");

  const payload = {
    user_id: userId,
    mode: CHATSCENE_PROJECT_MODE,
    name: doc.title || "Conversa sem título",
    data: doc as unknown as Record<string, unknown>,
  };

  if (recordId) {
    const { error } = await supabase.from("projects").update(payload).eq("id", recordId);
    if (error) throw error;
    return recordId;
  }

  const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteChatSceneProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}
