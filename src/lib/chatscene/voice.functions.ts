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
import { effectiveTransformPitch, selectionFromTransformPreset } from "./voice-transform";
import { z } from "zod";

import {
  deleteRemoteVoiceReference,
  remoteCloneEngineStatus,
  remoteVoiceServiceConfigured,
  saveRemoteVoiceReference,
  synthesizeRemoteVoice,
  warmRemoteCloneEngine,
} from "./voice-clone.remote.server";

export const getVoiceEngineStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    const remote = await remoteCloneEngineStatus();
    if (remote) return { clone: remote, piper: false };
    // Do not import the Node-only worker in an edge deployment unless the
    // runtime explicitly advertises a local installation.
    if (
      process.env["CHATSCENE_VOICE_PYTHON_PATH"] &&
      process.env["CHATSCENE_VOICE_MODEL_PATH"] &&
      process.env["CHATSCENE_VOICE_STORAGE_PATH"]
    ) {
      const { verifiedCloneEngineStatus } = await import("./voice-clone.server");
      const { getPiperLocalStatus } = await import("./voice-piper.server");
      return { clone: await verifiedCloneEngineStatus(), piper: getPiperLocalStatus().available };
    }
    return {
      clone: { installed: false, device: "not-configured", modelLoaded: false, warming: false },
      piper: false,
    };
  });

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
  .handler(async ({ data, context }) => {
    if (remoteVoiceServiceConfigured()) {
      return saveRemoteVoiceReference(context.userId, data.audio);
    }
    const { saveVoiceReference } = await import("./voice-clone.server");
    return saveVoiceReference(context.userId, data.audio);
  });

export const prepareVoiceEngine = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    if (remoteVoiceServiceConfigured()) return warmRemoteCloneEngine();
    const { warmCloneEngine } = await import("./voice-clone.server");
    return warmCloneEngine();
  });

export const removeVoiceReference = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (remoteVoiceServiceConfigured()) {
      await deleteRemoteVoiceReference(context.userId, data.id);
      return { removed: true };
    }
    const { deleteVoiceReference } = await import("./voice-clone.server");
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

function nativeVoicePipelineConfigured() {
  return Boolean(
    process.env["CHATSCENE_VOICE_PYTHON_PATH"] &&
      process.env["CHATSCENE_VOICE_MODEL_PATH"] &&
      process.env["CHATSCENE_VOICE_STORAGE_PATH"],
  );
}

export const synthesizeVoice = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => voiceSynthesisInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.provider === "chatterbox" && !data.referenceId)
      throw new Error("Envie a referência de voz deste personagem.");
    const isClone = data.provider === "chatterbox";
    const isElevenLabs = data.provider === "elevenlabs";
    const localRequested = data.provider === "piper" || isClone;
    const provider = localRequested || isElevenLabs ? null : resolveVoiceProviderConfig(process.env);
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

    if (isElevenLabs) {
      const { resolveElevenLabsApiKey, synthesizeElevenLabs } = await import(
        "@/lib/elevenlabs.server"
      );
      const apiKey = await resolveElevenLabsApiKey(context.userId);
      const settings = data.providerSettings;
      buffer = await synthesizeElevenLabs({
        apiKey,
        voiceId: data.voice,
        text: data.text,
        speed: data.speed ?? 1,
        stability: settings?.stability ?? 0.38,
        similarityBoost: settings?.similarityBoost ?? 0.78,
        style: settings?.style ?? 0.42,
        speakerBoost: settings?.speakerBoost ?? true,
        modelId: settings?.modelId ?? "eleven_flash_v2_5",
      });
      providerName = "elevenlabs";
    } else if (isClone) {
      if (remoteVoiceServiceConfigured()) {
        buffer = Buffer.from(
          await synthesizeRemoteVoice(context.userId, data.referenceId!, data.text),
          "base64",
        );
      } else {
        const { synthesizeClonedVoice } = await import("./voice-clone.server");
        buffer = await synthesizeClonedVoice(context.userId, data.referenceId!, data.text);
      }
      mime = "audio/wav";
      providerName = "chatterbox";
    } else if (res) {
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      const { getPiperLocalStatus, synthesizePiperWav } = await import("./voice-piper.server");
      if (getPiperLocalStatus().available) {
        buffer = await synthesizePiperWav(data.text, data.speed ?? 1);
        mime = "audio/wav";
        providerName = "piper-local";
      } else {
        throw new Error(
          "Nenhum gerador de voz está disponível. Instale a voz local Piper ou configure uma chave no servidor.",
        );
      }
    }
    const transform =
      data.transform ?? (isClone ? selectionFromTransformPreset("adam_natural") : undefined);
    // FFmpeg pitch/tempo transforms run only in the Node worker. The published
    // edge runtime still returns the valid provider audio instead of trying to
    // load node:child_process and failing after a successful synthesis.
    if (transform && nativeVoicePipelineConfigured()) {
      const { voiceTransformEngine } = await import("./voice-transform.server");
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
