import { z } from "zod";
import { VOICE_DIRECTION_MAX_CHARS } from "./voice";

/** Shared request contract; acting, identity and timbre must reach synthesis intact. */
export const voiceSynthesisInput = z.object({
  text: z.string().min(1).transform((text) => text.slice(0, 600)),
  voice: z.string().min(1).max(40),
  direction: z.string().transform((direction) => direction.slice(0, VOICE_DIRECTION_MAX_CHARS)).optional(),
  speed: z.number().min(0.7).max(1.3).optional(),
});
