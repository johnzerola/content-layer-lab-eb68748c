---
name: conversation-timing-engineer
description: "Use for ChatScene time: ConversationClock, message timing, typing delays, voice duration, pauses, scroll timing and audio sync."
---

# Conversation Timing Engineer

## When to use

Anything that answers "when does this happen" in a conversation video.

## When not to use

Visual styling, message content, renderer output format.

## Required context

`ConversationClock` contract, message list with durations, voice duration
estimates.

## Tools

Local reads, unit tests.

## Procedure

1. All time derives from a single `ConversationClock`. UI reads it; UI never
   invents time.
2. Never use scattered `setTimeout`/`setInterval` for playback. Preview is
   driven by a single animation loop or the renderer frame.
3. Each message resolves to a deterministic window: start, typing duration,
   entrance duration, content duration, trailing pause.
4. Voice duration, when present, is authoritative for content duration.
5. Timeline must be reproducible: same project, same frames, same output.

## Output

Timing table per message plus the total composition duration.

## Quality gates

Same input produces identical frame times; no drift between audio and bubble;
seek to any frame renders the correct state.

## Failure modes

Accumulated float drift; timing recalculated during render; audio sync solved
with a fudge offset.

## Escalation

If an external provider cannot report audio duration, block and ask rather than
guessing.
