import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Copy assistida por IA para o editor de templates: título, hook e legenda
 * gerados a partir do vídeo escolhido (corte/tema) e do template em edição
 * (formato, nome e textos das camadas).
 */

const Input = z.object({
  template: z.object({
    name: z.string().max(120).default(""),
    aspectRatio: z.string().max(10).default("9:16"),
    layerTexts: z.array(z.string().max(200)).max(20).default([]),
    hasCaptions: z.boolean().default(false),
  }),
  video: z.object({
    title: z.string().max(200).default(""),
    description: z.string().max(4000).default(""),
    durationSec: z.number().min(0).max(60 * 60 * 6).default(0),
  }),
  platform: z.string().max(40).default("Reels/TikTok/Shorts"),
  tone: z.string().max(40).default("direto e viral"),
});

const Shape = z.object({
  titles: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  captions: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
});

export type TemplateCopySuggestion = {
  titles: string[];
  hooks: string[];
  captions: string[];
  hashtags: string[];
};

export const aiTemplateCopy = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<TemplateCopySuggestion> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("A IA não está configurada neste projeto (chave ausente).");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          {
            role: "system",
            content:
              "Você escreve copy para vídeos curtos virais em português do Brasil. Responda SOMENTE com JSON válido " +
              '{"titles":[string],"hooks":[string],"captions":[string],"hashtags":[string]}. ' +
              "Regras: 5 títulos com no máximo 42 caracteres, sem ponto final; 5 hooks de até 60 caracteres para " +
              "os 3 primeiros segundos; 3 legendas de até 300 caracteres com quebra de linha e chamada para ação; " +
              "até 12 hashtags começando com #. Nunca invente dados que não estejam no material.",
          },
          {
            role: "user",
            content:
              `Plataforma: ${data.platform}\n` +
              `Tom: ${data.tone}\n` +
              `Template: "${data.template.name}" (formato ${data.template.aspectRatio}, ` +
              `${data.template.hasCaptions ? "com legendas automáticas" : "sem legendas automáticas"})\n` +
              `Textos já presentes no template: ${data.template.layerTexts.join(" | ") || "nenhum"}\n` +
              `Vídeo: ${data.video.title || "sem título"}` +
              (data.video.durationSec ? ` (${Math.round(data.video.durationSec)}s)` : "") +
              `\nConteúdo do vídeo / transcrição / tema:\n${data.video.description || "não informado"}`,
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
            ? "Muitas solicitações de IA ao mesmo tempo. Espere alguns segundos e tente de novo."
            : res.status === 403
              ? "A IA está bloqueada nas configurações do workspace."
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

    const out = Shape.safeParse(parsed);
    if (!out.success) throw new Error("A IA devolveu a copy em formato inesperado. Tente novamente.");

    const clean = (list: string[], max: number, len: number) =>
      list.map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, len)).slice(0, max);

    return {
      titles: clean(out.data.titles, 6, 80),
      hooks: clean(out.data.hooks, 6, 120),
      captions: clean(out.data.captions, 4, 400),
      hashtags: clean(
        out.data.hashtags.map((h) => h.replace(/^#*/, "#")),
        12,
        40,
      ).filter((h) => h.length > 1),
    };
  });
