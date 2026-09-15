import { describe, expect, it } from "vitest";
import { applyCreatorFormat, createCreatorExample } from "../creator-presets";
import { createChatSceneProject } from "../types";
import { serializeChatSceneProject, deserializeChatSceneProject } from "../serialize";

describe("creator format selection", () => {
  it("changes presentation without deleting conversations, voices, or uploaded backgrounds", () => {
    const project = createCreatorExample("whatsapp");
    project.background = { kind: "image", imageUrl: "https://example.com/own-background.png" };
    const original = JSON.stringify(project);
    const reddit = applyCreatorFormat(project, "reddit");
    const whatsapp = applyCreatorFormat(reddit, "whatsapp");
    for (const changed of [reddit, whatsapp]) {
      expect(changed.messages).toEqual(project.messages);
      expect(changed.participants).toEqual(project.participants);
      expect(changed.voiceProfiles).toEqual(project.voiceProfiles);
      expect(changed.threads).toEqual(project.threads);
      expect(changed.background).toEqual(project.background);
    }
    expect(JSON.stringify(project)).toBe(original);
  });

  it.each(["whatsapp", "reddit"] as const)(
    "persists %s format and the original demo without pretending audio exists",
    (format) => {
      const project = createCreatorExample(format);
      const restored = deserializeChatSceneProject(serializeChatSceneProject(project));
      expect(restored.storyFormat).toBe(format);
      expect(restored.layout?.pagination).toBe("pages");
      expect(restored.messages.map((m) => m.text)).toEqual(project.messages.map((m) => m.text));
      expect(restored.messages.length).toBeGreaterThan(2);
      expect(restored.messages.every((m) => !m.voiceMs)).toBe(true);
      expect(restored.participants.length).toBe(format === "reddit" ? 1 : 3);
      expect(restored.voiceProfiles?.length).toBe(restored.participants.length);
    },
  );

  it("does not change historical documents into pages when opening them", () => {
    const old = createChatSceneProject();
    delete old.storyFormat;
    if (old.layout) delete old.layout.pagination;
    const restored = deserializeChatSceneProject(serializeChatSceneProject(old));
    expect(restored.storyFormat).toBe("whatsapp");
    expect(restored.layout?.pagination ?? "scroll").toBe("scroll");
  });
});
