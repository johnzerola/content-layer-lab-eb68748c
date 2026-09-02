/** Biblioteca real de cortes: persistência no banco (Supabase + RLS). */
import { supabase } from "@/integrations/supabase/client";
import type { CutRecord } from "./cuts";

const TABLE = "video_cuts";

export interface LibraryCut extends CutRecord {
  rowId: string;
  caption: string | null;
  thumbnail: string | null;
}

type Row = Record<string, unknown>;

function toLibraryCut(row: Row): LibraryCut {
  return {
    rowId: row["id"] as string,
    id: (row["cut_key"] as string) ?? (row["id"] as string),
    sourceId: (row["source_id"] as string) ?? "",
    sourceName: (row["source_name"] as string) ?? "",
    title: (row["title"] as string) ?? "Corte",
    start: Number(row["start_sec"] ?? 0),
    end: Number(row["end_sec"] ?? 0),
    score: Number(row["score"] ?? 0),
    text: ((row["caption"] as string | null) ?? undefined) || undefined,
    caption: (row["caption"] as string | null) ?? null,
    thumbnail: (row["thumbnail_url"] as string | null) ?? null,
    createdAt: (row["created_at"] as string) ?? new Date().toISOString(),
  };
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Entre na sua conta para usar a biblioteca de cortes.");
  return id;
}

export async function listLibraryCuts(): Promise<LibraryCut[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((r) => toLibraryCut(r as Row));
}

/** Publica (ou atualiza) cortes na biblioteca do usuário. */
export async function publishCuts(
  cuts: CutRecord[],
  thumbs: Record<string, string | null> = {},
): Promise<LibraryCut[]> {
  if (!cuts.length) return [];
  const user_id = await requireUserId();
  const rows = cuts.map((c) => ({
    user_id,
    cut_key: c.id,
    source_id: c.sourceId,
    source_name: c.sourceName,
    title: c.title,
    caption: c.text ?? null,
    start_sec: c.start,
    end_sec: c.end,
    score: c.score,
    thumbnail_url: thumbs[c.id] ?? null,
  }));
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows as never, { onConflict: "user_id,cut_key" })
    .select("*");
  if (error) throw error;
  return (data ?? []).map((r) => toLibraryCut(r as Row));
}

export async function updateLibraryCut(
  rowId: string,
  patch: { title?: string; caption?: string | null; thumbnail?: string | null },
): Promise<void> {
  const update: Row = {};
  if (patch.title !== undefined) update["title"] = patch.title;
  if (patch.caption !== undefined) update["caption"] = patch.caption;
  if (patch.thumbnail !== undefined) update["thumbnail_url"] = patch.thumbnail;
  if (!Object.keys(update).length) return;
  const { error } = await supabase.from(TABLE).update(update as never).eq("id", rowId);
  if (error) throw error;
}

export async function deleteLibraryCut(rowId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", rowId);
  if (error) throw error;
}
