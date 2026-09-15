import { describe, expect, it } from "vitest";
import { ConversationClockV3 } from "../clock-v3";
import { buildConversationPages } from "../page-manager";
import { FAST_GAMEPLAY_CHAT } from "../style-profile";
import { createChatSceneProject, createMessage, createParticipant } from "../types";
import { originalReferenceStory } from "../__fixtures__/original-reference-story";

const story = (count = 5) => createChatSceneProject({
  participants: [createParticipant({ id: "narrator" })],
  messages: Array.from({ length: count }, (_, i) => createMessage("narrator", { id: `m${i}`, text: "Uma história original.", voiceMs: 1000 })),
});
const options = { maxContentHeight: 400, measure: (messages: unknown[]) => messages.length * 100 };

describe("Clock V3 experimental", () => {
  it("compiles the original multi-character media fixture within 30–45 seconds", () => {
    const p = originalReferenceStory();
    const before = JSON.stringify(p);
    const clock = new ConversationClockV3(p, { ...options, measure: (messages) => messages.reduce((h, m) => h + (m.kind === "image" ? 220 : 80 + m.text.length), 0) });
    expect(clock.durationMs).toBeGreaterThanOrEqual(30000);
    expect(clock.durationMs).toBeLessThanOrEqual(45000);
    const { entries, pages } = clock.inspect();
    expect(pages.some((page) => page.reason === "EDITORIAL")).toBe(true);
    entries.slice(1).forEach((entry, i) => expect(entry.speechStartMs).toBeGreaterThanOrEqual(entries[i]!.speechEndMs));
    expect(JSON.stringify(p)).toBe(before);
  });
  it("keeps exact measured duration even for long text, without adding entrance or reading time", () => {
    const p = story(2);
    p.messages[0]!.text = "texto ".repeat(200);
    const clock = new ConversationClockV3(p, { ...options, style: { ...FAST_GAMEPLAY_CHAT, bubbleLeadMs: 30 } });
    const [a, b] = clock.inspect().entries;
    expect(a).toMatchObject({ appearMs: 0, speechStartMs: 30, speechEndMs: 1030, endMs: 1110 });
    expect(b!.appearMs).toBe(1110);
    expect(clock.getStateAt(29).activeAudio).toBeNull();
    expect(clock.getStateAt(30).activeAudio?.offsetMs).toBe(0);
    expect(clock.getStateAt(1030).activeAudio).toBeNull();
  });
  it("recalculates after audio arrives, retains seek determinism and isolates returned state", () => {
    const p = story(2);
    p.messages[0]!.voiceMs = null;
    const estimated = new ConversationClockV3(p, options);
    expect(estimated.inspect().entries[0]!.durationSource).toBe("ESTIMATED_TEXT");
    expect(estimated.getStateAt(1).activeAudio).toBeNull();
    p.messages[0]!.voiceMs = 2300;
    const real = new ConversationClockV3(p, options);
    expect(real.inspect().entries[1]!.appearMs).toBe(2380);
    const before = real.getStateAt(100);
    real.getStateAt(2500);
    expect(real.getStateAt(100)).toEqual(before);
    real.inspect().pages[0]!.messageIds.length = 0;
    p.messages.length = 0;
    expect(real.getStateAt(100)).toEqual(before);
  });
  it("resets on overflowing fifth message and keeps absolute gameplay time", () => {
    const clock = new ConversationClockV3(story(), options);
    const last = clock.inspect().entries[4]!;
    expect(clock.getStateAt(last.appearMs - 1).visibleMessageIds).toHaveLength(4);
    expect(clock.getStateAt(last.appearMs).visibleMessageIds).toEqual(["m4"]);
    expect(clock.getStateAt(last.appearMs).backgroundTimeMs).toBe(last.appearMs);
  });
  it("uses actual height, not a hardcoded count of four", () => {
    const clock = new ConversationClockV3(story(7), { ...options, measure: (m) => m.length * 50 });
    expect(clock.inspect().pages).toHaveLength(1);
  });
  it("handles empty and single-message projects", () => {
    expect(new ConversationClockV3(story(0), options).getStateAt(0).pageId).toBeNull();
    expect(new ConversationClockV3(story(1), options).inspect().pages).toHaveLength(1);
  });
  it("honors editorial reset IDs and rejects unsupported time stretching", () => {
    const p = story(4);
    const clock = new ConversationClockV3(p, { ...options, resetBeforeMessageIds: ["m2"] });
    expect(clock.inspect().pages[1]!.reason).toBe("EDITORIAL");
    p.timing.speed = 2;
    expect(() => new ConversationClockV3(p, options)).toThrow("speed 1");
  });
  it("rejects invalid durations, duplicate identities, invalid budgets and silent unknown resets", () => {
    const p = story(2);
    p.messages[0]!.voiceMs = Number.NaN;
    expect(() => new ConversationClockV3(p, options)).toThrow();
    expect(() => new ConversationClockV3(story(), { ...options, maxContentHeight: 0 })).toThrow();
    expect(() => new ConversationClockV3(story(), { ...options, resetBeforeMessageIds: ["missing"] })).toThrow();
    const dup = story(2); dup.messages[1]!.id = dup.messages[0]!.id;
    expect(() => new ConversationClockV3(dup, options)).toThrow("Duplicate");
  });
});

describe("page manager", () => {
  it("reports an oversized media/text message without dropping it or producing an empty page", () => {
    const entries = story(3).messages.map((message, i) => ({ message, startMs: i * 1000, sessionId: "main" }));
    entries[1]!.message.kind = "image";
    const pages = buildConversationPages(entries, (ms) => ms.reduce((h, m) => h + (m.kind === "image" ? 700 : 100), 0), 400, 12);
    expect(pages.map((p) => p.messageIds)).toEqual([["m0"], ["m1"], ["m2"]]);
    expect(pages[1]!.overflowMessageIds).toEqual(["m1"]);
  });
  it("resets returning sessions instead of restoring old page history", () => {
    const entries = story(3).messages.map((message, i) => ({ message, startMs: i * 1000, sessionId: i === 1 ? "other" : "main" }));
    const pages = buildConversationPages(entries, options.measure, 400, 12);
    expect(pages).toHaveLength(3);
    expect(pages[2]!.messageIds).toEqual(["m2"]);
  });
});
