import { describe, expect, it, vi } from "vitest";
import { buildPlan } from "../clock";
import { conversationPagesFor, layoutMessages, paintFrame, type Ctx2D } from "../draw";
import { createCreatorExample } from "../creator-presets";
import {
  fitNarrativeText,
  narrativeCardRect,
  narrativeMessageAt,
  wrapNarrativeText,
} from "../reddit-draw";
import { resolveTheme } from "../theme";
import {
  createChatSceneProject,
  createMessage,
  DEFAULT_LAYOUT,
  normalizeChatSceneProject,
  type ChatSceneProject,
} from "../types";
import { deserializeChatSceneProject, serializeChatSceneProject } from "../serialize";
import type { LoadedMedia } from "../media";

function canvasRecorder() {
  const operations: unknown[][] = [];
  const state: Record<string, unknown> = { font: "16px sans-serif", globalAlpha: 1 };
  const stack: Record<string, unknown>[] = [];
  const measureText = vi.fn((text: string) => ({
    width:
      Array.from(text).length *
      (Number(String(state["font"]).match(/([\d.]+)px/u)?.[1]) || 16) *
      0.52,
  }));
  const methods: Record<string, unknown> = {
    measureText,
    save: () => {
      stack.push({ ...state });
      operations.push(["save"]);
    },
    restore: () => {
      Object.assign(state, stack.pop());
      operations.push(["restore"]);
    },
    createLinearGradient: () => ({
      addColorStop: (...args: unknown[]) => operations.push(["addColorStop", ...args]),
    }),
  };
  const ctx = new Proxy(state, {
    get: (target, prop: string) =>
      prop in methods
        ? methods[prop]
        : prop in target
          ? target[prop]
          : (...args: unknown[]) => operations.push([prop, ...args]),
    set: (target, prop: string, value) => {
      target[prop] = value;
      operations.push(["set", prop, value]);
      return true;
    },
  }) as unknown as Ctx2D;
  return {
    ctx,
    operations,
    measureText,
    texts: () => operations.filter((op) => op[0] === "fillText").map((op) => String(op[1])),
  };
}

function projectWithMessages(
  count = 20,
  text = "Mensagem que ocupa espaço real na conversa.",
): ChatSceneProject {
  const project = createChatSceneProject({ animation: "fade", dark: true });
  return {
    ...project,
    camera: { ...project.camera!, mode: "off" },
    layout: { ...DEFAULT_LAYOUT, pagination: "pages" },
    timing: { ...project.timing, typing: false },
    messages: Array.from({ length: count }, (_, i) =>
      createMessage(project.participants[i % 2]!.id, {
        id: `message-${i}`,
        text: `${i}: ${text}`,
        typingMs: 0,
      }),
    ),
  };
}
const theme = resolveTheme("zap", true);

