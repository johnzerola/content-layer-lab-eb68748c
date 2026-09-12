/**
 * Síntese de fala do ChatScene — sempre no servidor.
 *
 * O provedor padrão é a IA da Lovable (nenhuma chave fica no navegador). O
 * cliente só envia o texto e a voz genérica escolhida; nunca envia amostras de
 * voz de pessoas reais, porque o produto não faz clonagem.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_CHARS = 600;

export const synthesizeVoice = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        // bolhas muito longas são cortadas em vez de derrubar a geração
        text: z.string().min(1).transform((t) => t.slice(0, MAX_CHARS)),
        voice: z.string().min(1).max(40),
        direction: z.string().max(300).optional(),
        speed: z.number().min(0.7).max(1.3).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A geração de voz não está configurada neste projeto.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: data.voice,
        response_format: "mp3",
        speed: data.speed ?? 1,
        // o idioma nunca é opcional: o estilo pedido é somado ao português do Brasil
        instructions: `Fale em português do Brasil (pt-BR), com pronúncia brasileira natural e dicção clara. ${
          data.direction ?? "Use tom de conversa real, sem soar robótico."
        }`,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402) {
        throw new Error("Seus créditos de IA acabaram. Adicione créditos para gerar as vozes.");
      }
      if (res.status === 403) {
        throw new Error("A geração de voz está bloqueada nas configurações desta conta.");
      }
      if (res.status === 401) {
        throw new Error("A geração de voz não está configurada neste projeto.");
      }
      if (res.status === 429) {
        throw new Error("Muitas vozes ao mesmo tempo. Espere alguns segundos e tente de novo.");
      }
      console.error(`TTS falhou [${res.status}]: ${body}`);
      throw new Error("Não foi possível gerar esta fala agora.");
    }

    const buffer = await res.arrayBuffer();
    return {
      mime: "audio/mpeg",
      audio: Buffer.from(buffer).toString("base64"),
    };
  });
