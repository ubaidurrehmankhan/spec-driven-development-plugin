---
name: nextjs-frontend
description: Next.js 14+/15+ App Router engineering standards. Master orchestrator covering routing & file conventions, Server vs Client Component boundary, data fetching and caching (Request Memoization, Data Cache, Full Route Cache, Router Cache) incl. Next 15 default-cache changes, Server Actions with revalidatePath/revalidateTag, performance (next/image, next/font, Suspense streaming), error/loading UX, metadata/SEO, middleware and auth, TypeScript strict mode with async params/searchParams, component libraries, project structure, testing, deployment, and common pitfalls. A frontend batch consumes the `../api-contracts/SKILL.md` HTTP contract format for any Route Handler or Server Action that calls a backend endpoint. Activate when the user asks to build, refactor, debug, migrate, or audit Next.js code; mentions App Router, Server Components, Server Actions, Route Handlers, middleware, ISR, RSC, hydration, caching, or any file under `app/`, `pages/`, `middleware.ts`, or `next.config.*`.
metadata:
  phases: [planning, implementation, verification]
  use_when: "Any Next.js App Router batch: routing, rendering, data fetching, server actions, performance"
---

> **Profile preamble** (added when this file was vendored from the spec-driven plugin v0.1.0; everything below it is unchanged from upstream except where listed in `.claude/spec-driven/CHANGES.md`)
> - **Project profile:** before reading or writing any path or name below, load `.claude/project-profile.md` if it exists. Paths and names in this file (`docs/contracts/`, `docs/todos/`, `specs/<folder>/`, `MODULE.md`, `IMPLEMENTATION-LOG.md`, `.claude/templates/`, Jira tool names, branch and commit conventions) are **defaults**; the profile's values win.
> - **Precedence:** the project's CLAUDE.md, its `.claude/rules/`, and the profile override any rule below that conflicts with them. When you follow the project over this file, say so in one line.
> - **Record names:** in this file, `MODULE.md` means the module file `src/<module>/<module>.module.md` (profile key `records.module_file`; a legacy `ANALYSIS.md` or `MODULE.md` is the same file), and `IMPLEMENTATION-LOG.md` means the module's history. Unless the profile sets `records.module_log: file`, there is **no separate per-module log**: read the module file's `Change History` and `Known Limitations / Deferred` instead, and append a `Change History` row (spec id and version, neutral wording, `Decisions` and `Deviations` references) where this file says to append a log row. Spec-level history lives in the per-spec implementation changelog; out-of-box choices go in `docs/DECISIONS.md`.
> - **No profile?** Use the defaults, infer conventions from CLAUDE.md and the code, and ask if a convention is ambiguous.

# Next.js App Router Engineering

This skill is the master orchestrator for Next.js work in this plugin. Read
this index first, decide which topic files apply, then read only those —
never load every topic file for a small task.

Defaults assumed across all topic files:
- Next.js 14+/15+, **App Router**
- **TypeScript strict**
- **React Server Components by default**, `"use client"` only at leaves
- Tailwind only if already in the project
- Detect codebase deviations and adapt; do not impose stack choices the project has not made

## This plugin's contract dependency

Any Route Handler or Server Action that calls a backend endpoint follows the
same rule as the `react-frontend` skill: read the endpoint's
`docs/contracts/*.contract.md` file (see `../api-contracts/SKILL.md`) before
writing the fetch — field names, envelope shape, chained-ownership and
role-boundary notes, and the async side-effect note (whether a result
appears immediately or later) all come from there, not from a guess at the
backend's shape. A batch that needs a contract that doesn't exist yet is
blocked exactly like a `react-frontend` batch would be — flag it and stop
rather than inventing the shape.

## Topic index — load only what the task needs

| Topic | When to load |
|---|---|
| [routing-and-rendering.md](routing-and-rendering.md) | `page`/`layout`/`template`/`loading`/`error`/`not-found`, route handlers, route groups, parallel & intercepting routes, dynamic segments, `generateStaticParams`, and the Server vs Client Component boundary decision |
| [data-fetching-and-caching.md](data-fetching-and-caching.md) | Fetching in Server Components, the four caches (Request Memoization, Data Cache, Full Route Cache, Router Cache), `revalidatePath`/`revalidateTag`, static/dynamic/ISR, Next 15 default-cache changes, parallelizing with `Promise.all`, Zod validation, Route Handler vs Server Action |
| [server-actions-and-mutations.md](server-actions-and-mutations.md) | Writing Server Actions, progressive enhancement, `useActionState` / `useFormStatus` / `useOptimistic`, post-mutation revalidation |
| [performance.md](performance.md) | `next/image`, `next/font`, `next/link`, `next/script`, Suspense streaming, dynamic imports, bundle hygiene |
| [error-and-loading-ux.md](error-and-loading-ux.md) | `error.tsx`, `global-error.tsx`, `loading.tsx`, Suspense boundaries, `notFound()` |
| [metadata-and-seo.md](metadata-and-seo.md) | Static `Metadata`, `generateMetadata`, OpenGraph, Twitter cards, `robots.ts`, `sitemap.ts` |
| [middleware-and-auth.md](middleware-and-auth.md) | `middleware.ts` patterns, Edge runtime caveats, Auth.js v5 / Clerk, route protection |
| [typescript-and-project-structure.md](typescript-and-project-structure.md) | Strict mode, no `any`, Next 15 async `params`/`searchParams` typing, typed Server Actions, `src/app` / `src/components` / `src/lib` / `src/server` layout, `server-only`/`client-only` enforcement |
| [component-libraries.md](component-libraries.md) | Building UI in a project that has a component library — detect from `package.json` (Ant Design / MUI / Chakra / Mantine / Radix / shadcn/ui / Headless UI / HeroUI), apply that library's App Router setup, Server→Client wrapping pattern, Form + Server Action pattern, centralized notifications, RTL |
| [code-quality-and-a11y.md](code-quality-and-a11y.md) | Semantic HTML, ARIA, keyboard support, ESLint/Prettier alignment, no `console.log` |
| [common-pitfalls.md](common-pitfalls.md) | Hydration mismatches, stale cache, `"use client"` leakage, fetch waterfalls, oversized client bundles, dynamic API misuse |
| [testing.md](testing.md) | Vitest/Jest unit, Testing Library component, Playwright E2E, testing Server Components and Server Actions |
| [deployment-and-config.md](deployment-and-config.md) | `next.config` patterns, image domains, headers, redirects, rewrites, env vars, Vercel vs self-host |