describe("Canvas story formats", () => {
  it("shows sender names only in group threads, not every thread in a multi-person cast", () => {
    const project = createCreatorExample("whatsapp");
    const ctx = canvasRecorder().ctx;
    const privateMessages = project.messages.filter((m) => m.threadId === project.threads![0]!.id);
    const groupMessages = project.messages.filter((m) => m.threadId === project.threads![1]!.id);
    expect(
      layoutMessages(ctx, project, theme, privateMessages, 928, 1200).items.some((m) => m.showName),
    ).toBe(false);
    expect(
      layoutMessages(ctx, project, theme, groupMessages, 928, 1200).items.some((m) => m.showName),
    ).toBe(true);
  });

  it("keeps more than one short bubble on the first 16:9 page", () => {
    const project = createCreatorExample("whatsapp");
    const pages = conversationPagesFor(
      canvasRecorder().ctx,
      project,
      theme,
      buildPlan(project),
      1651,
      680,
      true,
      undefined,
      680,
    );
    expect(pages[0]?.messageIds.length).toBeGreaterThanOrEqual(2);
  });
  it("defaults old documents to WhatsApp/scroll and persists the chosen format/pages", () => {
    const legacy = normalizeChatSceneProject({ title: "Legado" });
    expect(legacy.storyFormat).toBe("whatsapp");
    expect(legacy.layout?.pagination).toBe("scroll");
    const project = createChatSceneProject({
      storyFormat: "reddit",
      layout: { ...DEFAULT_LAYOUT, pagination: "pages" },
    });
    const restored = deserializeChatSceneProject(serializeChatSceneProject(project));
    expect(restored.storyFormat).toBe("reddit");
    expect(restored.layout?.pagination).toBe("pages");
  });

  it("keeps legacy WhatsApp Canvas operations unchanged when the format is absent", () => {
    const project = projectWithMessages(3);
    project.layout = { ...DEFAULT_LAYOUT };
    delete project.storyFormat;
    const plan = buildPlan(project);
    const before = canvasRecorder();
    const after = canvasRecorder();
    paintFrame(before.ctx, project, theme, plan, plan.totalFrames - 1, 1080, 1920);
    paintFrame(
      after.ctx,
      { ...project, storyFormat: "whatsapp" },
      theme,
      plan,
      plan.totalFrames - 1,
      1080,
      1920,
    );
    expect(after.operations).toEqual(before.operations);
  });

  it("selects narrative blocks from actual appearance frames and keeps pauses deterministic", () => {
    const project = projectWithMessages(3);
    const plan = buildPlan(project);
    const second = plan.entries[1]!;
    expect(narrativeMessageAt(project, plan, -1)).toBeNull();
    expect(narrativeMessageAt(project, plan, second.appearFrame - 1)?.id).toBe(
      project.messages[0]!.id,
    );
    expect(narrativeMessageAt(project, plan, second.appearFrame)?.id).toBe(project.messages[1]!.id);
    expect(narrativeMessageAt(project, plan, plan.totalFrames)?.id).toBe(project.messages[2]!.id);
    expect(narrativeMessageAt(project, plan, second.appearFrame)?.id).toBe(project.messages[1]!.id);
  });

  it("renders the active source and full block through paintFrame, without fabricated counters", () => {
    const project = projectWithMessages(2);
    project.storyFormat = "reddit";
    project.title = "Um relato original";
    project.threads = [
      {
        id: "a",
        name: "A",
        storySource: {
          kind: "reddit-story",
          title: "Origem A",
          author: "autora_a",
          community: "relatos_a",
          sourceUrl: null,
          importMode: "pasted-text",
        },
      },
      {
        id: "b",
        name: "B",
        storySource: {
          kind: "reddit-story",
          title: "Origem B",
          author: "autor_b",
          community: "relatos_b",
          sourceUrl: null,
          importMode: "pasted-text",
        },
      },
    ];
    project.messages[0]!.threadId = "a";
    project.messages[1]!.threadId = "b";
    const plan = buildPlan(project);
    const canvas = canvasRecorder();
    paintFrame(canvas.ctx, project, theme, plan, plan.entries[1]!.appearFrame, 1080, 1920);
    const text = canvas.texts().join(" ");
    expect(text).toContain("Origem B");
    expect(text).not.toContain("Um relato original");
    expect(text).toContain("r/relatos_b");
    expect(text).toContain("u/autor_b");
    expect(text).toContain(project.messages[1]!.text);
    expect(text).not.toMatch(/autora_a|relatos_a|votes|votos|likes|curtidas|21:14/u);
  });

  it.each([
    [1080, 1920],
    [1080, 1080],
    [1920, 1080],
  ])(
    "fits long text and unbroken tokens in %i × %i without dropping characters",
    (width, height) => {
      const canvas = canvasRecorder();
      const rect = narrativeCardRect(width, height);
      expect(rect.y).toBeGreaterThanOrEqual(height * 0.12);
      expect(rect.y + rect.maxHeight).toBeLessThanOrEqual(height * 0.82);
      const text =
        `Uma história extensa, mas completa. ${"palavramuitolonga".repeat(30)} ${"Continuação. ".repeat(35)}`.trim();
      const fit = fitNarrativeText(
        canvas.ctx,
        text,
        rect.width - 72,
        rect.maxHeight * 0.5,
        52,
        theme.fontFamily,
      );
      canvas.ctx.font = `600 ${fit.fontSize}px ${theme.fontFamily}`;
      expect(fit.lines.join("").replace(/\s/gu, "")).toBe(text.replace(/\s/gu, ""));
      expect(fit.height).toBeLessThanOrEqual(rect.maxHeight * 0.5);
      expect(
        Math.max(...fit.lines.map((line) => canvas.ctx.measureText(line).width)),
      ).toBeLessThanOrEqual(rect.width - 72);
    },
  );

  it("preserves manual paragraphs and Unicode code points in narrative wrapping", () => {
    const canvas = canvasRecorder();
    const text = "Primeiro parágrafo.\n\nSegundo com 🧡 e ação.";
    const lines = wrapNarrativeText(canvas.ctx, text, 130);
    expect(lines).toContain("");
    expect(lines.join("").replace(/\s/gu, "")).toBe(text.replace(/\s/gu, ""));
  });

  it("keeps background video on absolute time across Reddit block changes", () => {
    const project = projectWithMessages(2);
    project.storyFormat = "reddit";
    project.background = { kind: "video", videoUrl: "fixture:background", loop: true };
    const frames = Array.from(
      { length: 100 },
      (_, index) => ({ index }) as unknown as CanvasImageSource,
    );
    const media = new Map<string, LoadedMedia>([
      [
        "fixture:background",
        { frames, fps: 10, width: 100, height: 100, aspect: 1, animated: true, transparent: false },
      ],
    ]);
    const plan = buildPlan(project);
    const frame = plan.entries[1]!.appearFrame + 3;
    const canvas = canvasRecorder();
    paintFrame(canvas.ctx, project, theme, plan, frame, 1080, 1920, { media });
    const expected = frames[Math.floor(((frame / plan.fps) % 10) * 10)];
    expect(canvas.operations.find((op) => op[0] === "drawImage")?.[1]).toBe(expected);
  });

  it("leaves the video background transparent when native preview playback is active", () => {
    const project = projectWithMessages(2);
    project.background = { kind: "video", videoUrl: "fixture:background", loop: true };
    const frame = { id: "sampled-frame" } as unknown as CanvasImageSource;
    const media = new Map<string, LoadedMedia>([
      [
        "fixture:background",
        {
          frames: [frame],
          fps: 1,
          width: 720,
          height: 1280,
          aspect: 0.5625,
          animated: false,
          transparent: false,
        },
      ],
    ]);
    const plan = buildPlan(project);
    const canvas = canvasRecorder();

    paintFrame(canvas.ctx, project, theme, plan, 0, 1080, 1920, {
      media,
      nativeVideoBackground: true,
    });

    expect(canvas.operations.some((op) => op[0] === "drawImage" && op[1] === frame)).toBe(false);
  });
});

