/** Persistência dos templates de vídeo e das instâncias (Supabase + RLS). */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { applyTemplateToVideo, deepClone } from "./bindings";
import { createTemplateDoc } from "./factory";
import {
  ASPECT_SIZES,
  type AspectRatio,
  type BindableVideoSource,
  type TemplateDoc,
  type TemplateInstanceRecord,
  type TemplateStatus,
  type TemplateVisibility,
  type VideoTemplateRecord,
} from "./types";

const TABLE = "video_templates";
const INSTANCES = "template_instances";

type Row = Record<string, unknown>;

function toRecord(row: Row): VideoTemplateRecord {
  const data = (row["template_data"] ?? {}) as Partial<TemplateDoc>;
  const aspect = (row["aspect_ratio"] as AspectRatio) ?? "9:16";
  const doc: TemplateDoc = {
    ...createTemplateDoc((row["name"] as string) ?? "Template", aspect),
    ...data,
    layers: Array.isArray(data.layers) ? data.layers : [],
  };
  return {
    id: row["id"] as string,
    user_id: row["user_id"] as string,
    workspace_id: (row["workspace_id"] as string | null) ?? null,
    name: (row["name"] as string) ?? "Template",
    description: (row["description"] as string | null) ?? null,
    thumbnail_url: (row["thumbnail_url"] as string | null) ?? null,
    aspect_ratio: aspect,
    canvas_width: (row["canvas_width"] as number) ?? ASPECT_SIZES[aspect].width,
    canvas_height: (row["canvas_height"] as number) ?? ASPECT_SIZES[aspect].height,
    template_data: doc,
    template_version: (row["template_version"] as number) ?? 1,
    visibility: (row["visibility"] as TemplateVisibility) ?? "private",
    status: (row["status"] as TemplateStatus) ?? "draft",
    category: (row["category"] as string | null) ?? null,
    tags: (row["tags"] as string[] | null) ?? [],
    usage_count: (row["usage_count"] as number) ?? 0,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Entre na sua conta para gerenciar templates.");
  return id;
}

export async function listMyTemplates(): Promise<VideoTemplateRecord[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRecord);
}

export async function listPublicTemplates(): Promise<VideoTemplateRecord[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("visibility", "public")
    .eq("status", "published")
    .order("usage_count", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []).map(toRecord);
}

export async function getTemplate(id: string): Promise<VideoTemplateRecord | null> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toRecord(data as Row) : null;
}

export async function createTemplate(input: {
  name?: string;
  aspectRatio?: AspectRatio;
  category?: string | null;
  doc?: TemplateDoc;
}): Promise<VideoTemplateRecord> {
  const user_id = await requireUserId();
  const aspect = input.aspectRatio ?? input.doc?.aspectRatio ?? "9:16";
  const doc = input.doc ?? createTemplateDoc(input.name ?? "Novo template", aspect);
  const size = ASPECT_SIZES[aspect];
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id,
      name: doc.name,
      aspect_ratio: aspect,
      canvas_width: size.width,
      canvas_height: size.height,
      template_data: doc as unknown as Json,
      category: input.category ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toRecord(data as Row);
}

