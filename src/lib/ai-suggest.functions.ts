import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sugestões reais de IA para o editor: headlines/legendas, cortes virais
 * e estilo de edição (look) recomendado, a partir da transcrição do vídeo.
 */
export const aiSuggest = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        transcript: z.string().min(1).max(24000),
        duration: z.number().min(1).max(60 * 60 * 6),
        platform: z.string().max(40).optional(),
        niche: z.string().max(80).optional(),
        looks: z.array(z.string().max(40)).min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A IA não está configurada neste projeto (chave ausente).");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você é um editor de vídeos virais para Reels, TikTok e Shorts. Responda SOMENTE com JSON válido " +
              "no formato: {\"headlines\":[string],\"hashtags\":[string],\"cuts\":[{\"start\":number,\"end\":number," +
              "\"title\":string,\"reason\":string,\"score\":number}],\"look\":{\"id\":string,\"reason\":string}," +
              "\"captionTip\":string}. Regras: headlines curtas em português (máx. 42 caracteres, 5 opções, " +
              "gancho na primeira palavra); cuts entre 15 e 75 segundos, dentro da duração informada, no máximo 4, " +
              "score de 0 a 100; look.id DEVE ser um dos ids permitidos.",
          },
          {
            role: "user",
            content:
              `Duração total: ${Math.round(data.duration)}s\n` +
              `Plataforma: ${data.platform ?? "reels/tiktok/shorts"}\n` +
              `Nicho: ${data.niche ?? "detectar pelo conteúdo"}\n` +
              `Ids de look permitidos: ${data.looks.join(", ")}\n` +
              `Transcrição (com marcas de tempo quando houver):\n${data.transcript}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        res.status === 402
          ? "Seus créditos de IA acabaram. Adicione créditos para gerar sugestões."
          : res.status === 429
            ? "Muitas solicitações de IA ao mesmo tempo. Espere alguns segundos."
            : `Falha ao gerar sugestões (${res.status}). ${body.slice(0, 160)}`,
      );
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      parsed = null;
    }

    const shape = z.object({
      headlines: z.array(z.string()).default([]),
      hashtags: z.array(z.string()).default([]),
      cuts: z
        .array(
          z.object({
            start: z.number(),
            end: z.number(),
            title: z.string().default(""),
            reason: z.string().default(""),
            score: z.number().default(70),
          }),
        )
        .default([]),
      look: z.object({ id: z.string(), reason: z.string().default("") }).nullable().default(null),
      captionTip: z.string().default(""),
    });

    const out = shape.safeParse(parsed);
    if (!out.success) throw new Error("A IA devolveu as sugestões em formato inesperado. Tente novamente.");

    const allowed = new Set(data.looks);
    return {
      headlines: out.data.headlines.map((h) => h.trim()).filter(Boolean).slice(0, 6),
      hashtags: out.data.hashtags.map((h) => h.trim().replace(/^#*/, "#")).filter((h) => h.length > 1).slice(0, 12),
      cuts: out.data.cuts
        .map((c) => ({
          ...c,
          start: Math.max(0, Math.min(c.start, data.duration - 1)),
          end: Math.max(1, Math.min(c.end, data.duration)),
        }))
        .filter((c) => c.end - c.start >= 5)
        .slice(0, 4),
      look: out.data.look && allowed.has(out.data.look.id) ? out.data.look : null,
      captionTip: out.data.captionTip.slice(0, 400),
    };
  });
