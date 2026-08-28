import { describe, expect, it } from "vitest";
import { supportsKind, validateMediaForPlatform } from "@/lib/platform-media";

describe("platform-media", () => {
  it("aceita um Reels vertical dentro dos limites", () => {
    const result = validateMediaForPlatform("instagram", "reels", {
      durationSec: 45,
      width: 1080,
      height: 1920,
      sizeBytes: 40 * 1024 * 1024,
      format: "mp4",
      captionLength: 120,
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("recusa Reels acima da duração máxima do Instagram", () => {
    const result = validateMediaForPlatform("instagram", "reels", {
      durationSec: 240,
      width: 1080,
      height: 1920,
      format: "mp4",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.field === "duration")).toBe(true);
  });

  it("recusa vídeo horizontal em Shorts e formato inválido", () => {
    const result = validateMediaForPlatform("youtube", "shorts", {
      durationSec: 30,
      width: 1920,
      height: 1080,
      format: "avi",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["aspect", "format"]),
    );
  });

  it("avisa sem bloquear quando a proporção é apenas próxima de 9:16", () => {
    const result = validateMediaForPlatform("tiktok", "reels", {
      durationSec: 30,
      width: 1000,
      height: 1920,
      format: "mp4",
    });
    expect(result.ok).toBe(true);
    expect(result.issues[0]?.level).toBe("warning");
  });

  it("bloqueia legenda acima do limite", () => {
    const result = validateMediaForPlatform("instagram", "feed", {
      durationSec: 20,
      width: 1080,
      height: 1080,
      format: "mp4",
      captionLength: 5000,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.field === "caption")).toBe(true);
  });

  it("sabe quais formatos cada plataforma suporta", () => {
    expect(supportsKind("instagram", "stories")).toBe(true);
    expect(supportsKind("tiktok", "reels")).toBe(true);
    expect(supportsKind("youtube", "shorts")).toBe(true);
  });
});
