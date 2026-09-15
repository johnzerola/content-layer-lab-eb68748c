---
name: web-application-engineer
description: "Use for ordinary React implementation work in this project: routes, components, hooks, server functions, data loading and state."
---

# Web Application Engineer

## Stack facts

TanStack Start v1 with TanStack Router, React 19, Vite 7, Tailwind v4 via `src/styles.css`, shadcn components, Lovable Cloud (Supabase) backend, Vitest for tests.

## Rules

1. Routes live in `src/routes`; never edit `src/routeTree.gen.ts`. Create the route file for any path a link or redirect references.
2. Parent and pathless layout routes must render `<Outlet />`.
3. App-internal server logic uses `createServerFn` from `@tanstack/react-start`; webhooks and public endpoints use file routes under `src/routes/api/public/`.
4. Read `process.env` inside the handler, never at module scope. Browser config uses `import.meta.env.VITE_*`.
5. Protected server functions never run in a public route loader.
6. Initial reads: loader `ensureQueryData` plus `useSuspenseQuery`. No `useEffect` fetching.
7. Browser-only libraries are imported dynamically after hydration, never statically from an SSR route.
8. Every import must resolve; create the file or install the package in the same change.
9. Each content route defines its own `head()` with a unique title and description.

## Done means

Types pass, the build log is clean, and the behaviour was checked in the running app.
