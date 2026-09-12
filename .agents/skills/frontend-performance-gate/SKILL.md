---
name: frontend-performance-gate
description: Measure frontend interaction and rendering performance before approving performance-sensitive UI work.
---

Use isolated Chrome DevTools traces following `docs/design-research/PERFORMANCE_AUDIT.md`. Measure cold/warm behaviour and relevant editor actions; inspect long tasks, layout/paint/composite, network and memory. Do not infer LCP, FPS or GPU use from source code.
