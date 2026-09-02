/** Persistência da transcrição (Supabase + RLS por usuário). */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  autoScenes,
  emptyTranscript,
  transcriptText,
  type TranscriptDoc,
  type TranscriptScene,
  type TranscriptWord,
} from "./transcript";

const TABLE = "video_transcripts";

type Row = Record<string, unknown>;

function toDoc(row: Row): TranscriptDoc {
  const words = Array.isArray(row["words"]) ? (row["words"] as unknown as TranscriptWord[]) : [];
  const scenes = Array.isArray(row["scenes"]) ? (row["scenes"] as unknown as TranscriptScene[]) : [];
  return {
    id: row["id"] as string,
    videoId: (row["video_id"] as string) ?? "",
    language: (row["language"] as string) ?? "pt-BR",
    duration: Number(row["duration"] ?? 0),
    words,
    scenes: scenes.length ? scenes : autoScenes(words),
    speakers: Array.isArray(row["speakers"]) ? (row["speakers"] as string[]) : [],
  };
}

export async function loadTranscript(videoId: string, language = "pt-BR"): Promise<TranscriptDoc | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("video_id", videoId)
    .eq("language", language)
    .maybeSingle();
  if (error) throw error;
  return data ? toDoc(data as Row) : null;
}

/** Cria ou atualiza a transcrição do vídeo (uma linha por vídeo/idioma). */
export async function saveTranscript(doc: TranscriptDoc, projectId?: string | null): Promise<TranscriptDoc> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sessão expirada.");

  const payload = {
    user_id: userId,
    project_id: projectId ?? null,
    video_id: doc.videoId,
    language: doc.language,
    status: "ready",
    text: transcriptText(doc),
    duration: doc.duration,
    words: doc.words as unknown as Json,
    scenes: doc.scenes as unknown as Json,
    speakers: doc.speakers as unknown as Json,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload as never, { onConflict: "user_id,video_id,language" })
    .select("*")
    .single();
  if (error) throw error;
  return toDoc(data as Row);
}

export async function ensureTranscript(videoId: string, language = "pt-BR"): Promise<TranscriptDoc> {
  return (await loadTranscript(videoId, language)) ?? emptyTranscript(videoId, language);
}

export async function deleteTranscript(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
