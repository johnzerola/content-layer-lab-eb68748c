/** Network lifecycle is separate from Web Audio so it can be regression tested. */
export interface StemTicket {
  base: string;
  uploadToken: string;
  controlToken: string;
  resultToken: string;
  maxDuration: number;
}

export async function runStemJob(
  ticket: StemTicket,
  wav: Blob,
  options: { signal?: AbortSignal; onStage?: (stage: string) => void } = {},
): Promise<{ voice: Blob; music: Blob; duration: number }> {
  const { signal, onStage } = options;
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
    await request("/start", ticket.controlToken, { method: "POST" });
    onStage?.("Demucs separando voz e acompanhamento na Hostear…");
    while (true) {
      const state = (await (await request("", ticket.controlToken)).json()) as {
        status: string;
        error?: string;
        duration?: number;
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
        return { voice: voice!, music: music!, duration: state.duration! };
      }
      if (state.status !== "processing")
        throw new Error("Estado inesperado no processamento de áudio.");
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelado", "AbortError"));
        };
        const timer = setTimeout(() => {
          combined.removeEventListener("abort", abort);
          resolve();
        }, 2500);
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
