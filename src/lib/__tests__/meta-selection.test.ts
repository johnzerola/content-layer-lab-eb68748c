import { describe, expect, it } from "vitest";
import {
  createMetaSelection,
  metaChannelKey,
  metaSelectionCandidates,
  openMetaSelection,
} from "@/lib/meta-selection.server";
import type { FacebookPage } from "@/lib/facebook-oauth.server";

const environment = {
  SOCIAL_TOKEN_ENCRYPTION_KEY: "selection-test-key-with-more-than-32-characters",
} as NodeJS.ProcessEnv;

const pages: FacebookPage[] = [
  {
    pageId: "103110314580314",
    name: "Minha marca",
    pageAccessToken: "page-token-one",
    instagram: {
      id: "17841404963501636",
      username: "minhamarca",
    },
  },
  {
    pageId: "391439484568257",
    name: "Minha marca",
    pageAccessToken: "page-token-two",
    instagram: null,
  },
];

describe("Meta account selection", () => {
  it("keeps channels with repeated names separate by provider id", () => {
    const candidates = metaSelectionCandidates(pages);
    expect(candidates.map((candidate) => candidate.key)).toEqual([
      "facebook:103110314580314",
      "instagram:17841404963501636",
      "facebook:391439484568257",
    ]);
    expect(new Set(candidates.map((candidate) => candidate.key)).size).toBe(3);
    expect(metaChannelKey("facebook", pages[0]!.pageId)).toBe("facebook:103110314580314");
  });

  it("removes duplicate channels returned by Meta", () => {
    expect(
      metaSelectionCandidates([pages[0]!, pages[0]!]).map((candidate) => candidate.key),
    ).toEqual(["facebook:103110314580314", "instagram:17841404963501636"]);
  });

  it("returns safe candidates and opens the encrypted payload for the same user", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");
    const selection = createMetaSelection({
      userId: "user-1",
      pages,
      tokenExpiresAt: new Date("2026-10-30T12:00:00.000Z"),
      now,
      environment,
    });

    expect(JSON.stringify(selection.candidates)).not.toContain("page-token");
    expect(selection.selectionToken).not.toContain("page-token");
    expect(
      openMetaSelection({
        selectionToken: selection.selectionToken,
        userId: "user-1",
        now: now + 1_000,
        environment,
      }).pages,
    ).toEqual(pages);
  });

  it("rejects another user, tampering and expired selections", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");
    const selection = createMetaSelection({
      userId: "user-1",
      pages,
      tokenExpiresAt: new Date("2026-10-30T12:00:00.000Z"),
      now,
      environment,
    });

    expect(() =>
      openMetaSelection({
        selectionToken: selection.selectionToken,
        userId: "user-2",
        now,
        environment,
      }),
    ).toThrow(/outro usu.rio/);
    expect(() =>
      openMetaSelection({
        selectionToken: `${
          selection.selectionToken.startsWith("a") ? "b" : "a"
        }${selection.selectionToken.slice(1)}`,
        userId: "user-1",
        now,
        environment,
      }),
    ).toThrow(/inv.lida ou expirou/);
    expect(() =>
      openMetaSelection({
        selectionToken: selection.selectionToken,
        userId: "user-1",
        now: now + 16 * 60 * 1_000,
        environment,
      }),
    ).toThrow("expirou");
  });
});
