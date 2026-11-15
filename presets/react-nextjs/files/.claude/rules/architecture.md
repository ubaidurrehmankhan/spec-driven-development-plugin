---
paths:
  - "src/**/*.{ts,tsx}"
  - "app/**/*.{ts,tsx}"
---

# Next.js / React architecture (defaults; `.claude/project-profile.md` overrides them)

- **Server first:** components are Server Components by default. Add `'use client'` only at the smallest leaf that needs state, effects or browser APIs. Never import a server-only module (database, secrets) into a client component.
- **Data:** fetch on the server where possible. Be explicit about caching on every fetch (`cache`, `revalidate`, tags) and invalidate with `revalidatePath` / `revalidateTag` after a mutation. Client-side server state uses TanStack Query with a key factory, never ad-hoc `useEffect` fetches.
- **Server Actions and Route Handlers:** validate input (zod) and check authorization inside every one; treat them as public endpoints. Call backend endpoints through the typed API client built from the HTTP contract.
- **Structure:** route files stay thin; feature code lives in `features/<name>/` (components, hooks, api, types). Shared UI in `components/`. No cross-feature imports except through the feature's `index.ts`.
- **Types:** `strict` TypeScript, no `any`; domain types mirror the backend DTOs. Environment variables are validated once in a typed `env` module; only `NEXT_PUBLIC_*` values reach the browser.
- **Quality:** accessible by default (labels, focus order, keyboard use), loading and error states for every async view, and no component restyling unless the task says so.
- New structural choices get an ADR in `docs/adr/`.
