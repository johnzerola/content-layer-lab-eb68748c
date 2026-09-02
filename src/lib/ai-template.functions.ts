import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 5 — plano de template real gerado por IA:
 * branding (headline/CTA/paleta), estilo de legenda, layout,
 * variações de estilo (anti-duplicidade) e cortes reais com timestamps.
 */

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .catch("#ffffff");

const shape = z.object({
  brand: z
    .object({
      headline: z.string().default(""),
      cta: z.string().default(""),
      background: hex.default("#0a0a0a"),
      palette: z.array(hex).default([]),
      tone: z.string().default(""),
    })
    .default({}),
  captions: z
    .object({
      preset: z.string().default("capcut"),
      color: hex.default("#ffffff"),
      activeColor: hex.default("#c6f24e"),
      position: z.enum(["top", "middle", "bottom"]).default("bottom"),
      maxWords: z.number().min(1).max(8).default(4),
      uppercase: z.boolean().default(true),
      reason: z.string().default(""),
    })
    .default({}),
  layout: z
    .enum(["auto", "fill", "fit", "blur", "split", "trio", "spotlight", "centered", "horizontal"])
    .default("auto"),
  variations: z
    .array(
      z.object({
        label: z.string().default("Variação"),
        look: z.string().default(""),
        speed: z.number().min(0.9).max(1.1).default(1),
        zoom: z.number().min(0).max(0.12).default(0.04),
        motion: z
          .enum(["none", "breathe", "kenburns", "pulse", "pushin"])
          .default("breathe"),
        reason: z.string().default(""),
      }),
    )
    .default([]),
  cuts: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        title: z.string().default(""),
        reason: z.string().default(""),
        score: z.number().default(70),
        headline: z.string().default(""),
      }),
    )
    .default([]),
  cleaner: z
    .object({
      recommended: z.boolean().default(false),
      regions: z.array(z.string()).default([]),
      reason: z.string().default(""),
    })
    .default({}),
});

export type AiTemplatePlan = z.infer<typeof shape>;

export const aiTemplatePlan = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        transcript: z.string().min(1).max(24000),
        duration: z.number().min(1).max(60 * 60 * 6),
        platform: z.string().max(40).optional(),
        niche: z.string().max(80).optional(),
        looks: z.array(z.string().max(40)).min(1).max(40),
        captionPresets: z.array(z.string().max(40)).min(1).max(40),
        cleanupPresets: z.array(z.string().max(40)).min(1).max(40),
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
              "Você é diretor de arte e editor de vídeos virais (Reels, TikTok, Shorts). " +
              "Responda SOMENTE com JSON válido no formato: " +
              '{"brand":{"headline":string,"cta":string,"background":"#rrggbb","palette":["#rrggbb"],"tone":string},' +
              '"captions":{"preset":string,"color":"#rrggbb","activeColor":"#rrggbb","position":"top|middle|bottom","maxWords":number,"uppercase":boolean,"reason":string},' +
              '"layout":"auto|fill|fit|blur|split|trio|spotlight|centered|horizontal",' +
              '"variations":[{"label":string,"look":string,"speed":number,"zoom":number,"motion":"none|breathe|kenburns|pulse|pushin","reason":string}],' +
              '"cuts":[{"start":number,"end":number,"title":string,"reason":string,"score":number,"headline":string}],' +
              '"cleaner":{"recommended":boolean,"regions":[string],"reason":string}}. ' +
              "Regras: tudo em português; headline com no máximo 42 caracteres; 3 a 5 variações com looks DIFERENTES " +
              "e apenas ids permitidos; speed entre 0.95 e 1.05; zoom entre 0.02 e 0.08; " +
              "cuts entre 15 e 75 segundos, dentro da duração informada, no máximo 6, sem sobreposição, " +
              "ordenados pelo score (0 a 100); captions.preset e cleaner.regions só com ids permitidos.",
          },
          {
            role: "user",
            content:
              `Duração total: ${Math.round(data.duration)}s\n` +
              `Plataforma: ${data.platform ?? "reels/tiktok/shorts"}\n` +
              `Nicho: ${data.niche ?? "detectar pelo conteúdo"}\n` +
              `Ids de look permitidos: ${data.looks.join(", ")}\n` +
              `Ids de preset de legenda permitidos: ${data.captionPresets.join(", ")}\n` +
              `Ids de área de limpeza permitidos: ${data.cleanupPresets.join(", ")}\n` +
              `Transcrição (com marcas de tempo quando houver):\n${data.transcript}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        res.status === 402
          ? "Seus créditos de IA acabaram. Adicione créditos para gerar o template."
          : res.status === 429
            ? "Muitas solicitações de IA ao mesmo tempo. Espere alguns segundos."
            : `Falha ao gerar o template (${res.status}). ${body.slice(0, 160)}`,
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

    const out = shape.safeParse(parsed);
    if (!out.success) throw new Error("A IA devolveu o template em formato inesperado. Tente novamente.");

    const looks = new Set(data.looks);
    const capPresets = new Set(data.captionPresets);
    const cleanIds = new Set(data.cleanupPresets);
    const p = out.data;

    const variations = p.variations
      .filter((v) => looks.has(v.look))
      .filter((v, i, arr) => arr.findIndex((o) => o.look === v.look) === i)
      .slice(0, 5);

    const cuts = p.cuts
      .map((c) => ({
        ...c,
        start: Math.max(0, Math.min(c.start, data.duration - 1)),
        end: Math.max(1, Math.min(c.end, data.duration)),
      }))
      .filter((c) => c.end - c.start >= 5)
      .sort((a, b) => a.start - b.start)
      .slice(0, 6);

    return {
      brand: {
        ...p.brand,
        headline: p.brand.headline.slice(0, 60),
        cta: p.brand.cta.slice(0, 40),
        palette: p.brand.palette.slice(0, 6),
        tone: p.brand.tone.slice(0, 200),
      },
      captions: {
        ...p.captions,
        preset: capPresets.has(p.captions.preset) ? p.captions.preset : data.captionPresets[0]!,
        reason: p.captions.reason.slice(0, 200),
      },
      layout: p.layout,
      variations,
      cuts,
      cleaner: {
        ...p.cleaner,
        regions: p.cleaner.regions.filter((r) => cleanIds.has(r)).slice(0, 4),
        reason: p.cleaner.reason.slice(0, 200),
      },
    } satisfies AiTemplatePlan;
  });
