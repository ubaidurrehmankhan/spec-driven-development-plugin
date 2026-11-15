# React / TypeScript Frontend — Code Review Checklist

Walk each section against the changed files.

---

## 1 — Tooling, quality gates, and tests

- [ ] Lint: **0** errors and **0** warnings on touched code
- [ ] Unit test coverage **≥ 90%** (lines, statements, functions, branches) for relevant modules
- [ ] New or changed behavior has tests in the **active batch/sprint** (not deferred without reason)
- [ ] Code formatted with **Prettier** (repo / VS Code config)
- [ ] **SonarQube** connected in CI; reviewer uses Sonar (or equivalent) locally when available — no new blocker issues without justification
- [ ] **DRY**: no unnecessary duplication; duplication **≤ ~5%** per team/Sonar threshold

## 2 — TypeScript and correctness

- [ ] **TypeScript only** — no new `.js`/`jsx` without team exception
- [ ] No `any`; use proper types, generics, or `unknown` + narrowing
- [ ] Types align with the `docs/contracts/*.contract.md` file for the touched entity (see `../api-contracts/SKILL.md`) — not a guessed or stale shape
- [ ] Hooks and effects have correct dependencies; no stale closures that break UX
- [ ] Loading, error, and empty states handled for user-facing flows

## 3 — API integration and mocking

- [ ] All API calls go through the **single shared client** (`api-client-patterns.md`)
- [ ] MSW (see `mock-and-msw-patterns.md`) used for mocks so FE can integrate and test before BE ships, when applicable
- [ ] Query/mutation keys and cache invalidation are consistent with `query-hook-patterns.md` / `mutation-hook-patterns.md`
- [ ] Every nested/chained route call passes every ID segment the contract documents (no collapsing IDs client-side)

## 4 — Security and configuration

- [ ] No hardcoded secrets, API keys, or passwords — **environment variables** only
- [ ] Sensitive data not logged in production code paths
- [ ] Local/session storage **encrypted** in non-dev environments per project setup
- [ ] User-generated content is rendered safely (no unescaped `dangerouslySetInnerHTML` of untrusted input) — see `../owasp-security/SKILL.md`'s client-side security section

## 5 — UI, styling, and design system

- [ ] **No inline CSS** for layout/visuals; use **Tailwind** (or project utility classes)
- [ ] Avoid `!important` unless documented exception
- [ ] **Fonts** defined in a **central** theme/tokens file for easy global changes
- [ ] **Large components** split into smaller, focused components
- [ ] **Shared** repeated UI/logic moved to shared components or hooks
- [ ] **Responsive** behavior considered for common breakpoints early
- [ ] **RTL/LTR** relies on the UI library defaults; custom CSS does not break direction
- [ ] No new UI components created, redesigned, or restyled where the task was integration-only (see `SKILL.md`'s Core Principle)

## 6 — UX patterns

- [ ] **Centralized** app loader and **success/error notifications** (not one-off ad hoc toasts everywhere without reason)
- [ ] **Lazy loading** for routes or heavy chunks where appropriate
- [ ] **Memoization** (`useMemo`, `useCallback`, `React.memo`) where profiling or clear re-render cost justifies it — not blanket everywhere

## 7 — Internationalization and data

- [ ] User-visible strings use **`t()`** (or project i18n helper), not raw literals in components
- [ ] **Pagination, sorting, filtering** implemented **server-side** for list endpoints (FE sends params; does not fake full-grid sort on huge datasets)

## 8 — Observability

- [ ] Monitoring/logging hooks or client reporting exist where the app tracks errors and performance (per project setup)
- [ ] Errors surface to users appropriately and are trackable in tools the team uses

## 9 — Comments and maintainability

- [ ] **Comments** explain non-obvious **why**, not narrate obvious **what**
- [ ] Complex business rules or edge cases documented near the logic

## 10 — Architecture (light touch)

- [ ] Imports and module boundaries respect feature/shared split
- [ ] No circular dependencies introduced
- [ ] Branch/PR workflow: flag only if the change clearly violates architect-recommended process (otherwise out of scope for code review)

## Reminders

- Focus on changed code; expand to shared utilities only when behavior depends on them.
- RTL/LTR is handled by the component library — flag only if custom layout breaks bidi.
- Branching/PR strategy is a team process: mention only when the change violates agreed workflow.
- This checklist backs `verify-and-test`'s frontend cross-check, not a repeated per-batch verification (see this plugin's dropped-per-batch-verify design).

## See also

- `review-examples.md` — example review outputs using this checklist
- `../api-contracts/SKILL.md` — the contract format types/DTOs are checked against
- `../owasp-security/SKILL.md` — client-side security section
