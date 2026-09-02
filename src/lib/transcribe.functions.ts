import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Transcreve um trecho de áudio (WAV base64) usando a Lovable AI.
 * Retorna apenas o texto — os tempos são calculados no cliente por segmento.
 */
export const transcribeChunk = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => 
    z.object({ 
      audio: z.string().min(100), 
      language: z.string().optional() 
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A IA de transcrição não está configurada neste projeto (chave ausente).");

    const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    if (bin.byteLength < 2048) return { text: "" };
    if (bin.byteLength > 24 * 1024 * 1024) {
      throw new Error("Trecho de áudio grande demais para transcrever. Reduza a duração do corte.");
    }

    const form = new FormData();
    form.append("model", "openai/gpt-4o-transcribe");
    form.append("file", new Blob([bin], { type: "audio/wav" }), "chunk.wav");
    if (data.language) form.append("language", data.language);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg =
        res.status === 402
          ? "Seus créditos de IA acabaram. Adicione créditos em Settings → Plans & credits para gerar legendas."
          : res.status === 429
            ? "Muitas transcrições ao mesmo tempo (limite de uso). Espere alguns segundos e tente novamente."
            : res.status === 403 || res.status === 404
              ? "A transcrição por IA está indisponível nesta conta."
              : res.status === 400
                ? "O áudio enviado foi recusado pela IA (formato ou idioma inválido). Tente o idioma 'auto'."
                : `Falha na transcrição (${res.status}). ${body.slice(0, 160)}`;
      // o prefixo com o status deixa o cliente classificar (repetir, pedir login, parar)
      throw new Error(`[${res.status}] ${msg}`);
    }



    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  });

/**
 * Refina a transcrição: traduz para português do Brasil (quando o áudio está
 * em outro idioma) e devolve as palavras com pontuação e maiúsculas corretas,
 * mantendo EXATAMENTE a mesma quantidade de tokens para não perder o tempo
 * por palavra da legenda.
 */
export const refineTranscriptWords = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        words: z.array(z.string()).min(1).max(600),
        language: z.string().min(2).default("português do Brasil"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A IA de legendas não está configurada neste projeto (chave ausente).");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          {
            role: "system",
            content:
              "Você revisa legendas token a token. Receba um array JSON de palavras transcritas e devolva SOMENTE um array JSON " +
              "com exatamente a mesma quantidade de itens, na mesma ordem. Traduza para o idioma pedido quando o texto estiver " +
              "em outro idioma, corrija ortografia, aplique maiúsculas de início de frase e nomes próprios e acrescente a " +
              "pontuação (vírgula, ponto, interrogação) ao final do token onde ela cai. Nunca junte, remova ou reordene itens.",
          },
          {
            role: "user",
            content: `Idioma final: ${data.language}\nTokens: ${JSON.stringify(data.words)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg =
        res.status === 402
          ? "Seus créditos de IA acabaram. Adicione créditos em Settings → Plans & credits para revisar a legenda."
          : res.status === 429
            ? "Muitas revisões ao mesmo tempo. Espere alguns segundos e tente de novo."
            : `Falha ao revisar a legenda (${res.status}). ${body.slice(0, 160)}`;
      throw new Error(msg);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    let out: unknown = null;
    try {
      out = JSON.parse(match ? match[0] : raw);
    } catch {
      out = null;
    }
    if (!Array.isArray(out)) throw new Error("A IA devolveu a legenda em formato inesperado. Tente novamente.");
    const words = out.map((w) => String(w ?? "").trim());
    return { words: data.words.map((orig, i) => words[i] || orig) };
  });
