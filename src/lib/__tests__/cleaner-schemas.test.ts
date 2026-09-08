import { describe, expect, it } from "vitest";
import { cleanerRegionSchema } from "@/lib/cleaner.schemas";

describe("Cleaner region transport", () => {
  const region = { id: "logo-1", kind: "rect", role: "remove", x: 0.1, y: 0.05, w: 0.2, h: 0.1 };

  it("preserves whole-graphic masking through server validation", () => {
    expect(cleanerRegionSchema.parse({ ...region, mask_kind: "graphic" }).mask_kind).toBe("graphic");
  });

  it("keeps ordinary text regions compatible without enabling whole-region masking", () => {
    expect(cleanerRegionSchema.parse(region).mask_kind).toBeUndefined();
  });

  it("rejects unsupported mask modes", () => {
    expect(cleanerRegionSchema.safeParse({ ...region, mask_kind: "arbitrary" }).success).toBe(false);
  });
});
