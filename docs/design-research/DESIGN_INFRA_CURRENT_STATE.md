# Design infrastructure: current state

Audit date: 2026-09-11. Evidence is read-only static inspection; no authenticated browser flow or production deployment was used.

| Area | Finding |
|---|---|
| Frontend | React 19 with TanStack Start/Router, Vite and TypeScript |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite`; global source is `src/styles.css` |
| Components | Local primitives under `src/components/ui`, Radix UI, CVA and Lucide |
| Tokens | Semantic colour, surface, typography, spacing, radius, motion and z-index CSS variables; themes vary primary colour |
| Editor | `VideoStudio`, `EditorTimeline`, template canvases, route-based professional editor and render worker |
| Tests | Vitest; editor and production test files exist. No Storybook or Cypress found |
| Browser QA | Isolated Playwright MCP and Chrome DevTools MCP configured; no personal browser profile configured |
| Figma | No configured Figma MCP or project integration found |
| Accessibility | Radix primitives and some aria labels/reduced-motion rules exist; no axe suite found |
| Design-system risk | Semantic foundation is present, but direct colour values also appear in product/editor/preset code and need scoped review |

Sources of truth are provisional: visual intention = Figma when a connected file is supplied; component contract = code plus future Storybook; tokens = `src/styles.css`; behaviour = code/tests; validation = isolated Playwright, Chrome DevTools and accessibility checks.
