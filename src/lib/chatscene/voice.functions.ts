/**
 * Síntese de fala do ChatScene — sempre no servidor.
 *
 * O provedor padrão é a IA da Lovable (nenhuma chave fica no navegador). O
 * Referências autorizadas são armazenadas privadamente por conta. O cliente
 * envia apenas o identificador ao sintetizar; chaves e caminhos ficam no servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { voiceSynthesisInput } from "./voice-request";
import { voiceTransformEngine } from "./voice-transform.server";
import { getPiperLocalStatus, synthesizePiperWav } from "./voice-piper.server";
import {
  deleteVoiceReference,
  saveVoiceReference,
  synthesizeClonedVoice,
  verifiedCloneEngineStatus,
} from "./voice-clone.server";
import { effectiveTransformPitch, selectionFromTransformPreset } from "./voice-transform";
import { z } from "zod";

export const getVoiceEngineStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => ({
    clone: await verifiedCloneEngineStatus(),
    piper: getPiperLocalStatus().available,
  }));

export const uploadVoiceReference = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        audio: z
          .string()
          .min(1)
          .max(16 * 1024 * 1024),
        authorized: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => saveVoiceReference(context.userId, data.audio));

export const removeVoiceReference = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await deleteVoiceReference(context.userId, data.id);
    return { removed: true };
  });

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
  .handler(async ({ data, context }) => {
    if (data.provider === "chatterbox" && !data.referenceId)
      throw new Error("Envie a referência de voz deste personagem.");
    const isClone = data.provider === "chatterbox";
    const localRequested = data.provider === "piper" || isClone;
    const provider = localRequested ? null : resolveVoiceProviderConfig(process.env);
    let buffer: Buffer;
    let mime = "audio/mpeg";
    let providerName = "gateway";
    const res = provider
      ? await fetch(provider.endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: provider.model,
            input: data.text,
            voice: data.voice,
            // Transformações recebem PCM/WAV e fazem uma única codificação final.
            response_format: data.transform ? "wav" : "mp3",
            speed: data.speed ?? 1,
            // o idioma nunca é opcional: o estilo pedido é somado ao português do Brasil
            instructions:
              data.direction ??
              "Você é um ator brasileiro de dublagem. Fale em português do Brasil (pt-BR) com pronúncia brasileira natural, interpretando a fala com respiração, micro-pausas e variação de entonação, sem soar robótico ou de locutor.",
          }),
        })
      : null;

    if (res && !res.ok) {
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

    if (isClone) {
      buffer = await synthesizeClonedVoice(context.userId, data.referenceId!, data.text);
      mime = "audio/wav";
      providerName = "chatterbox";
    } else if (res) {
      buffer = Buffer.from(await res.arrayBuffer());
    } else if (getPiperLocalStatus().available) {
      buffer = await synthesizePiperWav(data.text, data.speed ?? 1);
      mime = "audio/wav";
      providerName = "piper-local";
    } else {
      throw new Error(
        "Nenhum gerador de voz está disponível. Instale a voz local Piper ou configure uma chave no servidor.",
      );
    }
    const transform =
      data.transform ?? (isClone ? selectionFromTransformPreset("adam_natural") : undefined);
    if (transform) {
      // Chatterbox produces a natural-speed base. Apply requested tempo only once.
      const sourceSpeed = ["PITCH_ONLY", "VARISPEED_THEN_RESTORE_TEMPO"].includes(
        transform.config.mode,
      )
        ? 1
        : transform.config.speedMultiplier;
      const config = isClone
        ? {
            ...transform.config,
            mode: "SPEED_AND_PITCH" as const,
            linkedPitchToSpeed: false,
            preservePitch: false,
            pitchSemitones: effectiveTransformPitch(transform.config),
            speedMultiplier: sourceSpeed * (data.speed ?? 1),
          }
        : transform.config;
      const transformed = await voiceTransformEngine.transform(buffer, config, transform.presetId);
      return {
        mime: transformed.mime,
        audio: transformed.audio.toString("base64"),
        provider: providerName,
        transform: {
          cacheHit: transformed.cacheHit,
          sourceDurationSec: transformed.source.durationSec,
          outputDurationSec: transformed.output.durationSec,
          sampleRate: transformed.output.sampleRate,
          channels: transformed.output.channels,
          effectivePitchSemitones: transformed.effectivePitchSemitones,
          peakDb: transformed.output.peakDb,
          meanVolumeDb: transformed.output.meanVolumeDb,
          processingMs: transformed.processingMs,
        },
      };
    }
    return {
      mime,
      audio: buffer.toString("base64"),
      provider: providerName,
    };
  });
