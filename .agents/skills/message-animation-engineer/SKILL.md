---
name: message-animation-engineer
description: "Use when designing or implementing ChatScene message motion: bubble entrance, typing indicator, reactions, replies, stickers, image/GIF reveal, audio waveform, video bubbles and scroll."
---

# Message Animation Engineer

## When to use

Any motion attached to a chat message or to the conversation viewport.

## When not to use

Message content/data modelling, timing orchestration (see
`conversation-timing-engineer`), theming.

## Required context

Active renderer, message type list, `remotion-best-practices` when Remotion is
the renderer.

## Tools

Remotion skills for current APIs; Playwright for visual checks.

## Procedure

1. Separate strictly: CONTENT (what the message says) and ANIMATION (how it
   appears). Animation never mutates message data.
2. Declare each animation as a named preset with duration and easing, driven by
   frame/time input from the clock — not by component-local timers.
3. Cover: bubble entrance, typing indicator, reaction pop, reply attach,
   sticker, image reveal, GIF loop, audio waveform, video bubble, auto-scroll.
4. Respect reduced-motion in the editor preview; exported video keeps motion.
5. Verify Remotion APIs against the Remotion docs skill before using them.

## Output

Preset name, inputs, duration, easing, and where it is applied.

## Quality gates

Deterministic for a given frame; no layout jump on entrance; scroll keeps the
newest message inside the safe zone; no dropped frames in preview.

## Failure modes

Animation state stored in the document; CSS transitions used inside a rendered
frame; overlapping entrances causing clipping.

## Escalation

Stop if a motion needs a library not yet approved by `asset-license-gate`.
