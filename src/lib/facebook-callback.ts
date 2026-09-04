import { z } from "zod";

const metaSearchText = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value))
  .optional();

export const facebookCallbackSearch = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: metaSearchText,
  error_code: metaSearchText,
  error_reason: metaSearchText,
  error_description: metaSearchText,
});
