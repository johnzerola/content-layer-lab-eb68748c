import { z } from "zod";
import { VOICE_DIRECTION_MAX_CHARS } from "./voice";

const voiceTransformConfigInput = z.object({
  mode: z.enum(["VARISPEED", "TEMPO_ONLY", "PITCH_ONLY", "SPEED_AND_PITCH", "VARISPEED_THEN_RESTORE_TEMPO"]),
  speedMultiplier: z.number().min(0.25).max(4),
  pitchSemitones: z.number().min(-12).max(12),
  linkedPitchToSpeed: z.boolean(),
  preservePitch: z.boolean(),
  preserveFormants: z.boolean(),
  normalization: z.object({
    enabled: z.boolean(),
    integratedLufs: z.number().min(-30).max(-12),
    truePeakDb: z.number().min(-6).max(-1),
    loudnessRange: z.number().min(1).max(20),
  }),
  outputCodec: z.literal("mp3"),
});

/** Shared request contract; acting, identity and timbre must reach synthesis intact. */
export const voiceSynthesisInput = z.object({
  text: z.string().min(1).transform((text) => text.slice(0, 600)),
  voice: z.string().min(1).max(40),
  provider: z.enum(["lovable-ai", "kokoro", "elevenlabs", "piper", "chatterbox"]).optional(),
  referenceId: z.string().uuid().optional(),
  direction: z.string().transform((direction) => direction.slice(0, VOICE_DIRECTION_MAX_CHARS)).optional(),
  speed: z.number().min(0.7).max(1.3).optional(),
  transform: z.object({
    presetId: z.string().min(1).max(80),
    config: voiceTransformConfigInput,
  }).optional(),
});
