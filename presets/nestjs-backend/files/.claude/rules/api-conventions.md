---
paths:
  - "src/**/*.ts"
---

# NestJS API conventions (defaults; `.claude/project-profile.md` overrides them)

- **Layers:** controllers do routing, validation and response DTOs only; services hold business logic; repositories hold database access; queue processors are thin and call services. No business logic in controllers, no database access in controllers.
- **Routes:** all under `/api/v1/`. Lists are always paginated, with filtering and sorting done server-side.
- **Input:** every request body, query and param goes through a DTO with `class-validator`. Never trust identifiers from the client for ownership: derive the owner from the authenticated context.
- **Authorization:** check permissions or rights, not role names. Default deny. Where a route nests a child under a parent, fetch the child with the parent in one query and return the same 404 for "missing" and "not yours".
- **Errors:** throw the project's exception type with a domain-specific code; never a generic code and never free text only. Never swallow an error silently; never return a 200 with an error inside.
- **Docs:** keep Swagger decorators and the HTTP contract in step with the code.
- **Logging:** use the project logger, never `console.log`; never log secrets, tokens or personal data.
- **Comments:** only where the reason is not obvious from the code; no ticket or task references in source comments.
