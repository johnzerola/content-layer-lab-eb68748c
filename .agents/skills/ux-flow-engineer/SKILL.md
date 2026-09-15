---
name: ux-flow-engineer
description: "Use when designing multi-step flows, empty/loading/error states, onboarding, confirmations, or the path a user takes between screens."
---

# UX Flow Engineer

## Purpose

Design the path, not just the screen.

## Every flow must define

1. Entry point and the user's goal.
2. The happy path in the fewest steps possible.
3. Empty state with one clear primary action.
4. Loading state with real progress when the work is long.
5. Error state saying what failed and what to do next, in plain Portuguese.
6. Success state that names the result and offers the natural next action.
7. Exit and cancel: long jobs are cancellable and cancelling cleans up.

## Rules

- One primary action per screen.
- Destructive actions are reversible or confirmed; never both silent and permanent.
- Long operations report progress per stage, not a single spinner.
- Never show fake success. If a capability is unavailable, say so.
- Preserve user work: filters and views never delete data.

## Output

A step list with the state at each step and the copy for empty, error and success.
