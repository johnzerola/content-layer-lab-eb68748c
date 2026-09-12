# Accessibility audit

Static evidence: Radix primitives are available; several editor controls expose Portuguese `aria-label`s; `prefers-reduced-motion` rules exist. Static evidence cannot validate tab order, focus trapping, contrast in rendered states, zoom, mobile targets, announcements or screen-reader output.

P1 audit protocol: test keyboard journey, focus order/visibility, dialogs and status messages with an isolated browser. P2: add axe-core only as a supplement, then assess WCAG 2.2 and ARIA APG behaviours manually. Never mark a route accessible solely because axe passes.

Normative references for future checks: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/).
