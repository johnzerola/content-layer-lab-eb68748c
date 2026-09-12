---
name: editor-ux-designer
description: "Use when designing or changing the video editor workspace: preview canvas, timeline, tracks, inspector, media sidebar, playback and editing tools."
---

# Editor UX Designer

## Purpose

Make VaiViral feel like a real desktop video editor, not a set of AI cards.

## Layout contract

- Top: project name, undo/redo, playback, export.
- Left: Media, Áudio, Texto, Legendas, Elementos, Transições, Efeitos, IA.
- Center: large 9:16 preview canvas.
- Right: contextual inspector for the current selection.
- Bottom: timeline with tracks.

## Principles

Prefer dense professional layout, clear hierarchy, a neutral workspace, contextual controls, progressive disclosure, icon plus tooltip, keyboard shortcuts and direct manipulation.

Avoid giant SaaS cards, heavy gradients, oversized headings, modal-heavy flows, wizards, and one dashboard per AI operation.

## Selection drives the inspector

| Selected | Inspector shows |
| --- | --- |
| Text | typography, colour, timing |
| Audio | volume, fades, cleanup |
| Video | crop, speed, transform |
| Caption | text, style, timing |

## Responsive

Desktop is primary. Mobile may simplify the timeline but must not remove playback, selection or export.
