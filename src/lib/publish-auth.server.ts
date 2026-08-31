import { timingSafeEqual } from "node:crypto";

function matches(provided: string, configuredSecret: string | undefined): boolean {
  if (!configuredSecret || configuredSecret.length < 32) return false;
  const expectedBuffer = Buffer.from(configuredSecret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function validCronSecret(
  authorization: string | null,
  configuredSecret = process.env["PUBLISH_CRON_SECRET"],
  fallbackSecret = process.env["PUBLISH_HOOK_SECRET"],
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = authorization.slice("Bearer ".length);
  return matches(provided, configuredSecret) || matches(provided, fallbackSecret);
}

export function requireCronAuthorization(request: Request): Response | null {
  if (validCronSecret(request.headers.get("authorization"))) return null;
  return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });
}
