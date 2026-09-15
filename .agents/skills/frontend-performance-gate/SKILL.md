---
name: frontend-performance-gate
description: "Use when the interface feels slow or before shipping heavy UI — detects unnecessary re-renders, oversized payloads and blocked frames."
---

# Frontend Performance Gate

## Purpose

Keep the editor responsive during playback, dragging and export.

## What to look for

1. Re-renders: state kept too high in the tree, new object/array/function props each render, context holding fast-changing values.
2. Animation loops: canvas painting must be driven by invalidation, not unconditional `requestAnimationFrame` work per frame.
3. Main-thread blocking: decode, encode and heavy media math belong in workers.
4. Payload: no base64 media in state, props, or the database; use Storage paths.
5. Lists: virtualise long media and clip lists.
6. Effects: no effect chains that cascade renders; derive instead.
7. Images and video: lazy load off-screen assets; suspend painting when out of view.

## Procedure

Reproduce the slowness in the running app, measure, fix the cause, measure again, and report both numbers.
