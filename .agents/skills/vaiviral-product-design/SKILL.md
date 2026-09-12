---
name: vaiviral-product-design
description: Design and improve VaiViral interfaces, editor interactions, component styling, accessibility and responsive layouts. Use for product UI/UX work in this repository, not backend-only media processing or infrastructure tasks.
---

# VaiViral product design

Read `docs/design/DIRECTION.md` from the repository root before substantive UI work.
Inspect the actual route, components and `src/styles.css`; screenshots are references,
not evidence that an interaction works. Respect the scope of the current request.

## Direction and implementation

- Classify the surface: the editor is an operating workspace; public marketing pages
  can be expressive. Keep preview, timeline and primary actions prominent in the editor.
- For a redesign, describe the intended hierarchy and interaction changes briefly
  before editing. Use the existing tokens, Radix primitives and icon system first.
- Prefer an identifiable composition, clear typography and useful spacing over
  repeated nested cards, ubiquitous gradients, glows or ornamental dashboards.
- Reuse current components before adding a library. Do not replace the framework,
  media engine, authentication or navigation architecture for a visual change.
- Progressive disclosure should hide advanced settings, not essential actions,
  job status, cancellation, cost information or the reason an option is unavailable.
- Use motion for feedback and continuity, respect reduced motion, and keep animation
  out of the video rendering path. Effects must not compete with the user's video.
- Label controls in Portuguese. Provide keyboard focus, accessible names, readable
  contrast and touch targets. Color alone must not communicate state.
- Keep loading, empty, disabled, failure and success states truthful. A preview or
  mocked response must never be presented as a completed render or verified removal.

## Verification

For interaction changes, use Playwright MCP when available to exercise the affected
flow, not just capture a screenshot. Test a relevant desktop and narrow viewport,
keyboard access, console errors and the changed loading/error states. Run the
repository's appropriate tests and build/type checks in proportion to the change.

Use Chrome DevTools MCP and the available web-perf skill when performance profiling
is needed. A screenshot alone cannot establish responsive behavior or performance.
Use isolated browser profiles; do not attach to the user's personal session by default.

Do not initiate paid GPU processing, publishing, real uploads of private media or
destructive actions merely to test a visual change. Use fixtures/local previews when
possible; obtain missing authority for any expanded live test.

If browser tooling or credentials are unavailable, state what was not verified.
Finish with the changed surface, tests actually run and remaining limitations.
