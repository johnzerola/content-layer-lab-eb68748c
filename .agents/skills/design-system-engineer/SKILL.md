---
name: design-system-engineer
description: "Use when adding or changing tokens, component variants, spacing, radii, elevation or interaction states in VaiViral."
---

# Design System Engineer

## Purpose

Keep one coherent system instead of per-screen styling.

## Rules

1. All colour, gradient and shadow values are semantic tokens in `src/styles.css`. Never hardcode `text-white`, `bg-black` or `bg-[#...]` in components.
2. Extend shadcn variants rather than adding one-off class soups.
3. Spacing uses the 4 px scale; do not invent intermediate values.
4. Typography: Outfit for headings, Figtree for body, JetBrains Mono for labels and numeric readouts.
5. Every interactive component defines default, hover, active, focus-visible, disabled and loading states.
6. Reuse the existing utilities: `glass`, `aurora-bg`, `interactive`, `rise-in`, `pop-in`, `skeleton`, `text-gradient`.
7. A new token is justified only when at least two surfaces need it.

## Review checklist

No raw hex in components, no duplicate variant doing the same job, dark theme verified, focus ring visible on every control.
