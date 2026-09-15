/** Network lifecycle is separate from Web Audio so it can be regression tested. */
export interface StemTicket {
  jobId?: string;
  base: string;
  uploadToken: string;
  controlToken: string;
  resultToken: string;
  maxDuration: number;
  recipe?: { id: string; revision: string };
}

export type StemJobNetworkStatus = "uploaded" | "queued" | "processing" | "downloading";

async function assertSeparationWav(wav: Blob): Promise<void> {
  if (wav.size < 44) throw new Error("O áudio preparado está vazio ou não é um WAV válido.");

  const header = new DataView(await wav.slice(0, 44).arrayBuffer());
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...Array.from({ length }, (_, index) => header.getUint8(offset + index)));
  const valid =
    ascii(0, 4) === "RIFF" &&
    ascii(8, 4) === "WAVE" &&
    ascii(12, 4) === "fmt " &&
    header.getUint16(20, true) === 1 &&
    [1, 2].includes(header.getUint16(22, true)) &&
    header.getUint32(24, true) === 44_100 &&
    header.getUint16(34, true) === 16;

  if (!valid)
    throw new Error("O áudio não pôde ser preparado em WAV PCM, 44.100 Hz, mono ou estéreo.");
}

export async function runStemJob(
  ticket: StemTicket,
  wav: Blob,
  options: { signal?: AbortSignal; onStage?: (stage: string) => void; onStatus?: (status: StemJobNetworkStatus) => void | Promise<void>; pollIntervalMs?: number } = {},
): Promise<{ voice: Blob; music: Blob; duration: number; engine?: string; model?: string; quality?: string }> {
  const { signal, onStage, onStatus, pollIntervalMs = 2500 } = options;
  await assertSeparationWav(wav);
  let started = false;
  const deadline = AbortSignal.timeout(17 * 60_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  async function request(path: string, token: string, init: RequestInit = {}) {
    const response = await fetch(`${ticket.base}${path}`, {
      ...init,
      headers: { ...init.headers, "x-job-token": token },
      signal: combined,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
      throw new Error(
        typeof body.detail === "string" ? body.detail : `Falha na separação (${response.status}).`,
      );
    }
    return response;
  }
  try {
    onStage?.("Enviando apenas o áudio…");
    started = true;
    await request("/upload", ticket.uploadToken, {
      method: "POST",
      body: wav,
      headers: { "content-type": "audio/wav" },
    });
    await onStatus?.("uploaded");
    await request("/start", ticket.controlToken, { method: "POST" });
    onStage?.("Demucs separando voz e acompanhamento na Hostear…");
    while (true) {
      const state = (await (await request("", ticket.controlToken)).json()) as {
        status: string;
        error?: string;
        duration?: number;
        engine?: string;
        model?: string;
        quality?: string;
      };
      if (state.status === "failed" || state.status === "cancelled")
        throw new Error(state.error ?? "Separação cancelada.");
      if (state.status === "completed") {
        if (
          !Number.isFinite(state.duration) ||
          state.duration! <= 0 ||
          state.duration! > ticket.maxDuration + 0.15
        )
          throw new Error("Duração inválida nas trilhas separadas.");
        onStage?.("Baixando as duas trilhas…");
        await onStatus?.("downloading");
        const [voice, music] = await Promise.all(
          ["voice", "music"].map(async (stem) => {
            const response = await request(`/stems/${stem}`, ticket.resultToken);
            if (!response.headers.get("content-type")?.startsWith("audio/"))
              throw new Error("Servidor não retornou uma trilha de áudio.");
            const blob = await response.blob();
            if (blob.size < 128 || blob.size > 256 * 1024 * 1024)
              throw new Error("Trilha vazia ou grande demais para salvar.");
            return blob;
          }),
        );
        return {
          voice: voice!,
          music: music!,
          duration: state.duration!,
          ...(state.engine ? { engine: state.engine } : {}),
          ...(state.model ? { model: state.model } : {}),
          ...(state.quality ? { quality: state.quality } : {}),
        };
      }
      if (state.status === "queued") { onStage?.("Na fila para separar diálogo e música…"); await onStatus?.("queued"); }
      else if (state.status === "uploaded") onStage?.("Áudio recebido; aguardando o processamento…");
      else if (state.status === "processing") { onStage?.("Separando diálogo e música…"); await onStatus?.("processing"); }
      else
        throw new Error("Estado inesperado no processamento de áudio.");
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelado", "AbortError"));
        };
        const timer = setTimeout(() => {
          combined.removeEventListener("abort", abort);
          resolve();
        }, Math.max(0, pollIntervalMs));
        combined.addEventListener("abort", abort, { once: true });
        if (combined.aborted) {
          combined.removeEventListener("abort", abort);
          abort();
        }
      });
    }
  } catch (error) {
    if (started)
      await fetch(`${ticket.base}/cancel`, {
        method: "POST",
        headers: { "x-job-token": ticket.controlToken },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
    throw error;
  }
}
