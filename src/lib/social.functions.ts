import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  executeInstagramAccountLink,
  linkingServerRuntimeReady,
} from "@/lib/social-linking.server";
import { persistValidatedMetaAccount } from "@/lib/social-persistence.server";

const addAccountInputSchema = z.object({
  username: z.string().max(64).optional().default(""),
});

export function parseAddAccountInput(data: unknown): { username: string } {
  const parsed = addAccountInputSchema.safeParse(data);
  return parsed.success ? parsed.data : { username: "" };
}

export const addAccount = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator(parseAddAccountInput)
  .handler(async ({ data, context }) => {
    if (!linkingServerRuntimeReady()) {
      return {
        ok: false as const,
        code: "SERVER_CONFIG_MISSING" as const,
        error: "A integração segura do servidor não está configurada.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return executeInstagramAccountLink({
      userId: context.userId,
      requestedHandle: data.username,
      persist: (input) =>
        persistValidatedMetaAccount(
          (name, args) => supabaseAdmin.rpc(name, args),
          input,
        ),
    });
  });

const removeAccountInputSchema = z.object({ accountId: z.string().uuid() });

/** Remove conta + conexão + credencial com service role (a tabela de conexões é server-only). */
export const disconnectSocialAccount = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => removeAccountInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: account, error: lookupError } = await supabaseAdmin
      .from("social_accounts")
      .select("id,user_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (lookupError) return { ok: false as const, error: "Não foi possível localizar a conta." };
    if (!account || account.user_id !== context.userId) {
      return { ok: false as const, error: "Conta não encontrada." };
    }

    const { data: connections } = await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("social_account_id", account.id);
    const connectionIds = (connections ?? []).map((row) => row.id);
    if (connectionIds.length) {
      await supabaseAdmin
        .from("social_connection_credentials")
        .delete()
        .in("connection_id", connectionIds);
      const { error: connectionError } = await supabaseAdmin
        .from("social_connections")
        .delete()
        .in("id", connectionIds);
      if (connectionError) {
        return { ok: false as const, error: "Não foi possível remover a conexão da conta." };
      }
    }

    const { error: accountError } = await supabaseAdmin
      .from("social_accounts")
      .delete()
      .eq("id", account.id)
      .eq("user_id", context.userId);
    if (accountError) {
      return { ok: false as const, error: "Não foi possível remover a conta conectada." };
    }
    return { ok: true as const };
  });
