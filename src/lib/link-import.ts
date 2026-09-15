import { resolveVideoLink, type ResolvedVideo } from "@/lib/import.functions";

export const MAX_LINK_BATCH = 100;

const PROXY_ERROR_MESSAGES: Record<number, Record<string, string>> = {
  400: {
    "url not allowed": "O endereço final do vídeo não passou pela validação de segurança.",
    "redirect not allowed": "A plataforma redirecionou o vídeo para um endereço não permitido.",
  },
  401: {
    "invalid or expired ticket": "A autorização temporária do download expirou.",
  },
  415: {
    "not a video": "A plataforma devolveu uma página em vez do arquivo de vídeo.",
  },
  502: {
    "upstream error": "A plataforma não entregou o arquivo de vídeo.",
    "too many redirects": "A plataforma redirecionou o download vezes demais.",
  },
};

/** Converte respostas curtas do proxy em erros úteis sem expor dados internos. */
export function proxyDownloadError(status: number, responseBody = ""): string {
  const normalized = responseBody.trim().toLowerCase();
  const known = PROXY_ERROR_MESSAGES[status]?.[normalized];
  if (known) return known;
  if (status === 413) return "O vídeo excede o limite de tamanho configurado.";
  if (status >= 500) return "O servidor não conseguiu baixar o arquivo da plataforma.";
  return `O download foi recusado (erro ${status}).`;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/unable_to_verify_leaf_signature|certificate|fetch failed/i.test(message)) {
    return "O servidor não conseguiu validar a conexão HTTPS. Reinicie-o com npm run dev.";
  }
  if (/sessão|authorization|unauthorized|token/i.test(message)) {
    return "Sua sessão expirou. Entre novamente e repita o download.";
  }
  return message.trim() || "Não foi possível baixar este vídeo.";
}

/** Extract links from free text (including numbered lists), preserving order. */
export function extractVideoLinks(text: string, limit = MAX_LINK_BATCH): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const unique = new Set<string>();
  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;!?\]}]+$/g, "");
    try {
      const parsed = new URL(cleaned);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname) {
        unique.add(parsed.toString());
      }
    } catch {
      // Ignore text that resembles a URL but is invalid.
    }
    if (unique.size >= limit) break;
  }
  return [...unique];
}

function fileNameFor(resolved: ResolvedVideo) {
  const pathExt = resolved.videoUrl
    ? new URL(resolved.videoUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]
    : undefined;
  const ext = (resolved.ext ?? pathExt ?? "mp4").replace(/^\./, "").toLowerCase();
  const base =
    (resolved.title ?? "video")
      .replace(/\.(mp4|mov|m4v|webm|mkv|ogv|3gp|avi|mpeg|mpg|ts)$/i, "")
      .replace(/[^\w\-. ]+/g, "")
      .trim()
      .slice(0, 60) || "video";
  return `${base}.${ext}`;
}

/** Resolve and download, advancing to another provider if a resolved URL fails. */
export async function downloadVideoLink(url: string): Promise<{
  file: File;
  resolved: ResolvedVideo;
}> {
  const excludedProviders: string[] = [];
  let lastMessage = "Não encontrei o vídeo nesse link.";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let resolved: ResolvedVideo;
    try {
      resolved = await resolveVideoLink({ data: { url, excludedProviders } });
    } catch (error) {
      throw new Error(errorMessage(error));
    }
    if (!resolved.ok || !resolved.videoUrl || !resolved.proxyUrl) {
      lastMessage = resolved.message ?? lastMessage;
      break;
    }
    try {
      const response = await fetch(resolved.proxyUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(proxyDownloadError(response.status, body.slice(0, 200)));
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("arquivo vazio");
      const name = fileNameFor(resolved);
      return {
        file: new File([blob], name, { type: blob.type || "video/mp4" }),
        resolved,
      };
    } catch (error) {
      const provider = resolved.provider ?? resolved.source ?? `tentativa-${attempt + 1}`;
      if (excludedProviders.includes(provider)) break;
      excludedProviders.push(provider);
      lastMessage = `${errorMessage(error)} Provedor: ${provider}.`;
    }
  }
  throw new Error(lastMessage);
}
