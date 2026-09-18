import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ElevenLabsConnectionStatus {
  connected: boolean;
  maskedKey: string;
  accountLabel: string;
  voiceCount: number;
  updatedAt: string | null;
}

export const getElevenLabsConnection = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ElevenLabsConnectionStatus> => {
    const { elevenLabsStorageError } = await import("@/lib/elevenlabs.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_provider_credentials")
      .select("masked_key,account_label,metadata,updated_at")
      .eq("user_id", context.userId)
      .eq("provider", "elevenlabs")
      .maybeSingle();
    if (error) throw elevenLabsStorageError(error);
    const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
    return {
      connected: Boolean(data),
      maskedKey: data?.masked_key ?? "",
      accountLabel: data?.account_label ?? "",
      voiceCount: typeof metadata["voiceCount"] === "number" ? metadata["voiceCount"] : 0,
      updatedAt: data?.updated_at ?? null,
    };
  });

export const connectElevenLabs = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((value: unknown) =>
    z
      .object({
        apiKey: z.string().trim().min(12).max(300),
        accountLabel: z.string().trim().max(80),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const {
      assertElevenLabsEncryptionConfigured,
      fetchElevenLabsVoices,
      saveElevenLabsCredential,
    } = await import("@/lib/elevenlabs.server");
    assertElevenLabsEncryptionConfigured();
    const voices = await fetchElevenLabsVoices(data.apiKey);
    await saveElevenLabsCredential({
      userId: context.userId,
      apiKey: data.apiKey,
      accountLabel: data.accountLabel || "Minha ElevenLabs",
      voiceCount: voices.length,
    });
    return { ok: true as const, voiceCount: voices.length };
  });

export const listElevenLabsVoices = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchElevenLabsVoices, resolveElevenLabsApiKey } =
      await import("@/lib/elevenlabs.server");
    const key = await resolveElevenLabsApiKey(context.userId);
    return fetchElevenLabsVoices(key);
  });

export const disconnectElevenLabs = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { elevenLabsStorageError } = await import("@/lib/elevenlabs.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ai_provider_credentials")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "elevenlabs");
    if (error) return { ok: false as const, error: elevenLabsStorageError(error).message };
    return { ok: true as const };
  });
