import { describe, expect, it } from "vitest";
import { messageEntranceTransform } from "../draw";

describe("ChatScene message entrance", () => {
  it("reveals only from the bottom when the conversation panel grows", () => {
    const project = {
      animation: "bubble-pop" as const,
      motion: { intensity: 2 },
      layout: { autoHeight: true },
    };
    expect(messageEntranceTransform(project, 0)).toEqual({ alpha: 1, dy: 0, scale: 1 });
    expect(messageEntranceTransform(project, 0.5)).toEqual({ alpha: 1, dy: 0, scale: 1 });
  });

  it("keeps the selected entrance preset on fixed-height conversations", () => {
    const transform = messageEntranceTransform({ animation: "bubble-pop", layout: { autoHeight: false } }, 0);
    expect(transform.scale).toBeLessThan(1);
  });
});
