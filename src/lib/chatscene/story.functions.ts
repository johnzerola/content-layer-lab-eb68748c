/**
 * Gerador de histórias do ChatScene — roda no servidor, via IA da Lovable.
 *
 * A IA devolve apenas o roteiro (personagens e falas). A montagem do documento
 * fica em `story.ts`, para o mesmo roteiro sempre virar a mesma cena.
 */
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildStoryPrompt,
  parseGeneratedStory,
  storyBriefSchema,
  storyUsesReferenceTooClosely,
} from "./story-generation";

type StoryGatewayMessage = { role: "system" | "user" | "assistant"; content: string };

async function requestStory(apiKey: string, messages: StoryGatewayMessage[]): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("Seus créditos de IA acabaram. Adicione créditos para gerar histórias.");
    if (res.status === 429) throw new Error("Muitos pedidos ao mesmo tempo. Espere alguns segundos e tente de novo.");
    console.error(`Story falhou [${res.status}]: ${body.slice(0, 300)}`);
    throw new Error("Não foi possível criar a história agora.");
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

export const generateStory = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => storyBriefSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("A IA não está configurada neste projeto.");

    const messages = buildStoryPrompt(data) as StoryGatewayMessage[];
    const first = parseGeneratedStory(await requestStory(apiKey, messages), data.characters);
    if (!storyUsesReferenceTooClosely(data, first)) return first;

    const retryMessages: StoryGatewayMessage[] = [
      ...messages,
      {
        role: "user",
        content:
          "A tentativa anterior ficou próxima demais da referência. Gere outra história do zero: troque cenário, relação, objeto, cadeia causal, pista, virada e desfecho. Preserve apenas o DNA abstrato de gancho e ritmo. Não reaproveite a ordem dos eventos nem frases da entrada.",
      },
    ];
    const retry = parseGeneratedStory(await requestStory(apiKey, retryMessages), data.characters);
    if (storyUsesReferenceTooClosely(data, retry)) {
      throw new Error("A história gerada ainda ficou próxima demais da referência. Tente resumir a ideia em vez de colar a transcrição inteira.");
    }
    return retry;
  });
