import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Define a conta/Página ativa (padrão) de uma rede para o usuário autenticado. */
export const setPrimaryAccount = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => z.object({ accountId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: account, error: readError } = await supabase
      .from("social_accounts")
      .select("id,platform,status,provider")
      .eq("id", data.accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (readError || !account) {
      return { ok: false as const, error: "Conta não encontrada." };
    }
    const connected = account.status === "conectado" || account.status === "connected";
    if (!connected || account.provider === "pending") {
      return { ok: false as const, error: "Conecte a conta pelo provedor antes de defini-la como ativa." };
    }

    // Índice único parcial exige limpar a anterior antes de marcar a nova.
    const { error: clearError } = await supabase
      .from("social_accounts")
      .update({ is_primary: false })
      .eq("user_id", userId)
      .eq("platform", account.platform)
      .eq("is_primary", true);
    if (clearError) return { ok: false as const, error: "Não foi possível atualizar a conta ativa." };

    const { error: setError } = await supabase
      .from("social_accounts")
      .update({ is_primary: true })
      .eq("id", account.id)
      .eq("user_id", userId);
    if (setError) return { ok: false as const, error: "Não foi possível definir a conta ativa." };

    return { ok: true as const, accountId: account.id, platform: account.platform };
  });
