import { describe, expect, it } from "vitest";
import { safeRemoteUrl } from "@/lib/remote-url";
import { isBlockedIp } from "@/lib/remote-url.server";

describe("remote media URL validation", () => {
  it("accepts plain public HTTP URLs", () => {
    expect(safeRemoteUrl("https://cdn.example.com/video.mp4")?.hostname).toBe("cdn.example.com");
  });

  it.each([
    "http://127.0.0.1/video.mp4",
    "http://10.0.0.1/video.mp4",
    "http://169.254.169.254/latest/meta-data",
    "http://user:password@example.com/video.mp4",
    "file:///etc/passwd",
  ])("rejects unsafe URL %s", (url) => {
    expect(safeRemoteUrl(url)).toBeNull();
  });
});

describe("resolved IP validation", () => {
  it.each(["::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1"])(
    "blocks private IPv6 address %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true),
  );

  it.each(["2800:3f0:4001:41::8", "2606:4700:4700::1111", "8.8.8.8"])(
    "accepts public address %s",
    (ip) => expect(isBlockedIp(ip)).toBe(false),
  );
});
