---
name: media-message-engineer
description: "Use for ChatScene media message types: image, video, GIF, sticker, audio, emoji and attachments, including storage, proxies and reuse of the existing asset library."
---

# Media Message Engineer

## When to use

Adding or changing a media-bearing message type or its asset pipeline.

## When not to use

Text-only messages, theming, timing.

## Required context

Existing Asset Library, `AssetCache`, `LibraryProvider`, storage buckets,
`src/lib/editor/asset-catalog.ts`.

## Tools

File reads, storage inspection (read only).

## Procedure

1. Reuse the existing asset library and cache. Do not build a second asset
   system.
2. Store binaries in storage; the project keeps a path plus light metadata
   (duration, size, mime, poster) — never data URLs in JSON.
3. Generate a light proxy for preview; keep the original for render.
4. Each media type declares: accepted formats, max size, poster strategy,
   fallback when missing.
5. Every imported asset passes `asset-license-gate`.

## Output

Type definition, storage path shape, preview and render behavior.

## Quality gates

No base64 in the document; missing media degrades visibly, never silently;
preview stays responsive with dozens of media messages.

## Failure modes

Duplicate uploads; unbounded cache; proxy used in final render.

## Escalation

Ask before adding an external media provider.
