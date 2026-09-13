/**
 * Gerador de histórias do ChatScene — roda no servidor, via IA da Lovable.
 *
 * A IA devolve apenas o roteiro (personagens e falas). A montagem do documento
 * fica em `story.ts`, para o mesmo roteiro sempre virar a mesma cena.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TONE_HINT: Record<string, string> = {
  comedia: "comédia, com situações absurdas e virada engraçada no fim",
  drama: "drama de família ou trabalho, com conflito real",
  suspense: "suspense, com tensão crescente e revelação no fim",
  emotivo: "emotivo, que aperta o coração sem ser piegas",
  cotidiano: "cotidiano, com um detalhe inesperado no meio",
};

export const generateStory = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        topic: z.string().min(3).max(400),
        tone: z.string().max(30).default("comedia"),
        durationSec: z.number().min(20).max(300).default(60),
        characters: z.number().min(2).max(6).default(3),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("A IA não está configurada neste projeto.");

    // ~2,6 falas por segundo de leitura é rápido demais; usamos ~1 fala a cada 2,4s
    const lineCount = Math.max(10, Math.min(80, Math.round(data.durationSec / 2.4)));

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Você escreve histórias originais em forma de conversa de aplicativo de mensagens, em português do Brasil, " +
              "para vídeos verticais curtos. Responda SOMENTE com JSON válido no formato " +
              '{"title":string,"characters":[{"name":string,"role":string,"gender":"masculina"|"feminina","age":"juvenil"|"teen"|"adulta"|"madura","isSelf":boolean}],' +
              '"lines":[{"speaker":string,"text":string,"kind":"text"|"card","thread":string,"emotion":string,"initial":boolean}]}. ' +
              "Regras: exatamente um personagem com isSelf true (o dono do celular); estrutura gancho → situação → conflito → escalada → " +
              "virada → desfecho; falas curtas e naturais, como gente digitando; use kind \"card\" para cortes de cena (ex.: \"Momentos antes\"); " +
              "use \"thread\" para separar conversas diferentes (ex.: \"Chefe\", \"Grupo da família\"); emotion entre neutral, happy, excited, " +
              "serious, nervous, annoyed, angry-theatrical, sad, sarcastic, surprised; nada de marcas reais, logos ou pessoas reais.",
          },
          {
            role: "user",
            content:
              `Tema: ${data.topic}\n` +
              `Tom: ${TONE_HINT[data.tone] ?? data.tone}\n` +
              `Duração alvo: ${data.durationSec} segundos\n` +
              `Personagens: ${data.characters}\n` +
              `Quantidade de falas: aproximadamente ${lineCount}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402) throw new Error("Seus créditos de IA acabaram. Adicione créditos para gerar histórias.");
      if (res.status === 429) throw new Error("Muitos pedidos ao mesmo tempo. Espere alguns segundos e tente de novo.");
      console.error(`Story falhou [${res.status}]: ${body.slice(0, 300)}`);
      throw new Error("Não foi possível criar a história agora.");
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
      title: z.string().default("Nova história"),
      characters: z
        .array(
          z.object({
            name: z.string().min(1),
            role: z.string().default(""),
            gender: z.enum(["masculina", "feminina", "neutra"]).optional(),
            age: z.enum(["juvenil", "teen", "adulta", "madura"]).optional(),
            isSelf: z.boolean().optional(),
          }),
        )
        .min(2),
      lines: z
        .array(
          z.object({
            speaker: z.string().default(""),
            text: z.string().default(""),
            kind: z.enum(["text", "card", "system"]).optional(),
            thread: z.string().optional(),
            emotion: z.string().optional(),
            initial: z.boolean().optional(),
          }),
        )
        .min(4),
    });

    const out = shape.safeParse(parsed);
    if (!out.success) throw new Error("A história voltou em um formato inesperado. Tente de novo.");

    const characters = out.data.characters.slice(0, 6);
    if (!characters.some((c) => c.isSelf)) characters[0]!.isSelf = true;

    return {
      title: out.data.title.slice(0, 90),
      characters,
      lines: out.data.lines.filter((l) => l.text.trim()).slice(0, 90),
    };
  });
