import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Only scoped, short-lived tickets leave the server, never the worker secret. */
export const prepareAudioSeparation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    const { jobToken, workerBase, workerPublicBase } = await import("@/lib/cleaner.server");
    const base = workerBase();
    const publicBase = workerPublicBase();
    if (!base || !publicBase) throw new Error("Servidor de separação de áudio não configurado.");
    const response = await fetch(`${base}/v1/audio/capabilities`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error("Publique o serviço Demucs na Hostear antes de separar as trilhas.");
    const caps = (await response.json()) as { ready?: boolean; max_duration?: number };
    if (caps.ready !== true)
      throw new Error(
        "Demucs não está instalado/habilitado na Hostear. O áudio original não foi alterado.",
      );
    const jobId = crypto.randomUUID();
    return {
      base: `${publicBase}/v1/audio/jobs/${jobId}`,
      uploadToken: jobToken(jobId, "upload", 600),
      controlToken: jobToken(jobId, "control", 1800),
      resultToken: jobToken(jobId, "result", 1800),
      maxDuration: Math.min(180, caps.max_duration ?? 180),
    };
  });
