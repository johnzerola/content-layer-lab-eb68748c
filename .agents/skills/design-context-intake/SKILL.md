---
name: design-context-intake
description: "Use before redesigning or restyling any existing screen — reads current components, tokens, state ownership and behaviour first so the redesign preserves logic."
---

# Design Context Intake

## Purpose

Never redesign blind. Capture the current state before proposing a new one.

## Procedure

1. Locate the route file and the components it renders.
2. List reusable pieces already available (`src/components/ui`, editor panels, shell).
3. Read the design tokens in `src/styles.css` and the utilities `glass`, `aurora-bg`, `interactive`, `rise-in`, `pop-in`, `skeleton`, `text-gradient`.
4. Identify who owns state: route loader, parent component, store, or server function.
5. Note every prop, callback and API the screen depends on.
6. Record which parts are presentation-only and therefore safe to change.

## Rules

- A redesign is presentation only: never change logic, routes, props, or APIs unless explicitly asked.
- Do not introduce a new component when an existing one covers the need.
- Do not touch Cleaner Phase 6.

## Output

A short intake note: files touched, reusable components, state owners, and the safe-to-change surface.
