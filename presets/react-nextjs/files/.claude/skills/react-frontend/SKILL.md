---
name: react-frontend
description: React frontend API-integration and review standards using TanStack Query, applied where UI components are already built. Covers domain TypeScript types mirroring backend DTOs (no `any`), a shared Axios client, per-entity API service functions, hierarchical query-key factories, `useQuery` with `enabled` flags, `useMutation` with `onSuccess` cache invalidation and `onError` feedback, UI wiring that replaces placeholder data plus loading/error/empty states, and a code-review checklist — with an explicit prohibition on creating, redesigning, or restyling components. A frontend batch consumes the `../api-contracts/SKILL.md` HTTP contract and cannot start until that contract file exists. Activate when the user asks to integrate, wire up, connect, or review a React frontend against backend APIs; mentions react-query, TanStack Query, `useQuery`, `useMutation`, query keys, or an API client; wants to replace placeholder data with live data; or runs a frontend code review in this plugin's spec-driven lifecycle.
metadata:
  phases: [planning, implementation, verification]
  use_when: "Any React frontend batch: API client, query and mutation hooks, UI wiring, review"
---

> **Profile preamble** (added when this file was vendored from the spec-driven plugin v0.1.0; everything below it is unchanged from upstream except where listed in `.claude/spec-driven/CHANGES.md`)
> - **Project profile:** before reading or writing any path or name below, load `.claude/project-profile.md` if it exists. Paths and names in this file (`docs/contracts/`, `docs/todos/`, `specs/<folder>/`, `MODULE.md`, `IMPLEMENTATION-LOG.md`, `.claude/templates/`, Jira tool names, branch and commit conventions) are **defaults**; the profile's values win.
> - **Precedence:** the project's CLAUDE.md, its `.claude/rules/`, and the profile override any rule below that conflicts with them. When you follow the project over this file, say so in one line.
> - **Record names:** in this file, `MODULE.md` means the module file `src/<module>/<module>.module.md` (profile key `records.module_file`; a legacy `ANALYSIS.md` or `MODULE.md` is the same file), and `IMPLEMENTATION-LOG.md` means the module's history. Unless the profile sets `records.module_log: file`, there is **no separate per-module log**: read the module file's `Change History` and `Known Limitations / Deferred` instead, and append a `Change History` row (spec id and version, neutral wording, `Decisions` and `Deviations` references) where this file says to append a log row. Spec-level history lives in the per-spec implementation changelog; out-of-box choices go in `docs/DECISIONS.md`.
> - **No profile?** Use the defaults, infer conventions from CLAUDE.md and the code, and ask if a convention is ambiguous.

# React Frontend

## Core Principle

**The UI is already built.** Components exist from Figma/design implementation. Your job is ONLY to:
1. Create TypeScript types matching backend DTOs
2. Create an API service layer
3. Create react-query hooks
4. Wire live data into existing components — replace static/placeholder data

**NEVER** create new UI components, redesign layouts, or modify styling. Only touch component files to swap placeholder data with hook data and add loading/error/empty states.

## A frontend batch depends on its API contract

This plugin's planning step (`plan-todo`) requires every frontend batch to
declare which `docs/contracts/*.contract.md` file (see `../api-contracts/SKILL.md`)
it depends on. **A frontend batch cannot be marked ready to implement until
that contract file exists** — produced by a backend batch, or, for
genuinely parallel work, hand-authored and approved in the plan itself
before the backend implementation lands. Do not start wiring an entity's
types/service/hooks against a guessed shape when the contract file is
missing — flag the missing contract and stop, per this plugin's Boundaries
convention, rather than inventing a shape that may not match what the
backend ships.

When the contract exists, treat it as the source of truth for:
- Every field name, type, and optionality on request/response DTOs (`type-patterns.md`)
- The success/error envelope shape (`api-client-patterns.md`)
- Which endpoints exist and their exact paths/methods (`api-client-patterns.md`)
- Chained-ownership and role-boundary notes that imply UI-visible behavior (e.g., a 403 the UI must handle distinctly from a 404)
- The async side-effect note, when relevant to UI feedback (e.g., "analysis results appear asynchronously — poll or refetch, don't expect them in the Save response")

## Generation Order

### Step 1: TypeScript Types
Read [type-patterns.md](type-patterns.md) then create `src/types/<name>.ts`
- One file per domain entity
- Interfaces must match the contract's request/response DTOs exactly
- Separate request and response types

### Step 2: API Client Setup
Read [api-client-patterns.md](api-client-patterns.md) and verify `src/services/apiClient.ts` exists.
- If it exists, use the existing client
- If it doesn't exist, create it following the patterns

### Step 3: API Service
Read [api-client-patterns.md](api-client-patterns.md) then create `src/services/<name>Api.ts`
- One service file per domain entity
- Functions for each backend endpoint in the contract
- Typed request and response generics

### Step 4: Query Keys
Read [query-hook-patterns.md](query-hook-patterns.md)'s Query Key Factory section, then add keys to the API service file or a dedicated keys file
- Factory pattern for hierarchical keys
- Consistent naming convention

### Step 5: Query Hooks
Read [query-hook-patterns.md](query-hook-patterns.md) then create `src/hooks/use<Name>.ts`
- `useQuery` for GET endpoints
- `enabled` flags for conditional/dependent queries
- Proper `select` transforms when needed

### Step 6: Mutation Hooks
Read [mutation-hook-patterns.md](mutation-hook-patterns.md) then add mutations to `src/hooks/use<Name>.ts`
- `useMutation` for POST/PATCH/DELETE
- `onSuccess` invalidation for cache consistency
- `onError` handling for user feedback

### Step 7: Wire into UI
Read [ui-wiring-patterns.md](ui-wiring-patterns.md) then update existing components
- Replace placeholder/static data with hook returns
- Add loading, error, and empty states
- Wire forms to mutations

### Mock/MSW work, when the backend isn't ready yet
When the contract file exists but the backend batch hasn't landed (the
"genuinely parallel work" case above), or when the task explicitly asks for
mock-backed development, read [mock-and-msw-patterns.md](mock-and-msw-patterns.md)
before wiring hooks against a live endpoint that doesn't exist yet.

## Verification Checklist

After generating all files:
- [ ] The frontend batch's declared contract file exists and was read before any type/service/hook was written
- [ ] TypeScript types match the contract's DTOs exactly — no `any`
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npx eslint src/types/ src/services/ src/hooks/ --fix` passes with 0 errors
- [ ] All query keys use the factory pattern
- [ ] All GET endpoints use `useQuery`
- [ ] All write endpoints use `useMutation` with cache invalidation
- [ ] Loading, error, and empty states handled in every component
- [ ] No business logic in components — all in hooks/services

## Key Rules

- Never use `any` — use proper interfaces or `unknown`
- Never put API URLs as inline strings in components — use the service layer
- Never call `fetch`/`axios` directly in components — always go through hooks
- Always invalidate related queries after mutations
- Always handle loading, error, and empty states — no unhandled promises
- Always match FE types to the contract's DTOs — if the contract changes, FE types must update

## Code review

When asked to review React/TypeScript frontend code (a PR, a diff, a batch
just implemented), read [review-checklist.md](review-checklist.md) and
[review-examples.md](review-examples.md) and walk the checklist against the
changed files, reporting Blocking / Warnings / Suggestions.

## See also

- `../api-contracts/SKILL.md` — the HTTP contract format this skill's batches depend on
- `../owasp-security/SKILL.md` — client-side security (XSS, safe rendering, CSP) referenced from the review checklist
- `../nextjs-frontend/SKILL.md` — for Next.js App Router projects instead of a client-rendered SPA
