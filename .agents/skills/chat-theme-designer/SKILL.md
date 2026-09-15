---
name: chat-theme-designer
description: "Use when creating or changing ChatScene themes: bubble styling, colors, avatars, headers, dark/light variants and theme tokens."
---

# Chat Theme Designer

## When to use

Any presentation-level chat appearance work.

## When not to use

Message content, timing, animation logic, asset licensing.

## Required context

Theme token schema, message type list, existing themes.

## Tools

Design tokens, preview screenshots.

## Procedure

1. A theme controls presentation only: colors, radii, spacing, typography,
   avatar shape, header, bubble tails, read marks. It must never change content
   or timing.
2. Build the base family: Modern Messenger, Social DM, Classic Chat, Minimal,
   Dark, Group, Premium, Playful.
3. Every theme declares tokens for both light and dark surfaces and defines all
   message types, including system and typing.
4. Original visual design only. Do not clone a protected product interface and
   do not ship third-party logos or brand marks.
5. Themes are data, not components.

## Output

Token set per theme plus a preview of every message type.

## Quality gates

Contrast passes AA for message text; all message types styled; no theme field
outside presentation.

## Failure modes

Theme storing timing or content; hardcoded colors in components; missing
group-chat variants.

## Escalation

Stop if a request asks for an exact copy of a named commercial interface.
