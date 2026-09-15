import type { ChatMessage } from "./types";

/** Must measure the entire candidate list: consecutive senders change spacing. */
export type MessageLayoutEstimator = (messages: ChatMessage[]) => number;
export type PageResetReason = "START" | "HEIGHT_THRESHOLD" | "SESSION_CHANGE" | "EDITORIAL" | "STYLE_RULE";
export interface PageInput {
  message: ChatMessage;
  sessionId: string;
  startMs: number;
  forceReset?: boolean;
}
export interface ConversationPage {
  id: string;
  sessionId: string;
  startMs: number;
  messageIds: string[];
  accumulatedHeight: number;
  reason: PageResetReason;
  overflowMessageIds: string[];
}

/** Pure height-based partition. Oversized messages are reported, never silently dropped. */
export function buildConversationPages(
  entries: PageInput[],
  measure: MessageLayoutEstimator,
  maxContentHeight: number,
  maxMessages: number,
): ConversationPage[] {
  if (!Number.isFinite(maxContentHeight) || maxContentHeight <= 0 || !Number.isInteger(maxMessages) || maxMessages < 1) {
    throw new Error("Invalid page budget");
  }
  const heightOf = (list: ChatMessage[]) => {
    const height = measure(list);
    if (!Number.isFinite(height) || height < 0) throw new Error("Invalid message measurement");
    return height;
  };
  const pages: ConversationPage[] = [];
  let list: ChatMessage[] = [];
  for (const entry of entries) {
    let page = pages.at(-1);
    let reason: PageResetReason | null = !page ? "START" : null;
    if (page && entry.sessionId !== page.sessionId) reason = "SESSION_CHANGE";
    else if (page && entry.forceReset) reason = "EDITORIAL";
    else if (page && list.length >= maxMessages) reason = "STYLE_RULE";
    else if (page && heightOf([...list, entry.message]) > maxContentHeight) reason = "HEIGHT_THRESHOLD";
    if (reason) {
      list = [];
      page = { id: `page:${entry.message.id}`, sessionId: entry.sessionId, startMs: entry.startMs,
        messageIds: [], accumulatedHeight: 0, reason, overflowMessageIds: [] };
      pages.push(page);
    }
    list.push(entry.message);
    page!.messageIds.push(entry.message.id);
    page!.accumulatedHeight = heightOf(list);
    if (page!.accumulatedHeight > maxContentHeight) page!.overflowMessageIds.push(entry.message.id);
  }
  return pages;
}
