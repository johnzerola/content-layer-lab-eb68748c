/** Experimental timing policy, independent from theme and document geometry. */
export interface ChatSceneStyleProfile {
  id: "FAST_GAMEPLAY_CHAT";
  wordsPerMinute: number;
  charsPerSecond: number;
  bubbleLeadMs: number;
  postSpeechGapMs: number;
  tailMs: number;
  maxMessagesPerPage: number;
  overflowBehavior: "RESET_ONLY";
}

/** Engineering starting point, not a measurement of the reference. Not auto-enabled. */
export const FAST_GAMEPLAY_CHAT: Readonly<ChatSceneStyleProfile> = Object.freeze({
  id: "FAST_GAMEPLAY_CHAT",
  wordsPerMinute: 220,
  charsPerSecond: 20,
  bubbleLeadMs: 0,
  postSpeechGapMs: 80,
  tailMs: 500,
  maxMessagesPerPage: 12,
  overflowBehavior: "RESET_ONLY",
});

export function validateStyleProfile(profile: ChatSceneStyleProfile): void {
  for (const key of ["wordsPerMinute", "charsPerSecond", "maxMessagesPerPage"] as const) {
    if (!Number.isFinite(profile[key]) || profile[key] <= 0) throw new Error(`Invalid ${key}`);
  }
  for (const key of ["bubbleLeadMs", "postSpeechGapMs", "tailMs"] as const) {
    if (!Number.isFinite(profile[key]) || profile[key] < 0) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isInteger(profile.maxMessagesPerPage)) throw new Error("Invalid page count limit");
  if (profile.overflowBehavior !== "RESET_ONLY") throw new Error("Scroll policy is not validated yet");
}
