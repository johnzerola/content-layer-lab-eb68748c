import { threadIdOf, type ChatSceneProject, type ChatSceneThread } from "./types";

function contactName(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("pt-BR");
}

/** Resolve live character photos without confusing separate chats or groups. */
export function threadAvatarUrl(project: ChatSceneProject, thread: ChatSceneThread): string | null {
  if (thread.avatarUrl) return thread.avatarUrl;
  if (thread.kind === "group") return project.groupAvatarUrl ?? null;

  const named = project.participants.filter(
    (person) => contactName(person.name) === contactName(thread.name),
  );
  if (named.length === 1) return named[0]!.avatarUrl ?? null;

  const speakers = new Set(
    project.messages
      .filter(
        (message) =>
          threadIdOf(project, message) === thread.id &&
          message.kind !== "card" &&
          message.kind !== "system",
      )
      .map((message) => message.participantId),
  );
  const peers = project.participants.filter((person) => !person.isSelf && speakers.has(person.id));
  return peers.length === 1 ? (peers[0]!.avatarUrl ?? null) : null;
}
