import { describe, expect, it } from "vitest";
import { shouldTryWorkerResolver } from "@/lib/import.functions";

describe("link import resolver selection", () => {
  it("tries the worker first for recognized social platforms when configured", () => {
    expect(shouldTryWorkerResolver("youtube", "youtube.com", true)).toBe(true);
    expect(shouldTryWorkerResolver("instagram", "instagram.com", true)).toBe(true);
    expect(shouldTryWorkerResolver("tiktok", "tiktok.com", true)).toBe(true);
  });

  it("keeps direct file hosts on the lightweight resolver path", () => {
    expect(shouldTryWorkerResolver("cdn.example.com", "cdn.example.com", true)).toBe(false);
    expect(shouldTryWorkerResolver("youtube", "youtube.com", false)).toBe(false);
  });
});
