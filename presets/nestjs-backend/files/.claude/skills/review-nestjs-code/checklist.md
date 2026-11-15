# NestJS Backend — Code Review Checklist

Walk each section against the changed files.

> **Profile note**: Items marked *(if configured)* apply only when the repo has that tool/hook set up. DTO naming examples are illustrative — use the naming pattern your project profile or `CLAUDE.md` defines. Transaction helpers (`QueryRunner`, `DataSource.transaction`) are examples — use the project's own transaction pattern, which must carry the data-isolation context if the profile requires it.

---

## 1 — Tooling and quality gates

- [ ] Lint: **0** errors and **0** warnings on touched code
- [ ] Unit test coverage **≥ 90%** (team gate — lines, statements, functions, branches)
- [ ] **Prettier** applied (editor + CI)
- [ ] **SonarQube** in CI *(if configured)*; local Sonar clean of new blockers *(if configured)*
- [ ] **DRY** respected; duplication **≤ ~5%** per team/Sonar
- [ ] **Pre-commit** hooks run lint/format on staged files *(if configured)*

## 2 — API surface: versioning, docs, limits, CORS

- [ ] **API versioning** used (`version` in controller config or global prefix strategy)
- [ ] **Swagger**: `@ApiTags`, `@ApiOperation`, `@ApiOkResponse` / `@ApiCreatedResponse` (and errors) on documented endpoints
- [ ] **Rate limiting** applied to public or abuse-prone routes per project policy *(if project policy defines it)*
- [ ] **CORS** restricted to **known origins** (not `*` in production)

## 3 — DTOs and validation

- [ ] Request/response shapes use **DTO classes** with **class-validator** decorators
- [ ] **ValidationPipe** behavior (`whitelist`, `forbidNonWhitelisted`) respected globally or per route
- [ ] DTO **naming** consistent with the project convention (e.g. `LoginRequest`, `LoginResponse`, `CreateXRequest`, `FindManyXResponse` — or the pattern the profile defines)
- [ ] No raw entities returned from controllers when the project mandates mapped responses

## 4 — Security and authorization

- [ ] **Permissions** drive authorization; **no hardcoded role strings** in business logic
- [ ] Guards / decorators applied per route for protected operations
- [ ] Secrets only from **config/env** — never in source
- [ ] Inputs validated — no string-concatenated SQL; parameterized queries

## 5 — Error handling and responses

- [ ] **Global exception filter** maps exceptions to unified HTTP + body shape
- [ ] Domain validation and business rule failures throw **typed domain errors** with **stable codes/messages** (error catalog)
- [ ] No empty `catch`; use `unknown` in catch with narrowing

## 6 — Logging and observability

- [ ] **Centralized logging** of requests: method, path, correlation id — **payload/response** per team policy (avoid logging secrets/PII)
- [ ] Uses Nest `Logger` or project logger — not ad hoc `console.log` in services
- [ ] Errors logged with enough context to debug (id, operation), without sensitive fields

## 7 — Database and transactions

- [ ] **UTC** for all persisted `timestamp` / `timestamptz` fields
- [ ] **Transactions** wrap multi-table writes using the project's transaction pattern (must carry the data-isolation context if the profile requires it)
- [ ] **Pagination + sort + filter** on server for list endpoints
- [ ] **Indexes** considered for new filters/sorts; no obvious N+1 (batching or joins)

## 8 — TypeScript and structure

- [ ] No `any` in new code
- [ ] **Function names** consistent with module conventions (`create`, `update`, `findOne`, …)
- [ ] **Custom decorators** used to DRY repeated param/metadata patterns where applicable
- [ ] **Circular dependency** not introduced between modules

## 9 — Dependency injection

- [ ] Cross-module dependencies follow the **project profile's cross-module rule** (e.g. import the feature module in consumer modules; direct service injection may be restricted)
- [ ] Where the codebase uses interface tokens for services, **inject interfaces** rather than concrete classes

## 10 — Performance

- [ ] **`Promise.all`** (or `allSettled`) for independent DB or HTTP calls
- [ ] No blocking synchronous work on hot paths

## 11 — Data seeding

- [ ] Seeds or fixtures updated when schema or reference data requires it for dev/test

## 12 — Testing

- [ ] Unit tests for changed services/controllers/guards as per project norms
- [ ] Contract or e2e coverage when public API behavior changes

## 13 — Magic values

- [ ] No unexplained numeric/string literals — extract **named constants** or enums
