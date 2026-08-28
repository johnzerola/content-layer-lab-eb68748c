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
          await purgeMetaAccount(payload.user_id);
        } catch (err) {
          console.error("[meta] falha na exclusão de dados", err);
          return new Response("internal error", { status: 500 });
        }
        const code = `meta-${payload.user_id}-${Date.now().toString(36)}`;
        return Response.json({
          url: `${siteUrl()}/exclusao-de-dados?code=${encodeURIComponent(code)}`,
          confirmation_code: code,
        });
      },
    },
  },
});
