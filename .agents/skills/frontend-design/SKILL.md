---
name: frontend-design
description: "Use when turning a UX decision into actual React components — composition, file placement, props and keeping presentation separate from domain logic."
---

# Frontend Design

## Purpose

Translate UX intent into consistent frontend code on the TanStack Start + React + Tailwind v4 stack.

## Rules

1. Presentation components take data and callbacks as props; domain logic stays in `src/lib` or server functions.
2. Route files compose; they do not hold heavy rendering logic.
3. Break a screen into named regions matching the UX (toolbar, canvas, inspector, timeline) before writing markup.
4. Derive state; do not duplicate it. No `useEffect` to sync values that can be computed.
5. Data loading uses the route loader with `ensureQueryData` plus `useSuspenseQuery`, not ad-hoc effects.
6. Keep components under roughly 200 lines; split by region when they grow.
7. Semantic HTML first, ARIA only when semantics are insufficient.

## Before coding

List the component tree and the owner of each piece of state, then implement incrementally.
