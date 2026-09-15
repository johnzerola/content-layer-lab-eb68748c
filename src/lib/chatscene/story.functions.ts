/**
 * Gerador de histórias do ChatScene — roda no servidor, via IA da Lovable.
 *
 * A IA devolve apenas o roteiro (personagens e falas). A montagem do documento
 * fica em `story.ts`, para o mesmo roteiro sempre virar a mesma cena.
 */
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildStoryPrompt, parseGeneratedStory, storyBriefSchema } from "./story-generation";

export const generateStory = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => storyBriefSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("A IA não está configurada neste projeto.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: buildStoryPrompt(data),
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
    return parseGeneratedStory(raw, data.characters);
  });
