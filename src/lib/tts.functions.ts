/** Narração por IA (pt-BR) — a chave nunca sai do servidor. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().min(1).max(40).default("alloy"),
  instructions: z.string().max(400).optional(),
  speed: z.number().min(0.5).max(2).default(1),
});

export const NARRATION_VOICES: { id: string; label: string; hint: string }[] = [
  { id: "alloy", label: "Alloy", hint: "Neutra e clara" },
  { id: "verse", label: "Verse", hint: "Expressiva, boa para hooks" },
  { id: "sage", label: "Sage", hint: "Calma, para explicações" },
  { id: "ballad", label: "Ballad", hint: "Suave e narrativa" },
  { id: "ash", label: "Ash", hint: "Grave e firme" },
];

/** Gera narração e devolve um data URL de MP3 pronto para virar clipe de áudio. */
export const generateNarration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A narração por IA não está configurada neste projeto.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: data.voice,
        speed: data.speed,
        response_format: "mp3",
        // a voz é sempre pt-BR: o tom escolhido é acrescentado ao idioma, nunca o substitui
        instructions: `Fale em português do Brasil (pt-BR), com dicção clara e pronúncia brasileira natural. ${
          data.instructions ?? "Use energia de vídeo curto e ritmo natural."
        }`,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402) throw new Error("Créditos de IA esgotados — adicione créditos para gerar narração.");
      if (res.status === 429) throw new Error("Muitas gerações seguidas. Aguarde alguns segundos e tente de novo.");
      throw new Error(`Falha ao gerar narração (${res.status}). ${body.slice(0, 180)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return { dataUrl: `data:audio/mpeg;base64,${buf.toString("base64")}`, bytes: buf.length };
  });
