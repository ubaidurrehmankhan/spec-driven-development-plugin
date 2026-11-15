---
paths:
  - "src/**/*.tsx"
  - "app/**/*.tsx"
---

# Component conventions (defaults; `.claude/project-profile.md` overrides them)

- Never invent a new component for something an existing one already does — check the project's component library first.
- Types for API data mirror the backend's DTOs. No `any`.
- Data fetching and caching go through the project's query layer (for example TanStack Query) — no raw `fetch` calls scattered in components.
- A mutation that changes server data invalidates the right cache keys on success and shows a clear error on failure. No silent failures.
- Loading, empty, and error states are explicit — never a blank screen while something is wrong or still loading.
- Keep business logic out of components where it can live in a hook or a plain function instead — a component should mostly describe what the screen looks like.
- Comments: only where the reason is not obvious from the code; no ticket or task references in source comments.
