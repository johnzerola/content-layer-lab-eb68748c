---
name: chatstory-visual-qa
description: "Use before calling any ChatScene UI or preview work done: verify widths, aspect previews, overflow, clipping, long content, group chats, themes and animation timing."
---

# ChatStory Visual QA

## When to use

Final check on a ChatScene screen, preview or theme change.

## When not to use

Backend-only or data-only changes. For general app screens use the existing
visual review skill instead of this one.

## Required context

Running preview, the routes touched.

## Tools

Playwright via shell (screenshots, keyboard, console). No heavy MCP server.

## Procedure

1. Capture at 1440, 1366 and 390 px wide.
2. Check the 9:16, 16:9 and 1:1 previews.
3. Stress content: very long names, very long messages, emoji-only, many
   reactions, group chat with 5+ participants, missing avatar, missing media.
4. Verify each media type renders: image, video, GIF, sticker, audio, emoji.
5. Check both dark and light themes.
6. Scrub the timeline and confirm animation timing matches the timing table.
7. Read the browser console; zero errors required.

## Output

A pass/fail list per check with screenshots for anything failing.

## Quality gates

No horizontal overflow, no bubble clipping, no overlapping avatars, no console
errors, build clean.

## Failure modes

Testing only the happy sample conversation; checking one width; ignoring the
console.

## Escalation

Report unresolved visual defects instead of declaring the work done.
