---
name: visual-qa-gate
description: "Use before declaring any UI work finished — a visual review pass against the rendered app, not the source code."
---

# Visual QA Gate

## Purpose

Nothing ships on the assumption that it looks right.

## Procedure

1. Open the affected route in the running app and capture the real render.
2. Check 1280 px and 390 px widths at minimum.
3. Verify: alignment, spacing rhythm, truncation, overflow, z-index, empty state, loading state, long text and long filenames.
4. Verify dark theme surfaces and that no element uses a hardcoded colour.
5. Verify hover, focus-visible, active and disabled on every new control.
6. Read the build and console logs; an error in the log is a failed gate.

## Rules

- Report what was observed, with evidence, not what was intended.
- A layout that only works with short placeholder text has failed.
- If something cannot be verified, say so explicitly instead of claiming success.
