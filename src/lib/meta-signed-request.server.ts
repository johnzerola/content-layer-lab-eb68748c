/**
 * Validação do `signed_request` que a Meta envia nos callbacks de
 * desautorização e de exclusão de dados.
 *
 * Formato: `<assinatura base64url>.<payload base64url>` — a assinatura é o
 * HMAC-SHA256 do payload (texto cru) com o App Secret.
 */

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export interface MetaSignedRequest {
  /** id do usuário na Meta (app-scoped) */
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
}

/**
 * Devolve o payload quando a assinatura confere; caso contrário, null.
 * O App Secret é lido aqui dentro (env só existe em tempo de requisição).
 */
export async function verifyMetaSignedRequest(
  signedRequest: string | null | undefined,
): Promise<MetaSignedRequest | null> {
  const secret = process.env["META_APP_SECRET"]?.trim();
  if (!secret || !signedRequest) return null;

  const [signaturePart, payloadPart] = signedRequest.split(".");
  if (!signaturePart || !payloadPart) return null;

  let signature: Uint8Array;
  let payloadBytes: Uint8Array;
  try {
    signature = base64UrlToBytes(signaturePart);
    payloadBytes = base64UrlToBytes(payloadPart);
  } catch {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart)),
  );
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as MetaSignedRequest;
    if (parsed.algorithm && parsed.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Lê o `signed_request` de um POST form-urlencoded ou JSON. */
export async function readSignedRequest(request: Request): Promise<string | null> {
  const type = request.headers.get("content-type") ?? "";
  const raw = await request.text();
  if (raw.length > 32 * 1024) return null;
  if (type.includes("application/json")) {
    try {
      return (JSON.parse(raw) as { signed_request?: string }).signed_request ?? null;
    } catch {
      return null;
    }
  }
  return new URLSearchParams(raw).get("signed_request");
}

/**
 * Apaga as conexões Meta ligadas a um identificador da Meta.
 * Devolve quantas conexões foram removidas.
 */
export async function purgeMetaAccount(providerAccountId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: connections } = await supabaseAdmin
    .from("social_connections")
    .select("id, social_account_id")
    .eq("provider", "meta")
    .eq("provider_account_id", providerAccountId);

  const list = connections ?? [];
  if (!list.length) return 0;

  const connectionIds = list.map((c) => c.id);
  const accountIds = list.map((c) => c.social_account_id).filter(Boolean) as string[];

  await supabaseAdmin
    .from("social_connection_credentials")
    .delete()
    .in("connection_id", connectionIds);
  await supabaseAdmin.from("social_connections").delete().in("id", connectionIds);
  if (accountIds.length) {
    await supabaseAdmin
      .from("social_accounts")
      .update({ status: "desconectado", provider: "pending", provider_account_id: null } as never)
      .in("id", accountIds);
  }
  return connectionIds.length;
}
