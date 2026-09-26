import {
  createMessage,
  createThread,
  participantOf,
  threadIdOf,
  threadsOf,
  type ChatSceneProject,
} from "./types";

/** Insert into the selected chat while keeping the global video sequence intact. */
export function appendThreadMessage(project: ChatSceneProject, threadId: string) {
  const id = threadsOf(project).find((t) => t.id === threadId)?.id ?? threadsOf(project)[0]!.id;
  const indices = project.messages.flatMap((m, i) => (threadIdOf(project, m) === id ? [i] : []));
  const lastIndex = indices.at(-1);
  const last = lastIndex === undefined ? null : project.messages[lastIndex]!;
  const author = last ? participantOf(project, last.participantId) : null;
  const next = project.participants.find((p) => p.id !== author?.id) ?? project.participants[0]!;
  const message = createMessage(next.id, { threadId: id });
  const messages = [...project.messages];
  messages.splice(lastIndex === undefined ? messages.length : lastIndex + 1, 0, message);
  return { project: { ...project, messages }, message };
}

export function duplicateThread(project: ChatSceneProject, threadId: string) {
  const threads = threadsOf(project);
  const source = threads.find((t) => t.id === threadId) ?? threads[0]!;
  const { id: sourceId, ...settings } = source;
  const thread = createThread({ ...settings, name: `${source.name} — cópia` });
  const original = project.messages.filter((m) => threadIdOf(project, m) === source.id);
  const copies = original.map(({ id, ...m }) =>
    createMessage(m.participantId, { ...m, threadId: thread.id, initial: false }),
  );
  const ids = new Map(original.map((m, i) => [m.id, copies[i]!.id]));
  const messages = copies.map((m) => ({
    ...m,
    replyToId: m.replyToId ? (ids.get(m.replyToId) ?? null) : null,
  }));
  return {
    thread,
    project: {
      ...project,
      threads: [...threads, thread],
      messages: [...project.messages, ...messages],
    },
  };
}

/** Removing a chat keeps its messages and moves them to the first remaining chat. */
export function removeThreadKeepingMessages(
  project: ChatSceneProject,
  id: string,
): ChatSceneProject {
  const threads = threadsOf(project);
  if (threads.length < 2 || !threads.some((t) => t.id === id)) return project;
  const rest = threads.filter((t) => t.id !== id);
  return {
    ...project,
    threads: rest,
    messages: project.messages.map((m) =>
      threadIdOf(project, m) === id ? { ...m, threadId: rest[0]!.id } : m,
    ),
  };
}
