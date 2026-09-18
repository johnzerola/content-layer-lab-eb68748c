const NETWORK_ERROR_PATTERNS = [
  /failed to fetch/i,
  /fetch failed/i,
  /load failed/i,
  /networkerror/i,
  /network request failed/i,
  /econnrefused/i,
  /connection refused/i,
];

export const CHATSCENE_SERVER_DISCONNECTED =
  "O servidor local foi desconectado. Aguarde a reconexão e tente novamente.";

/** Keep server validation messages, but turn browser transport failures into an actionable message. */
export function chatSceneClientError(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message.trim() : "";
  if (!message) return fallback;
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
    ? CHATSCENE_SERVER_DISCONNECTED
    : message;
}
