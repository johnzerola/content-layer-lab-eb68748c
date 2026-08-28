import { createFileRoute } from "@tanstack/react-router";
import {
  purgeMetaAccount,
  readSignedRequest,
  verifyMetaSignedRequest,
} from "@/lib/meta-signed-request.server";

/**
 * Callback de desautorização da Meta: chamado quando o usuário remove o app
 * pelo painel do Facebook/Instagram. Apaga a conexão e o token guardados.
 */
export const Route = createFileRoute("/api/public/meta/deauthorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signed = await readSignedRequest(request);
        const payload = await verifyMetaSignedRequest(signed);
        if (!payload?.user_id) {
          return new Response("invalid signed_request", { status: 400 });
        }
        try {
          const removed = await purgeMetaAccount(payload.user_id);
          return Response.json({ ok: true, removed });
        } catch (err) {
          console.error("[meta] falha ao desautorizar", err);
          return new Response("internal error", { status: 500 });
        }
      },
    },
  },
});
