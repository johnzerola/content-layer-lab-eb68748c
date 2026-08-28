import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createDataDeletionRequest = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        platforms: z
          .array(z.enum(["facebook", "instagram"]))
          .min(1, "Selecione ao menos uma plataforma.")
          .max(2),
        reason: z.string().trim().max(1000, "O motivo deve ter até 1.000 caracteres.").optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: pending, error: lookupError } = await context.supabase
      .from("data_deletion_requests")
      .select("id, confirmation_code")
      .in("status", ["pending", "processing"])
      .limit(1)
      .maybeSingle();

    if (lookupError) throw new Error("Não foi possível verificar seus pedidos atuais.");
    if (pending) {
      return { created: false, confirmationCode: pending.confirmation_code };
    }

    const { data: created, error } = await context.supabase
      .from("data_deletion_requests")
      .insert({
        user_id: context.userId,
        request_type: "meta_data",
        platforms: [...new Set(data.platforms)],
        reason: data.reason || null,
      })
      .select("confirmation_code")
      .single();

    if (error || !created) throw new Error("Não foi possível registrar o pedido. Tente novamente.");
    return { created: true, confirmationCode: created.confirmation_code };
  });

export const listMyDataDeletionRequests = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("data_deletion_requests")
      .select("id, confirmation_code, platforms, status, requested_at, completed_at")
      .order("requested_at", { ascending: false })
      .limit(10);

    if (error) throw new Error("Não foi possível carregar seus pedidos.");
    return data ?? [];
  });