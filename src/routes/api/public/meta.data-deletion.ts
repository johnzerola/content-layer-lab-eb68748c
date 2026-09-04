import { createFileRoute } from "@tanstack/react-router";
import {
  purgeMetaAccount,
  readSignedRequest,
  verifyMetaSignedRequest,
} from "@/lib/meta-signed-request.server";

function siteUrl() {
  return (process.env["PUBLIC_SITE_URL"]?.trim() || "https://content-layer-lab.lovable.app").replace(
    /\/+$/,
    "",
  );
}

/**
 * Callback de exclusão de dados exigido pela Meta. Valida o signed_request,
 * apaga as conexões/tokens daquela identidade e responde no formato pedido:
 * { url, confirmation_code }.
 */
export const Route = createFileRoute("/api/public/meta/data-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signed = await readSignedRequest(request);
        const payload = await verifyMetaSignedRequest(signed);
        if (!payload?.user_id) {
          return new Response("invalid signed_request", { status: 400 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: connection } = await supabaseAdmin
            .from("social_connections")
            .select("user_id")
            .eq("provider", "meta")
            .eq("provider_account_id", payload.user_id)
            .limit(1)
            .maybeSingle();

          await purgeMetaAccount(payload.user_id);
          const fallbackCode = `META-${Date.now().toString(36).toUpperCase()}`;
          let confirmationCode = fallbackCode;
          if (connection?.user_id) {
            const { data: registered, error: registrationError } = await supabaseAdmin
              .from("data_deletion_requests")
              .insert({
                user_id: connection.user_id,
                request_type: "meta_data",
                platforms: ["facebook", "instagram"],
                status: "completed",
                completed_at: new Date().toISOString(),
                reason: "Solicitação automática recebida e validada pela Meta.",
              })
              .select("confirmation_code")
              .single();
            if (registrationError) {
              console.error("[meta] dados apagados, mas não foi possível registrar o protocolo", registrationError);
            } else if (registered) {
              confirmationCode = registered.confirmation_code;
            }
          }

          return Response.json({
            url: `${siteUrl()}/exclusao-de-dados?code=${encodeURIComponent(confirmationCode)}`,
            confirmation_code: confirmationCode,
          });
        } catch (err) {
          console.error("[meta] falha na exclusão de dados", err);
          return new Response("internal error", { status: 500 });
        }
      },
    },
  },
});
