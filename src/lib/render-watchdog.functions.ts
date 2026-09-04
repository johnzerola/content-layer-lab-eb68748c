import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STALE_MS = 10 * 60 * 1000;

/**
 * Marca como falha os itens da nuvem sem sinal de vida há mais de 10 minutos.
 * Evita lote eternamente "processando" quando o worker cai ou reinicia.
 */
export const sweepStaleRenderItems = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();

    const { data, error } = await supabase
      .from("render_items")
      .select("id, batch_id, heartbeat_at, created_at, status")
      .in("status", ["processing", "uploading"]);
    if (error) return { swept: 0, error: error.message };

    const rows = (data ?? []) as {
      id: string;
      batch_id: string;
      heartbeat_at: string | null;
      created_at: string;
      status: string;
    }[];
    const stale = rows.filter((r) => (r.heartbeat_at ?? r.created_at) < cutoff);
    if (!stale.length) return { swept: 0 };

    await supabase
      .from("render_items")
      .update({
        status: "failed",
        error: "Sem sinal do motor de render por mais de 10 minutos.",
      } as never)
      .in(
        "id",
        stale.map((r) => r.id),
      );

    return { swept: stale.length };
  });
