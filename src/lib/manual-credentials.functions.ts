/**
 * Credenciais manuais de publicação (YouTube, Instagram, TikTok, Facebook).
 * O token nunca volta ao navegador: só metadados e uma máscara.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MANUAL_PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
export type ManualPlatform = (typeof MANUAL_PLATFORMS)[number];

export interface ManualCredentialSummary {
  id: string;
  platform: ManualPlatform;
  label: string;
  handle: string;
  masked: string;
  hasRefresh: boolean;
  expiresAt: string | null;
  updatedAt: string;
}

const saveSchema = z.object({
  platform: z.enum(MANUAL_PLATFORMS),
  label: z.string().max(80).default(""),
  handle: z.string().max(80).default(""),
  accessToken: z.string().min(8).max(4000),
  refreshToken: z.string().max(4000).optional().default(""),
  expiresAt: z.string().max(40).optional().default(""),
  extra: z.record(z.string(), z.string().max(400)).optional().default({}),
});

function mask(token: string) {
  const tail = token.slice(-4);
  return `••••••${tail}`;
}

export const listManualCredentials = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManualCredentialSummary[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("manual_social_credentials")
      .select("id,platform,label,handle,refresh_token_ciphertext,expires_at,updated_at,extra")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar as credenciais salvas.");
    return (data ?? []).map((row) => ({
      id: row.id as string,
      platform: row.platform as ManualPlatform,
      label: (row.label as string) ?? "",
      handle: (row.handle as string) ?? "",
      masked: ((row.extra as Record<string, string> | null)?.["masked"] as string) ?? "••••••",
      hasRefresh: Boolean(row.refresh_token_ciphertext),
      expiresAt: (row.expires_at as string | null) ?? null,
      updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
    }));
  });

export const saveManualCredential = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { encryptSocialToken } = await import("@/lib/social-credentials.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let accessCipher: string;
    let refreshCipher: string | null = null;
    try {
      accessCipher = encryptSocialToken(data.accessToken);
      if (data.refreshToken) refreshCipher = encryptSocialToken(data.refreshToken);
    } catch {
      return { ok: false as const, error: "A criptografia de credenciais ainda não está configurada no servidor." };
    }

    const expires = data.expiresAt ? new Date(data.expiresAt) : null;
    const { error } = await supabaseAdmin.from("manual_social_credentials").upsert(
      {
        user_id: context.userId,
        platform: data.platform,
        label: data.label,
        handle: data.handle.replace(/^@/, ""),
        access_token_ciphertext: accessCipher,
        refresh_token_ciphertext: refreshCipher,
        extra: { ...data.extra, masked: mask(data.accessToken) },
        expires_at: expires && Number.isFinite(expires.getTime()) ? expires.toISOString() : null,
      } as never,
      { onConflict: "user_id,platform,handle" },
    );
    if (error) return { ok: false as const, error: "Não foi possível salvar a credencial." };
    return { ok: true as const };
  });

export const deleteManualCredential = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("manual_social_credentials")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false as const, error: "Não foi possível remover a credencial." };
    return { ok: true as const };
  });
