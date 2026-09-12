---
name: accessibility-gate
description: "Use as a final check on any interface change — keyboard operation, focus order, contrast, semantics and ARIA."
---

# Accessibility Gate

## Purpose

Block UI work that cannot be operated without a mouse or with low vision.

## Checklist

1. Every action reachable by Tab in a logical order; no keyboard trap.
2. `:focus-visible` is clearly visible on every interactive element.
3. Dialogs trap focus while open, close on Escape, and return focus to the trigger.
4. Contrast: 4.5:1 text, 3:1 large text and UI boundaries.
5. Semantic elements first — `button`, `nav`, `main`, `label`. ARIA only to fill gaps.
6. Every input has a programmatic label; errors are announced with `role="alert"`.
7. Icon-only buttons carry an accessible name.
8. Canvas-based surfaces expose an alternative control path.
9. Motion respects `prefers-reduced-motion`.

## Rule

State which items passed and which were not verified. Do not claim compliance you did not check.
