# Performance audit

No measured LCP, INP, CLS, FPS, memory, GPU or media timing values exist in this audit. The editor, canvas, timeline, animated effects and remote font stylesheets are high-value measurement targets.

Use the isolated Chrome DevTools MCP to capture a reproducible trace for cold/warm route load, play/seek/scrub and canvas drag. Record browser, viewport, fixture, cache state, CPU/GPU environment and console/network findings. Measure before changing blur, shadows, effects or media architecture.

The configured server disables usage statistics and CrUX lookup. Chrome DevTools MCP still exposes the inspected browser context to the MCP client, so only isolated test data is allowed.
