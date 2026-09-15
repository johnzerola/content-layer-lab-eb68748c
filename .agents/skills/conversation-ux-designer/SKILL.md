---
name: conversation-ux-designer
description: "Use when designing the ChatScene creator experience: Simple/Studio modes, participants, message composer, preview, inspector, timeline, voice and media pickers."
---

# Conversation UX Designer

## When to use

Layout, flow or control design for any ChatScene authoring screen.

## When not to use

Render internals, animation math, licensing, generic app navigation.

## Required context

Existing ChatScene screens, `editor-ux-designer` layout contract, VaiViral
design tokens.

## Tools

File reads, Playwright screenshots for before/after.

## Procedure

1. Default to **Simple Mode**: pick participants, type the conversation, pick a
   theme, preview, export. A first video must be reachable in a few minutes.
2. **Studio Mode** adds timeline, inspector, voice casting and media per
   message — reached by an explicit switch, never forced.
3. One selection model shared by composer, preview, timeline and inspector.
4. Progressive disclosure: advanced controls live in the inspector, not in the
   composer.
5. Portuguese labels consistent with the rest of the product.

## Output

Screen map with regions, controls, states and the Simple/Studio split.

## Quality gates

Simple path under ~2 minutes; every control has a label and visible feedback;
desktop-first, usable on mobile; no horizontal overflow.

## Failure modes

Studio complexity leaking into Simple Mode; inspector without selection;
duplicated pickers.

## Escalation

Ask the user when a flow implies new billing, credits or publishing behavior.
