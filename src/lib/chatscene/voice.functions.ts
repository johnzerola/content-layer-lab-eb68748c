/**
 * Síntese de fala do ChatScene — sempre no servidor.
 *
 * O provedor padrão é a IA da Lovable (nenhuma chave fica no navegador). O
 * cliente só envia o texto e a voz genérica escolhida; nunca envia amostras de
 * voz de pessoas reais, porque o produto não faz clonagem.
 */
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { voiceSynthesisInput } from "./voice-request";

export function resolveVoiceProviderConfig(env: Record<string, string | undefined>) {
  if (env["LOVABLE_API_KEY"]) {
    return {
      key: env["LOVABLE_API_KEY"],
      endpoint: "https://ai.gateway.lovable.dev/v1/audio/speech",
      model: "openai/gpt-4o-mini-tts",
    };
  }
  if (env["OPENAI_API_KEY"]) {
    return {
      key: env["OPENAI_API_KEY"],
      endpoint: "https://api.openai.com/v1/audio/speech",
      model: "gpt-4o-mini-tts",
    };
  }
  return null;
}

export const synthesizeVoice = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => voiceSynthesisInput.parse(input))
  .handler(async ({ data }) => {
    const provider = resolveVoiceProviderConfig(process.env);
    if (!provider) throw new Error("A geração de voz ainda não tem uma chave configurada no servidor.");

    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        input: data.text,
        voice: data.voice,
        response_format: "mp3",
        speed: data.speed ?? 1,
        // o idioma nunca é opcional: o estilo pedido é somado ao português do Brasil
        instructions:
          data.direction ??
          "Você é um ator brasileiro de dublagem. Fale em português do Brasil (pt-BR) com pronúncia brasileira natural, interpretando a fala com respiração, micro-pausas e variação de entonação, sem soar robótico ou de locutor.",
      }),
    });

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
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
      console.error(`TTS falhou [${res.status}] no provedor configurado.`);
      throw new Error("Não foi possível gerar esta fala agora.");
    }

    const buffer = await res.arrayBuffer();
    return {
      mime: "audio/mpeg",
      audio: Buffer.from(buffer).toString("base64"),
    };
  });
