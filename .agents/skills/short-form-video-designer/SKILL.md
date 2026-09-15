---
name: short-form-video-designer
description: "Use for vertical short-form composition in ChatScene: 9:16 framing, safe zones, phone layouts, background video, pacing and visual rhythm."
---

# Short-Form Video Designer

## When to use

Deciding composition, framing, pacing or background for an exported conversation
video.

## When not to use

Data modelling, provider integration, licensing.

## Required context

Target aspect ratios, theme in use, average message count and duration.

## Tools

Preview screenshots, frame inspection.

## Procedure

1. Design for 9:16 first; 1:1 and 16:9 are derived, not separate designs.
2. Keep interface-free safe zones: top ~12% and bottom ~18% clear of essential
   content for platform overlays.
3. Phone-frame layouts are optional decoration; the conversation must read
   without them.
4. Pacing: a hook in the first 2 seconds, no dead air above ~1.5s, visible
   change at least every 3 seconds.
5. Background video or color must never reduce bubble contrast below the
   accessibility threshold.
6. No layout that only works on one social network.

## Output

Frame diagram with safe zones, pacing notes and background rules.

## Quality gates

Legible at 360 px wide; nothing essential inside safe zones; contrast verified.

## Failure modes

Text cropped by platform chrome; background stealing attention; uniform pacing
that feels flat.

## Escalation

Ask when a platform-specific requirement conflicts with the shared layout.
