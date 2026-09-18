import { describe, expect, it, vi } from "vitest";
import { threadAvatarUrl } from "../header-avatar";
import { createChatSceneProject, createMessage, createParticipant, createThread } from "../types";

vi.mock("../media", () => ({ loadMedia: vi.fn(async () => null) }));
import { loadMedia } from "../media";
import { CanvasConversationRenderer } from "../renderer";

function fixture() {
  const self = createParticipant({ name: "Léo", isSelf: true });
  const mother = createParticipant({ name: "Mae", avatarUrl: "mother.jpg", isSelf: false });
  const father = createParticipant({ name: "Pai", avatarUrl: "father.jpg", isSelf: false });
  const thread = createThread({ id: "mother-chat", name: "mãe", kind: "direct" });
  const project = createChatSceneProject({
    participants: [self, mother, father],
    threads: [thread],
    messages: [createMessage(mother.id, { threadId: thread.id, text: "Oi" })],
  });
  project.threads = [thread];
  return { project, thread, mother, father };
}

describe("Chat header avatar", () => {
  it("matches case, accents and surrounding whitespace", () => {
    const { project, thread } = fixture();
    expect(threadAvatarUrl(project, { ...thread, name: "  MÃE  " })).toBe("mother.jpg");
  });
  it("uses the only peer speaking in a renamed direct chat", () => {
    const { project, thread } = fixture();
    expect(threadAvatarUrl(project, { ...thread, name: "main" })).toBe("mother.jpg");
  });
  it("shows replacements and removal from the current participant state", () => {
    const { project, thread, mother } = fixture();
    mother.avatarUrl = "replacement.jpg";
    expect(threadAvatarUrl(project, thread)).toBe("replacement.jpg");
    mother.avatarUrl = null;
    expect(threadAvatarUrl(project, thread)).toBeNull();
  });
  it("does not select a random peer when the chat is ambiguous", () => {
    const { project, thread, father } = fixture();
    project.messages.push(createMessage(father.id, { threadId: thread.id, text: "Oi" }));
    expect(threadAvatarUrl(project, { ...thread, name: "main" })).toBeNull();
  });
  it("uses group photos, not a member photo", () => {
    const { project, thread } = fixture();
    expect(threadAvatarUrl(project, { ...thread, kind: "group" })).toBeNull();
    project.groupAvatarUrl = "group.jpg";
    expect(threadAvatarUrl(project, { ...thread, kind: "group" })).toBe("group.jpg");
  });
  it("preserves a custom thread photo", () => {
    const { project, thread } = fixture();
    expect(threadAvatarUrl(project, { ...thread, avatarUrl: "custom.jpg" })).toBe("custom.jpg");
  });
  it("loads explicit thread avatars for preview and export", async () => {
    const { project, thread } = fixture();
    project.threads = [{ ...thread, avatarUrl: "custom-thread.jpg" }];
    await new CanvasConversationRenderer().prepare(project);
    expect(loadMedia).toHaveBeenCalledWith("custom-thread.jpg", {});
  });
});
