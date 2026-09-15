import { createMessage, createParticipant, createThread, threadsOf, type ChatSceneProject } from "./types";
import { DEFAULT_VOICE } from "./voice";

export interface RedditStoryDraft {
  title: string;
  body: string;
  author: string;
  community: string;
  sourceUrl: string;
}

export interface RedditStorySource {
  kind: "reddit-story";
  title: string;
  author: string;
  community: string;
  sourceUrl: string | null;
  importMode: "pasted-text";
}

const clean = (text: string) => text.replace(/\s+/gu, " ").trim();

/** Metadata only: no URL fetching, HTML execution or undocumented Reddit endpoint. */
export function normalizeRedditSourceUrl(value: string): string | null {
  if (!value.trim()) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Informe um link válido do post no Reddit."); }
  const hosts = new Set(["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com"]);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.has(url.hostname) ||
    !/^\/(?:r\/[A-Za-z0-9_]+\/)?comments\/[A-Za-z0-9]+(?:\/|$)/u.test(url.pathname)) {
    throw new Error("Use o link HTTPS completo do post no Reddit (com /comments/).");
  }
  return `https://www.reddit.com${url.pathname}`;
}

/** Keep every word; prefer sentence/clause boundaries, then spaces for a long clause. */
export function splitNarrative(text: string): string[] {
  const normalized = clean(text);
  if (!normalized) return [];
  if (normalized.split(" ").some((word) => [...word].length > 100)) {
    throw new Error("Há uma palavra ou link muito longo no texto. Revise antes de adicionar.");
  }
  const sentences = normalized.split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}“"'¿¡])/u);
  const blocks: string[] = [];
  for (const sentence of sentences) {
    let buffer = "";
    for (const clause of sentence.split(/(?<=[,;:])\s+/u)) {
      if (buffer && (buffer.length + clause.length + 1 > 180)) { blocks.push(buffer); buffer = ""; }
      for (const word of clause.split(" ")) {
        if (buffer && (buffer.length + word.length + 1 > 180 || buffer.split(" ").length >= 32)) {
          blocks.push(buffer); buffer = "";
        }
        buffer = buffer ? `${buffer} ${word}` : word;
      }
    }
    if (buffer) blocks.push(buffer);
  }
  return blocks;
}

export function prepareRedditStory(draft: RedditStoryDraft) {
  const title = clean(draft.title);
  const body = clean(draft.body);
  const author = clean(draft.author).replace(/^u\//u, "");
  const community = clean(draft.community).replace(/^r\//u, "");
  if (!title || title.length > 160) throw new Error("Informe um título de até 160 caracteres.");
  if (body.length < 10 || body.length > 20000) throw new Error("Cole a história com 10 a 20.000 caracteres.");
  if (author.length > 60 || community.length > 80) throw new Error("Revise o autor e a comunidade: os nomes estão muito longos.");
  const sourceUrl = normalizeRedditSourceUrl(draft.sourceUrl);
  const blocks = [...splitNarrative(title), ...splitNarrative(body)];
  if (blocks.length > 240) throw new Error("A história excede 240 blocos. Divida-a em episódios.");
  const words = blocks.join(" ").split(" ").length;
  return {
    source: { kind: "reddit-story", title, author, community, sourceUrl, importMode: "pasted-text" } satisfies RedditStorySource,
    blocks,
    estimatedSpeechSeconds: Math.ceil(words * 60 / 180),
  };
}

/** Append one isolated thread in a single undoable document change. */
export function appendRedditStory(project: ChatSceneProject, draft: RedditStoryDraft): ChatSceneProject {
  const prepared = prepareRedditStory(draft);
  const narrator = createParticipant({ name: "Narrador", isSelf: false, color: "#f97316", voice: { ...DEFAULT_VOICE, pitch: 0 } });
  const voiceProfile = { ...DEFAULT_VOICE, pitch: 0, id: `voice_${narrator.id}` };
  const attribution = [prepared.source.community ? `r/${prepared.source.community}` : "História narrada",
    prepared.source.author ? `u/${prepared.source.author}` : "Autoria não informada"].join(" · ");
  const thread = createThread({ name: prepared.source.title, subtitle: attribution, kind: "direct" });
  const messages = prepared.blocks.map((text) => createMessage(narrator.id, { text, threadId: thread.id,
    typingMs: 0, pauseAfterMs: 120 }));
  return {
    ...project,
    title: project.messages.length ? project.title : prepared.source.title,
    participants: [...project.participants, { ...narrator, voice: voiceProfile, voiceProfileId: voiceProfile.id }],
    voiceProfiles: [...(project.voiceProfiles ?? []), voiceProfile],
    threads: [...threadsOf(project), { ...thread, storySource: prepared.source }],
    messages: [...project.messages, ...messages],
  };
}