### Note on consolidation from the source material

This skill consolidates 15 single-topic source files into 12 to keep the
file count usable without losing content: **routing-and-file-conventions**
+ **server-vs-client-components** merged into `routing-and-rendering.md`
(both are "where does this piece of UI live and what file governs it"
decisions, read together in practice), and **caching-and-revalidation** +
**data-fetching** merged into `data-fetching-and-caching.md` (caching
strategy is not a separable decision from how you fetch — every fetch
example needs its cache option chosen in the same breath). **project-structure**
merged into `typescript-and-project-structure.md` (both are about where
things live and how they're typed at the boundary — `server-only` enforcement
spans both topics in the source material already). No topic's content was
dropped — every DO/DON'T list, code example, and table from the 15 source
files is preserved in one of the 12 consolidated files.

## Workflow

1. Read the request and inspect relevant files (`app/**`, `middleware.ts`, `next.config.*`, `package.json`, `tsconfig.json`).
2. Pick the smallest set of topic files that covers the task. Read them. Do not load the rest.
3. If the task touches a backend endpoint, read that endpoint's contract file first (see above).
4. Resolve genuine ambiguity (routing pattern, server/client boundary, fetching strategy, cache key, auth, runtime). Skip filler questions.
5. Implement with correct paths, minimal diff, no placeholder comments, no dead code.
6. Briefly explain non-obvious decisions in 1–2 lines.

## Hard rules across all topic files

- App Router only for new code. If the project still has `pages/`, plan a migration; do not add to it.
- Server Components are the default. `"use client"` is opt-in, applied at the smallest leaf that needs interactivity, browser APIs, or React state/effects.
- Never import server-only modules (DB clients, secrets) into a Client Component. Use `server-only` to enforce it.
- Never call `fetch` in a `useEffect` for data that a Server Component could fetch. Server-fetch first, client-fetch only for genuine client concerns (e.g., realtime, polling, user-driven refetch).
- Mutations go through Server Actions or Route Handlers — never expose a service-role key to the browser.
- After a successful mutation, revalidate the affected `path` or `tag`. Do not rely on the user reloading.
- TypeScript `any` is forbidden. Use `unknown` + narrowing or a proper type.
- No `console.log` in committed code. Use the project logger or remove the line.
- Validate all external input (route handlers, Server Action arguments, `searchParams`, webhooks) with Zod or equivalent.
- Authenticate inside a Server Action even when the calling route is already protected — Server Actions are independently callable.

## Quick decision aids

**Server Component or Client Component?**
- Needs `useState` / `useEffect` / event handlers / browser APIs → Client.
- Reads cookies, headers, DB, secrets, or large data → Server.
- Default: Server. Push `"use client"` to the smallest leaf.

**Route Handler or Server Action?**
- Form submission or button click from your own UI → Server Action.
- Webhook, third-party callback, public JSON API, or non-Next.js client → Route Handler.

**Static, dynamic, or ISR?**
- Content rarely changes, no per-request data → Static (default in App Router when no dynamic APIs are used).
- Per-request data (cookies, headers, `searchParams` in Next 15) → Dynamic.
- Mostly static but updates on a schedule → ISR via `next.revalidate` or `revalidateTag`.

**Cache or not?**
- Next 15: `fetch` is uncached by default. Opt in with `{ next: { revalidate: N } }` or `{ next: { tags: ['x'] } }`.
- Next 14: `fetch` is cached by default. Opt out with `{ cache: 'no-store' }` for per-request data.
- Verify the project's Next major version before assuming defaults.

## See also

- `../api-contracts/SKILL.md` — the HTTP contract format Route Handlers and Server Actions depend on
- `../owasp-security/SKILL.md` — chained ownership, role-based validation, and client-side security, applicable to Route Handlers, Server Actions, and rendered UI alike
- `../react-frontend/SKILL.md` — for a client-rendered SPA with TanStack Query instead of the App Router
