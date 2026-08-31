/**
 * Upload resumável (resumable upload) de vídeos para o YouTube Data API v3.
 *
 * O vídeo é lido em blocos a partir da URL assinada do storage e enviado
 * em partes para a sessão resumável do Google, permitindo retomar o envio
 * quando um bloco falha por erro temporário.
 */

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_ATTEMPTS = 4;

export type YoutubeUploadInput = {
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
  privacyStatus?: "public" | "unlisted" | "private";
  madeForKids?: boolean;
  chunkBytes?: number;
  fetch?: typeof fetch;
};

export type YoutubeUploadResult =
  | { ok: true; videoId: string; permalink: string }
  | { ok: false; error: string; retryable: boolean; status?: number };

function failure(error: string, retryable: boolean, status?: number): YoutubeUploadResult {
  return { ok: false, error, retryable, ...(status === undefined ? {} : { status }) };
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Título do YouTube: obrigatório, no máximo 100 caracteres, sem quebras de linha. */
export function youtubeTitleFromCaption(caption: string, fallback = "Novo vídeo"): string {
  const firstLine = caption.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  const title = (firstLine ?? fallback).replace(/[<>]/g, "").slice(0, 100).trim();
  return title || fallback;
}

async function sourceSize(url: string, request: typeof fetch): Promise<number | null> {
  const head = await request(url, { method: "HEAD" });
  const length = head.headers.get("content-length");
  if (head.ok && length && Number.isFinite(Number(length))) return Number(length);
  return null;
}

/** Interpreta o header `Range` devolvido pelo Google (`bytes=0-8388607`). */
export function nextOffsetFromRange(range: string | null, current: number): number {
  if (!range) return current;
  const match = /bytes=0-(\d+)/.exec(range);
  return match?.[1] ? Number(match[1]) + 1 : current;
}

export async function uploadYoutubeVideo(input: YoutubeUploadInput): Promise<YoutubeUploadResult> {
  const request = input.fetch ?? fetch;
  const chunkBytes = Math.max(256 * 1024, input.chunkBytes ?? DEFAULT_CHUNK_BYTES);

  let total: number | null;
  try {
    total = await sourceSize(input.videoUrl, request);
  } catch {
    return failure("Não foi possível ler o arquivo de vídeo para envio.", true);
  }
  if (!total || total <= 0) {
    return failure("O arquivo de vídeo não está acessível para upload no YouTube.", false);
  }

  let session: Response;
  try {
    session = await request(`${UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(total),
        "x-upload-content-type": "video/*",
      },
      body: JSON.stringify({
        snippet: {
          title: input.title,
          description: input.description.slice(0, 5000),
        },
        status: {
          privacyStatus: input.privacyStatus ?? "public",
          selfDeclaredMadeForKids: input.madeForKids ?? false,
        },
      }),
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "YouTube indisponível.", true);
  }

  const uploadUrl = session.headers.get("location");
  if (!session.ok || !uploadUrl) {
    const detail = (await session.text().catch(() => "")).slice(0, 300);
    return failure(
      `YouTube não iniciou o upload [${session.status}]: ${detail || "sem detalhes"}`,
      retryableStatus(session.status),
      session.status,
    );
  }

  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + chunkBytes, total) - 1;
    let uploaded = false;

    for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS && !uploaded; attempt++) {
      let chunk: ArrayBuffer;
      try {
        const part = await request(input.videoUrl, { headers: { range: `bytes=${offset}-${end}` } });
        if (!part.ok && part.status !== 206) {
          return failure(`Não foi possível ler o vídeo [${part.status}].`, retryableStatus(part.status));
        }
        chunk = await part.arrayBuffer();
      } catch (error) {
        if (attempt === MAX_CHUNK_ATTEMPTS) {
          return failure(error instanceof Error ? error.message : "Falha ao ler o vídeo.", true);
        }
        continue;
      }

      let response: Response;
      try {
        response = await request(uploadUrl, {
          method: "PUT",
          headers: {
            "content-length": String(chunk.byteLength),
            "content-range": `bytes ${offset}-${offset + chunk.byteLength - 1}/${total}`,
          },
          body: chunk,
        });
      } catch (error) {
        if (attempt === MAX_CHUNK_ATTEMPTS) {
          return failure(error instanceof Error ? error.message : "Upload interrompido.", true);
        }
        continue;
      }

      if (response.status === 308) {
        offset = nextOffsetFromRange(response.headers.get("range"), offset + chunk.byteLength);
        uploaded = true;
        break;
      }

      if (response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const videoId =
          payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string"
            ? (payload as { id: string }).id
            : null;
        if (!videoId) return failure("YouTube não devolveu o ID do vídeo publicado.", true);
        return { ok: true, videoId, permalink: `https://www.youtube.com/watch?v=${videoId}` };
      }

      const detail = (await response.text().catch(() => "")).slice(0, 300);
      if (!retryableStatus(response.status) || attempt === MAX_CHUNK_ATTEMPTS) {
        return failure(
          `YouTube recusou o upload [${response.status}]: ${detail || "sem detalhes"}`,
          retryableStatus(response.status),
          response.status,
        );
      }
    }

    if (!uploaded) return failure("Upload do YouTube não avançou.", true);
  }

  return failure("O upload terminou sem confirmação do YouTube.", true);
}
