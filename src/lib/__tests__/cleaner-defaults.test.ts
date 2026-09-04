import { describe, expect, it } from "vitest";
import {
  CLEANER_DEFAULT_CROP,
  CLEANER_DEFAULT_ENHANCE,
  CLEANER_DEFAULT_MODE,
  CLEANER_DEFAULT_PRESET,
  CLEANER_DEFAULT_STRATEGY,
  MODE_LABEL,
} from "../cleaner";

describe("CleanerIA defaults", () => {
  it("starts with full-frame inpainting and quality enhancement", () => {
    expect(CLEANER_DEFAULT_MODE).toBe("subtitle");
    expect(CLEANER_DEFAULT_PRESET).toBe("quality");
    expect(CLEANER_DEFAULT_STRATEGY).toBe("inpaint");
    expect(CLEANER_DEFAULT_CROP).toBe(false);
    expect(CLEANER_DEFAULT_ENHANCE).toBe(true);
    expect(MODE_LABEL[CLEANER_DEFAULT_MODE]).toBe("Legenda");
  });
});
