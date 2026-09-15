import { describe, expect, it } from "vitest";
import { appendRedditStory, normalizeRedditSourceUrl, prepareRedditStory, splitNarrative, type RedditStoryDraft } from "../reddit-story";
import { createChatSceneProject, createMessage } from "../types";
import { deserializeChatSceneProject, serializeChatSceneProject } from "../serialize";

const draft: RedditStoryDraft = {
  title: "O bilhete no trem", author: "u/autora", community: "r/relatos",
  sourceUrl: "https://old.reddit.com/r/relatos/comments/abc123/historia/?utm_source=test",
  body: "Encontrei um bilhete no banco do trem. Pensei que fosse uma lista de compras, mas era um convite para observar o céu. Naquela noite, convidei meus amigos e vimos uma estrela cadente.",
};

describe("histórias do Reddit", () => {
  it("preserves every word through sentence, clause and long-text splitting", () => {
    const body = `${draft.body}\n\n${"Uma frase muito extensa com pontuação e acentos, ".repeat(50)}fim.`;
    const split = splitNarrative(body);
    expect(split.join(" ")).toBe(body.replace(/\s+/gu, " ").trim());
    expect(split.every((s) => s.length <= 180)).toBe(true);
  });
  it("adds editable narrator blocks and keeps the old project unchanged", () => {
    const p = createChatSceneProject();
    p.messages = [createMessage(p.participants[0]!.id, { text: "Conversa anterior" })];
    const before = JSON.stringify(p);
    const next = appendRedditStory(p, draft);
    expect(JSON.stringify(p)).toBe(before);
    expect(next.messages[0]).toEqual(p.messages[0]);
    expect(next.messages.slice(1).map((m) => m.text)).toEqual(prepareRedditStory(draft).blocks);
    expect(new Set(next.messages.slice(1).map((m) => m.participantId)).size).toBe(1);
    expect(next.messages.slice(1).every((m) => m.typingMs === 0 && m.voiceMs == null)).toBe(true);
    const restored = deserializeChatSceneProject(serializeChatSceneProject(next));
    expect(restored).toEqual(next);
    expect(restored.threads!.at(-1)!.storySource).toEqual(next.threads!.at(-1)!.storySource);
    expect(restored.threads!.at(-1)!.storySource?.sourceUrl).toBe("https://www.reddit.com/r/relatos/comments/abc123/historia/");
  });
  it("validates bounds without silently truncating stories", () => {
    expect(() => prepareRedditStory({ ...draft, title: "" })).toThrow("título");
    expect(() => prepareRedditStory({ ...draft, body: "x".repeat(20001) })).toThrow("20.000");
    expect(() => prepareRedditStory({ ...draft, body: "x".repeat(101) })).toThrow("palavra");
  });
  it.each(["javascript:alert(1)", "https://reddit.com.evil.test/r/a/comments/abc/", "https://www.reddit.com@evil.test/comments/abc", "http://reddit.com/comments/abc", "https://reddit.com/settings"]) ("refuses an invalid source URL %s", (url) => {
    expect(() => normalizeRedditSourceUrl(url)).toThrow();
  });
  it("allows original text without claiming it was fetched from Reddit", () => {
    const prepared = prepareRedditStory({ ...draft, author: "", sourceUrl: "" });
    expect(prepared.source.sourceUrl).toBeNull();
    expect(prepared.source.importMode).toBe("pasted-text");
  });
});
