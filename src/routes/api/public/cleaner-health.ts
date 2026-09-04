import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { workerHealth } from "@/lib/cleaner.server";

function authorized(request: Request): boolean {
  const expected = process.env["PUBLISH_HOOK_SECRET"];
  if (!expected) return false;
  const provided = request.headers.get("x-hook-secret") ?? "";
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/cleaner-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const health = await workerHealth();
        const etag = createHmac("sha256", process.env["PUBLISH_HOOK_SECRET"]!)
          .update(JSON.stringify(health))
          .digest("hex")
          .slice(0, 16);
        return Response.json(health, {
          headers: { "cache-control": "no-store", etag },
        });
      },
    },
  },
});