export async function updateTemplate(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    doc?: TemplateDoc;
    thumbnail_url?: string | null;
    visibility?: TemplateVisibility;
    status?: TemplateStatus;
    category?: string | null;
    tags?: string[];
    bumpVersion?: boolean;
  },
): Promise<VideoTemplateRecord> {
  const update: Row = {};
  if (patch.name !== undefined) update["name"] = patch.name;
  if (patch.description !== undefined) update["description"] = patch.description;
  if (patch.thumbnail_url !== undefined) update["thumbnail_url"] = patch.thumbnail_url;
  if (patch.visibility !== undefined) update["visibility"] = patch.visibility;
  if (patch.status !== undefined) update["status"] = patch.status;
  if (patch.category !== undefined) update["category"] = patch.category;
  if (patch.tags !== undefined) update["tags"] = patch.tags;
  if (patch.doc) {
    update["template_data"] = patch.doc as unknown as Json;
    update["aspect_ratio"] = patch.doc.aspectRatio;
    update["canvas_width"] = patch.doc.canvas.width;
    update["canvas_height"] = patch.doc.canvas.height;
    if (patch.name === undefined) update["name"] = patch.doc.name;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update(update as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  const rec = toRecord(data as Row);
  if (patch.bumpVersion) {
    const { data: bumped } = await supabase
      .from(TABLE)
      .update({ template_version: rec.template_version + 1 })
      .eq("id", id)
      .select("*")
      .single();
    if (bumped) return toRecord(bumped as Row);
  }
  return rec;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Duplica um template (inclusive público) para a conta do usuário atual. */
export async function duplicateTemplate(source: VideoTemplateRecord, name?: string): Promise<VideoTemplateRecord> {
  const doc = deepClone(source.template_data);
  doc.name = name ?? `${source.name} (cópia)`;
  const created = await createTemplate({ doc, category: source.category ?? null });
  if (source.user_id !== created.user_id) {
    await supabase
      .from(TABLE)
      .update({ usage_count: source.usage_count + 1 })
      .eq("id", source.id);
  }
  return created;
}

/* ------------------------------------------------------------- Instâncias */

function toInstance(row: Row): TemplateInstanceRecord {
  return {
    id: row["id"] as string,
    template_id: (row["template_id"] as string | null) ?? null,
    template_version: (row["template_version"] as number | null) ?? null,
    user_id: row["user_id"] as string,
    video_id: (row["video_id"] as string | null) ?? null,
    cut_id: (row["cut_id"] as string | null) ?? null,
    project_id: (row["project_id"] as string | null) ?? null,
    label: (row["label"] as string | null) ?? null,
    instance_data: (row["instance_data"] ?? {}) as TemplateDoc,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

export async function createInstance(
  template: VideoTemplateRecord,
  source: BindableVideoSource,
): Promise<TemplateInstanceRecord> {
  const user_id = await requireUserId();
  const instance_data = applyTemplateToVideo(template.template_data, source);
  const { data, error } = await supabase
    .from(INSTANCES)
    .insert({
      template_id: template.id,
      template_version: template.template_version,
      user_id,
      video_id: source.id,
      cut_id: source.id,
      label: source.title ?? null,
      instance_data: instance_data as unknown as Json,
    })
    .select("*")
    .single();
  if (error) throw error;
  await supabase
    .from(TABLE)
    .update({ usage_count: template.usage_count + 1 })
    .eq("id", template.id);
  return toInstance(data as Row);
}

/** Aplicação em lote: uma instância por corte, com progresso. */
export async function applyTemplateBatch(
  template: VideoTemplateRecord,
  sources: BindableVideoSource[],
  onProgress?: (done: number, total: number) => void,
): Promise<TemplateInstanceRecord[]> {
  const out: TemplateInstanceRecord[] = [];
  for (let i = 0; i < sources.length; i++) {
    out.push(await createInstance(template, sources[i]!));
    onProgress?.(i + 1, sources.length);
  }
  return out;
}

export async function listInstances(templateId?: string): Promise<TemplateInstanceRecord[]> {
  let q = supabase.from(INSTANCES).select("*").order("created_at", { ascending: false }).limit(100);
  if (templateId) q = q.eq("template_id", templateId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => toInstance(r as Row));
}

export async function updateInstance(id: string, doc: TemplateDoc): Promise<void> {
  const { error } = await supabase
    .from(INSTANCES)
    .update({ instance_data: doc as unknown as Json })
    .eq("id", id);
  if (error) throw error;
}

/** Vincula a instância ao projeto de edição criado para ela. */
export async function attachInstanceProject(id: string, projectId: string): Promise<void> {
  const { error } = await supabase.from(INSTANCES).update({ project_id: projectId }).eq("id", id);
  if (error) throw error;
}


/** Remove o vínculo com o template, mantendo as camadas como projeto normal. */
export async function detachInstance(id: string): Promise<void> {
  const { error } = await supabase.from(INSTANCES).update({ template_id: null }).eq("id", id);
  if (error) throw error;
}

export async function deleteInstance(id: string): Promise<void> {
  const { error } = await supabase.from(INSTANCES).delete().eq("id", id);
  if (error) throw error;
}

/* -------------------------------------------------------------- Miniatura */

/** Sobe a miniatura do template para o bucket privado e devolve o caminho. */
export async function uploadTemplateThumbnail(templateId: string, blob: Blob): Promise<string | null> {
  const user_id = await requireUserId();
  const path = `${user_id}/template-thumbnails/${templateId}.png`;
  const { error } = await supabase.storage.from("posts").upload(path, blob, {
    upsert: true,
    contentType: "image/png",
  });
  if (error) return null;
  return path;
}

export async function signedThumbnailUrl(path: string, expires = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from("posts").createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}
