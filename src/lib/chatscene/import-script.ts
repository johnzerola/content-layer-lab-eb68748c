import {
  createMessage,
  createParticipant,
  type ChatMessage,
  type ChatParticipant,
  type ChatSceneProject,
} from "./types";

export interface ParsedScript {
  participants: ChatParticipant[];
  messages: ChatMessage[];
}

const PALETTE = ["#25d366", "#7c5cff", "#ff5d8f", "#28c6ff", "#ffb347", "#8bd450"];

const normalize = (name: string) => name.trim().toLowerCase();

/**
 * Lê uma conversa escrita em texto e devolve participantes e mensagens.
 *
 * Formato aceito, uma linha por mensagem:
 *   Ana: oi, tudo bem?
 *   Bruno: tudo! e você?
 *   * entrou no grupo        (linha de aviso, vira mensagem de sistema)
 *
 * Linhas em branco são ignoradas. Uma linha sem "Nome:" continua a mensagem
 * anterior, virando quebra de linha.
 */
export function parseConversationScript(
  text: string,
  project: ChatSceneProject,
): ParsedScript {
  const participants: ChatParticipant[] = [...project.participants];
  const messages: ChatMessage[] = [];
  const byName = new Map<string, ChatParticipant>();
  participants.forEach((p) => byName.set(normalize(p.name), p));

  const ensure = (name: string): ChatParticipant => {
    const key = normalize(name);
    const found = byName.get(key);
    if (found) return found;
    const created = createParticipant({
      name: name.trim() || `Pessoa ${participants.length + 1}`,
      color: PALETTE[participants.length % PALETTE.length]!,
      isSelf: participants.length === 0,
    });
    participants.push(created);
    byName.set(key, created);
    return created;
  };

  const fallback = participants[0] ?? ensure("Eu");
  let current: ChatMessage | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }

    if (line.startsWith("*")) {
      const msg = createMessage(fallback.id, {
        kind: "system",
        text: line.replace(/^\*+\s*/, ""),
      });
      messages.push(msg);
      current = null;
      continue;
    }

    const match = /^([^:]{1,40}):\s*(.*)$/.exec(line);
    if (match) {
      const author = ensure(match[1]!);
      const msg = createMessage(author.id, { text: match[2]! });
      messages.push(msg);
      current = msg;
      continue;
    }

    if (current) {
      current.text = `${current.text}\n${line}`;
    } else {
      const msg = createMessage(fallback.id, { text: line });
      messages.push(msg);
      current = msg;
    }
  }

  return { participants, messages };
}
