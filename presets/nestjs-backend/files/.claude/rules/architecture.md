---
paths:
  - "src/**/*.ts"
---

# NestJS architecture (defaults; `.claude/project-profile.md` overrides them)

- **Modules:** one feature per module. A module exports only its service interface. Another module calls it through that interface, never through its repository or entities. Avoid circular imports; if two modules need each other, extract the shared part.
- **Dependency injection:** constructor injection only. No `new Service()`, no service locator, no static state. Request-scoped providers only when the data truly is per-request.
- **Configuration:** read environment variables once, in a config module validated at start-up (zod or joi). Fail fast on a missing or malformed value. Never read `process.env` elsewhere.
- **Errors:** one global exception filter maps domain exceptions to the error model. Services throw domain exceptions, not HTTP exceptions, unless the project profile says otherwise.
- **Cross-cutting:** auth, validation, logging and serialization are guards, pipes, interceptors and filters registered once, not repeated per controller.
- **Background work:** processors are thin and idempotent and call services. A job that can run twice must be safe to run twice.
- **Layer lint:** enforce controller -> service -> repository with `no-restricted-imports` in ESLint (controllers may not import repositories or `typeorm`). See `docs/claude-code/QUALITY-GATES.md`.
- New structural choices get an ADR in `docs/adr/`.
