import { resolveVideoLink, type ResolvedVideo } from "@/lib/import.functions";

export const MAX_LINK_BATCH = 100;

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
    const resolved = await resolveVideoLink({ data: { url, excludedProviders } });
    if (!resolved.ok || !resolved.videoUrl || !resolved.proxyUrl) {
      lastMessage = resolved.message ?? lastMessage;
      break;
    }
    try {
      const response = await fetch(resolved.proxyUrl);
      if (!response.ok) throw new Error(`proxy respondeu ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("arquivo vazio");
      const name = fileNameFor(resolved);
      return {
        file: new File([blob], name, { type: blob.type || "video/mp4" }),
        resolved,
      };
    } catch {
      const provider = resolved.provider ?? resolved.source ?? `tentativa-${attempt + 1}`;
      if (excludedProviders.includes(provider)) break;
      excludedProviders.push(provider);
      lastMessage = `O provedor ${provider} bloqueou o arquivo; tentando o próximo.`;
    }
  }
  throw new Error(lastMessage);
}
