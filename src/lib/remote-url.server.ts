import { safeRemoteUrl } from "@/lib/remote-url";

/**
 * Validação de destino contra SSRF/DNS rebinding.
 *
 * `safeRemoteUrl` bloqueia apenas literais de IP privado no hostname. Um nome
 * público pode, porém, resolver para 127.0.0.1 / 169.254.x.x (rebinding).
 * Aqui resolvemos o nome por DNS-over-HTTPS (o runtime Worker não expõe
 * resolvedor nativo) e recusamos qualquer resposta que aponte para faixa
 * privada, link-local, loopback ou multicast.
 */

const CACHE = new Map<string, { ok: boolean; at: number }>();
const TTL_MS = 60_000;

export function isBlockedIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    if (v6 === "::" || v6 === "::1") return true;
    if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
    // IPv4 mapeado (::ffff:127.0.0.1)
    const mapped = v6.split(":").pop();
    return mapped ? isBlockedIp(mapped) : true;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a >= 224
  );
}

async function resolve(host: string, type: "A" | "AAAA"): Promise<string[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } }).catch(() => null);
  if (!res?.ok) return [];
  const body = (await res.json().catch(() => null)) as { Answer?: { type: number; data: string }[] } | null;
  return (body?.Answer ?? [])
    .filter((a) => a.type === 1 || a.type === 28)
    .map((a) => a.data.trim())
    .filter(Boolean);
}

/** Confere se o hostname resolve somente para IPs públicos. */
export async function hostResolvesPublic(host: string): Promise<boolean> {
  const key = host.toLowerCase();
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ok;

  const [v4, v6] = await Promise.all([resolve(key, "A"), resolve(key, "AAAA")]);
  const ips = [...v4, ...v6];
  // Sem resposta DoH não conseguimos garantir o destino: negamos.
  const ok = ips.length > 0 && ips.every((ip) => !isBlockedIp(ip));
  CACHE.set(key, { ok, at: Date.now() });
  return ok;
}

/** Valida a URL (esquema, host literal e resolução DNS) antes de qualquer fetch. */
export async function assertSafeRemoteUrl(raw: string): Promise<URL | null> {
  const url = safeRemoteUrl(raw);
  if (!url) return null;
  // Literal de IP já validado por safeRemoteUrl; só resolvemos nomes.
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return url;
  return (await hostResolvesPublic(url.hostname)) ? url : null;
}
