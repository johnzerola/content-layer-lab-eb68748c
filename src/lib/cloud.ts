/** Sincronização opcional da biblioteca com a nuvem (login por e-mail ou Google). */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { migrate, registerQuotaFallback, type Template } from "@/lib/template";
import { externalizeDataUrls, isDataUrl, uploadDataUrl } from "@/lib/media-store";

export type CloudUser = { id: string; email: string | null };

export async function currentUser(): Promise<CloudUser | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export function onAuth(cb: (u: CloudUser | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => {
    cb(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Cabeçalhos para RPCs protegidos. A leitura acontece imediatamente antes da
 * chamada para evitar a corrida entre a hidratação da sessão e o middleware.
 */
export async function cloudAuthHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let session = data.session;
  if (session?.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
  }

  const token = session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  return { Authorization: `Bearer ${token}` };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return Boolean(data.session);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  const clean = email.trim();
  if (!clean) throw new Error("Informe seu e-mail.");
  const { error } = await supabase.auth.resetPasswordForEmail(clean, {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw error;
}

/** Envia todos os templates locais para a nuvem (um registro por template). */
export async function pushTemplates(list: Template[]) {
  const user = await currentUser();
  if (!user) throw new Error("Faça login para sincronizar.");
  // imagens coladas dentro do template vão para o armazenamento antes de salvar
  const clean = await Promise.all(list.map((t) => externalizeDataUrls("template", t)));
  const rows = clean.map((t) => ({
    user_id: user.id,
    local_id: t.id,
    name: t.name,
    data: t as unknown as Json,
  }));
  const { data, error } = await supabase
    .from("templates")
    .upsert(rows, { onConflict: "user_id,local_id" })
    .select("id,local_id,data");
  if (error) throw error;

  // guarda também uma versão no histórico da nuvem — como diff sempre que compensar
  await insertTemplateVersions(
    user.id,
    (data ?? []).map((r) => ({ templateId: r.id, data: r.data })),
    new Date().toLocaleString("pt-BR"),
  );
  return rows.length;
}

type VersionRow = {
  id: string;
  template_id: string;
  data: Json;
  format: string;
  base_id: string | null;
  patch: Json | null;
};

/** Reconstrói o snapshot completo de uma versão (diff ou completa). */
export function materializeVersion(row: VersionRow, base?: VersionRow | null): Json {
  if (row.format === "diff" && row.patch && base) {
    return applyJsonPatch(base.data, row.patch as unknown as JsonPatch) as Json;
  }
  return row.data;
}

/**
 * Insere versões no histórico economizando espaço: quando a diferença em
 * relação à última versão COMPLETA do mesmo template for menor que o
 * snapshot inteiro, grava só o diff. A cada 8 versões parciais (ou quando
 * o diff não compensa) grava uma versão completa de novo — assim nunca
 * existe uma corrente de diffs para reconstruir.
 */
async function insertTemplateVersions(
  userId: string,
  items: { templateId: string; data: Json }[],
  label: string,
) {
  if (!items.length) return;
  const { data: latestRows } = await supabase
    .from("template_versions")
    .select("id,template_id,data,format,base_id,patch,created_at")
    .in(
      "template_id",
      items.map((i) => i.templateId),
    )
    .order("created_at", { ascending: false })
    .limit(500);
  const latestByTemplate = new Map<string, VersionRow>();
  for (const row of (latestRows ?? []) as unknown as (VersionRow & { created_at: string })[]) {
    if (!latestByTemplate.has(row.template_id)) latestByTemplate.set(row.template_id, row);
  }

  const rows = items.map((item) => {
    const latest = latestByTemplate.get(item.templateId);
    if (latest?.format === "full") {
      const patch = diffJson(latest.data as never, item.data as never);
      if (patch && jsonSize(patch) < jsonSize(item.data) * 0.7) {
        return {
          user_id: userId,
          template_id: item.templateId,
          label,
          data: {},
          format: "diff",
          base_id: latest.id,
          patch: patch as unknown as Json,
        };
      }
    }
    return {
      user_id: userId,
      template_id: item.templateId,
      label,
      data: item.data,
      format: "full",
      base_id: null,
      patch: null,
    };
  });
  await supabase.from("template_versions").insert(rows);
}

/** Traz os templates da nuvem e mescla com os locais (a nuvem vence por id). */
export async function pullTemplates(local: Template[]): Promise<Template[]> {
  const user = await currentUser();
  if (!user) throw new Error("Faça login para sincronizar.");
  const { data, error } = await supabase
    .from("templates")
    .select("local_id,data")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const remote = (data ?? [])
    .map((r) => r.data as unknown as Template)
    .filter((t) => t && t.video)
    .map(migrate);

  const byId = new Map(local.map((t) => [t.id, t]));
  for (const t of remote) byId.set(t.id, t);
  return [...byId.values()];
}

export type BatchLog = {
  mode: string;
  templateName?: string;
  platforms: string[];
  videos: number;
  ok: number;
  failed: number;
  seconds: number;
};

/** Registra o lote no histórico da conta (silencioso quando não há login). */
export async function logBatch(b: BatchLog) {
  const user = await currentUser();
  if (!user) return;
  await supabase.from("batches").insert({
    user_id: user.id,
    mode: b.mode,
    template_name: b.templateName ?? null,
    platforms: b.platforms,
    videos: b.videos,
    ok: b.ok,
    failed: b.failed,
    seconds: b.seconds,
  });
}

export type BatchRow = {
  id: string;
  mode: string;
  template_name: string | null;
  platforms: string[];
  videos: number;
  ok: number;
  failed: number;
  seconds: number;
  created_at: string;
};

export async function listBatches(): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from("batches")
    .select("id,mode,template_name,platforms,videos,ok,failed,seconds,created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as BatchRow[];
}

/* ------------------------------------------------------------------ */
/* Projetos (filas + ajustes) sincronizados por ferramenta             */
/* ------------------------------------------------------------------ */

export type ProjectItem = {
  name: string;
  sourceUrl?: string | null;
  headline?: string;
  offsetX?: number;
  offsetY?: number;
  clip?: { start: number; end: number } | null;
  score?: number | null;
  regions?: unknown;
  captions?: unknown;
};

export type ProjectSnapshot = {
  templateId?: string | null;
  settings?: Record<string, unknown>;
  items: ProjectItem[];
};

export type ProjectRow = {
  id: string;
  mode: string;
  name: string;
  updated_at: string;

};

/** Salva (ou atualiza) o projeto de uma ferramenta na conta do usuário. */
export async function saveProject(mode: string, name: string, snap: ProjectSnapshot) {
  const user = await currentUser();
  if (!user) throw new Error("Faça login para salvar o projeto na nuvem.");
  const { error } = await supabase.from("projects").upsert(
    {
      user_id: user.id,
      mode,
      name,
      data: snap as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,mode,name" },
  );
  if (error) throw error;
}

/**
 * Lista leve: traz só o cabeçalho de cada projeto. O conteúdo (que pode ter
 * megabytes) só é lido quando o usuário abre o projeto, com `getProjectSnapshot`.
 */
export async function listProjects(mode?: string, limit = 50): Promise<ProjectRow[]> {
  const user = await currentUser();
  if (!user) return [];
  let q = supabase
    .from("projects")
    .select("id,mode,name,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (mode) q = q.eq("mode", mode);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProjectRow[];
}

/** Conteúdo completo de um projeto, carregado só na hora de abrir. */
export async function getProjectSnapshot(id: string): Promise<ProjectSnapshot> {
  const { data, error } = await supabase.from("projects").select("data").eq("id", id).maybeSingle();
  if (error) throw error;
  return ((data?.data as unknown as ProjectSnapshot) ?? { items: [] }) as ProjectSnapshot;
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Histórico de arquivos exportados                                    */
/* ------------------------------------------------------------------ */

export type ExportLog = {
  mode: string;
  fileName: string;
  sourceName?: string;
  platform?: string;
  variant?: string;
  bytes?: number;
  seconds?: number;
  /** miniatura (data URL ou link) do clipe */
  thumbUrl?: string | null;
  /** legenda/headline usada no clipe */
  caption?: string | null;
  /** caminho no storage privado, quando o arquivo foi guardado para publicar */
  storagePath?: string | null;
};

/** Registra os arquivos gerados (silencioso quando não há login). */
export async function logExports(list: ExportLog[]) {
  if (!list.length) return;
  const user = await currentUser();
  if (!user) return;
  // miniaturas vão para o armazenamento; o registro guarda só a referência
  list = await Promise.all(
    list.map(async (e) =>
      isDataUrl(e.thumbUrl) ? { ...e, thumbUrl: await uploadDataUrl("thumbs", e.thumbUrl) } : e,
    ),
  );
  await supabase.from("exports").insert(
    list.map((e) => ({
      user_id: user.id,
      mode: e.mode,
      file_name: e.fileName,
      source_name: e.sourceName ?? null,
      platform: e.platform ?? null,
      variant: e.variant ?? null,
      bytes: Math.round(e.bytes ?? 0),
      seconds: e.seconds ?? 0,
      thumb_url: e.thumbUrl ?? null,
      caption: e.caption ?? null,
      storage_path: e.storagePath ?? null,
    })),
  );
}

export type ExportRow = {
  id: string;
  mode: string;
  file_name: string;
  source_name: string | null;
  platform: string | null;
  variant: string | null;
  bytes: number;
  created_at: string;
  thumb_url: string | null;
  caption: string | null;
  storage_path: string | null;
};

export async function listExports(limit = 30): Promise<ExportRow[]> {
  const { data, error } = await supabase
    .from("exports")
    .select("id,mode,file_name,source_name,platform,variant,bytes,created_at,thumb_url,caption,storage_path")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ExportRow[];
}

/** Sincronização automática dos templates (silenciosa, com debounce). */
let syncTimer: ReturnType<typeof setTimeout> | null = null;
export function autoSyncTemplates(list: Template[], delay = 4000) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void currentUser().then((u) => {
      if (u && list.length) void pushTemplates(list).catch(() => undefined);
    });
  }, delay);
}

/* -------------------------------------------------------------------- */
/* Fallback de quota: quando o localStorage estoura, salva na nuvem      */
/* -------------------------------------------------------------------- */

const PENDING_KEY = "vv.cloud-pending";

/** Envia os templates + histórico direto para a nuvem (usado no estouro de quota). */
export async function saveTemplatesOverflow(
  list: Template[],
  versions?: Record<string, { version: number; savedAt: number; note: string; snapshot: Template }[]>,
) {
  const user = await currentUser();
  if (!user) throw new Error("Sem login: não foi possível salvar na nuvem.");
  if (list.length) await pushTemplates(list);
  if (versions) {
    const { data } = await supabase.from("templates").select("id,local_id");
    const idByLocal = new Map((data ?? []).map((r) => [r.local_id, r.id]));
    const rows = Object.entries(versions).flatMap(([localId, vs]) => {
      const templateId = idByLocal.get(localId);
      if (!templateId) return [];
      return vs.slice(0, 5).map((v) => ({
        user_id: user.id,
        template_id: templateId,
        label: `v${v.version} · ${new Date(v.savedAt).toLocaleString("pt-BR")}${v.note ? ` · ${v.note}` : ""}`,
        data: v.snapshot as unknown as Json,
      }));
    });
    if (rows.length) await supabase.from("template_versions").insert(rows);
  }
}

/** Registra o fallback no módulo de templates (idempotente). */
export function enableCloudQuotaFallback(
  onResult?: (ok: boolean, msg: string, historyOnly?: boolean) => void,
) {
  registerQuotaFallback((list, versions, opts) => {
    const historyOnly = opts?.historyOnly === true;
    void saveTemplatesOverflow(list, versions)
      .then(() => {
        try {
          sessionStorage.removeItem(PENDING_KEY);
        } catch {
          /* ignora */
        }
        onResult?.(
          true,
          historyOnly
            ? "Histórico de versões antigo enviado para a nuvem e limpo do navegador."
            : "Armazenamento local cheio — templates salvos na nuvem.",
          historyOnly,
        );
      })
      .catch((e: unknown) => {
        try {
          sessionStorage.setItem(PENDING_KEY, "1");
        } catch {
          /* ignora */
        }
        onResult?.(
          false,
          historyOnly
            ? "Histórico de versões antigo foi limpo para liberar espaço. Seus templates continuam salvos."
            : e instanceof Error && e.message.includes("login")
              ? "Armazenamento local cheio. Entre na sua conta para salvar os templates na nuvem."
              : "Armazenamento local cheio e a nuvem não respondeu. Tente sincronizar manualmente.",
          historyOnly,
        );
      });
  });
}

/** Existe algo aguardando envio para a nuvem nesta sessão? */
export function hasPendingCloudSave(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}