describe("Canvas WhatsApp pages", () => {
  it("partitions actual bubble height and resets the visible list at appearance time", () => {
    const project = projectWithMessages(30);
    const plan = buildPlan(project);
    const canvas = canvasRecorder();
    const pages = conversationPagesFor(canvas.ctx, project, theme, plan, 1080, 1080);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => page.messageIds)).toEqual(
      project.messages.map((message) => message.id),
    );
    const next = pages[1]!;
    const entry = plan.byId[next.messageIds[0]!]!;
    expect(next.reason).toBe("HEIGHT_THRESHOLD");
    expect(next.startMs).toBe((entry.appearFrame / plan.fps) * 1000);
    const before = canvasRecorder();
    const after = canvasRecorder();
    paintFrame(before.ctx, project, theme, plan, entry.appearFrame - 1, 1080, 1080);
    paintFrame(
      after.ctx,
      project,
      theme,
      plan,
      entry.appearFrame + entry.entranceFrames,
      1080,
      1080,
    );
    expect(before.texts().join(" ")).toContain(project.messages[0]!.text);
    expect(after.texts().join(" ")).not.toContain(project.messages[0]!.text);
    expect(after.texts().join(" ")).toContain(
      project.messages.find((message) => message.id === next.messageIds[0])!.text,
    );
  });

  it("caches measurements but invalidates dimensions, plan and loaded media geometry", () => {
    const project = projectWithMessages(30);
    const plan = buildPlan(project);
    const canvas = canvasRecorder();
    const media = new Map<string, LoadedMedia>();
    const pages = conversationPagesFor(canvas.ctx, project, theme, plan, 1080, 1080, true, media);
    const initialMeasurements = canvas.measureText.mock.calls.length;
    canvas.measureText.mockClear();
    expect(conversationPagesFor(canvas.ctx, project, theme, plan, 1080, 1080, true, media)).toBe(
      pages,
    );
    expect(canvas.measureText.mock.calls.length).toBeLessThan(initialMeasurements / 10);
    expect(
      conversationPagesFor(canvas.ctx, project, theme, plan, 1080, 1920, true, media),
    ).not.toBe(pages);
    expect(
      conversationPagesFor(canvas.ctx, project, theme, buildPlan(project), 1080, 1080, true, media),
    ).not.toBe(pages);
    media.set("fixture", {
      frames: [],
      fps: 1,
      width: 10,
      height: 20,
      aspect: 0.5,
      animated: false,
      transparent: false,
    });
    expect(
      conversationPagesFor(canvas.ctx, project, theme, plan, 1080, 1080, true, media),
    ).not.toBe(pages);
  });

  it("uses fewer messages per page when text is taller and reports an oversized bubble", () => {
    const short = projectWithMessages(20);
    const long = projectWithMessages(20, "Texto extenso com muitas linhas. ".repeat(12));
    const canvas = canvasRecorder();
    const shortPages = conversationPagesFor(canvas.ctx, short, theme, buildPlan(short), 1080, 1080);
    const longPages = conversationPagesFor(canvas.ctx, long, theme, buildPlan(long), 1080, 1080);
    expect(longPages.length).toBeGreaterThan(shortPages.length);
    const oversized = projectWithMessages(1, "Uma mensagem enorme. ".repeat(250));
    const plan = buildPlan(oversized);
    const pages = conversationPagesFor(canvas.ctx, oversized, theme, plan, 1080, 1080);
    expect(pages[0]!.overflowMessageIds).toEqual([oversized.messages[0]!.id]);
    paintFrame(canvas.ctx, oversized, theme, plan, plan.totalFrames - 1, 1080, 1080);
    expect(canvas.operations.some((op) => op[0] === "scale" && Number(op[1]) < 0.5)).toBe(true);
  });

  it("starts a new page when switching away from and back to a thread", () => {
    const project = projectWithMessages(3);
    project.threads = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    project.messages.forEach((message, i) => {
      message.threadId = i === 1 ? "b" : "a";
    });
    const pages = conversationPagesFor(
      canvasRecorder().ctx,
      project,
      theme,
      buildPlan(project),
      1080,
      1920,
    );
    expect(pages.map((page) => page.sessionId)).toEqual(["a", "b", "a"]);
    expect(pages.map((page) => page.messageIds.length)).toEqual([1, 1, 1]);
  });
});
