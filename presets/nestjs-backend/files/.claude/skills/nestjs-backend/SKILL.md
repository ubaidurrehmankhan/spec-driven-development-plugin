---
name: nestjs-backend
description: NestJS backend code-generation standards for a modular monolith, folding in the api-mastery reasoning chain. File-by-file order for a feature module — TypeORM entity, reversible migration, class-validator DTOs, injectable service, versioned controller, module registration, and Jest specs — plus internal (non-HTTP) cross-module service-interface patterns, an async-side-effects/outbox note, and a role-based DTO decision pointer. Activate when the user asks to generate, scaffold, add, or implement NestJS backend code; creates a feature module; mentions TypeORM, class-validator, `@Controller`, `@Injectable`, Swagger, Jest specs, or a new NestJS module; or plans/implements a batch in this plugin's spec-driven lifecycle.
metadata:
  phases: [planning, implementation]
  use_when: "File order and patterns when writing TODOs and when building a backend batch"
---

> **Profile preamble** (added when this file was vendored from the spec-driven plugin v0.1.0; everything below it is unchanged from upstream except where listed in `.claude/spec-driven/CHANGES.md`)
> - **Project profile:** before reading or writing any path or name below, load `.claude/project-profile.md` if it exists. Paths and names in this file (`docs/contracts/`, `docs/todos/`, `specs/<folder>/`, `MODULE.md`, `IMPLEMENTATION-LOG.md`, `.claude/templates/`, Jira tool names, branch and commit conventions) are **defaults**; the profile's values win.
> - **Precedence:** the project's CLAUDE.md, its `.claude/rules/`, and the profile override any rule below that conflicts with them. When you follow the project over this file, say so in one line.
> - **Record names:** in this file, `MODULE.md` means the module file `src/<module>/<module>.module.md` (profile key `records.module_file`; a legacy `ANALYSIS.md` or `MODULE.md` is the same file), and `IMPLEMENTATION-LOG.md` means the module's history. Unless the profile sets `records.module_log: file`, there is **no separate per-module log**: read the module file's `Change History` and `Known Limitations / Deferred` instead, and append a `Change History` row (spec id and version, neutral wording, `Decisions` and `Deviations` references) where this file says to append a log row. Spec-level history lives in the per-spec implementation changelog; out-of-box choices go in `docs/DECISIONS.md`.
> - **No profile?** Use the defaults, infer conventions from CLAUDE.md and the code, and ask if a convention is ambiguous.

# NestJS Backend Code Generation

## Before implementing anything: run the api-mastery reasoning chain

This skill folds in [`../api-mastery/SKILL.md`](../api-mastery/SKILL.md) — the
plugin's standalone, framework-agnostic reasoning framework — as a
first-class part of NestJS backend work. Before writing a line of code for
any batch, TODO, or fix, run the chain from that skill's Core Rule:

```
Requirement → risks/invariants → applicable concepts → existing architecture → gaps → minimal safe solution → verification
```

Concretely: read the requirement, check api-mastery's Risk Triggers table
for which concepts apply (money, AI calls, webhooks, jobs, multi-tenant,
schema change, critical state transition), search the repo for existing
support before creating anything (`reuse → extend → create`), identify real
gaps, implement the smallest safe change, then walk api-mastery's Final
Verification checklist before calling the batch done. This is not optional
ceremony — `analyze-spec`, `plan-todo`, and `implement-batch` all
invoke this chain explicitly and expect `../api-mastery/SKILL.md` to be the
place it's defined; this skill's own files (`entity-patterns.md`,
`service-patterns.md`, etc.) apply the reasoning with NestJS/TypeORM code
rather than restating it.

## Modular monolith is the default target architecture

**State this prominently because it changes how every module is planned and
built:** a new module is a new NestJS module in the same application, not a
new deployable service. Cross-module calls are in-process service method
calls — see [internal-service-interface-patterns.md](internal-service-interface-patterns.md)
and the sibling `../internal-service-contracts/SKILL.md` — not network
calls, unless an explicit, separate, human-confirmed decision says
otherwise.

**Never propose microservice extraction unasked.** Never suggest pulling a
module into its own service, adding a message broker between modules, or
introducing a saga framework across modules as part of implementing a spec.
If a module's internal-interface file would make a clean future extraction
seam, note that fact in the internal-interface doc (see
`../internal-service-contracts/SKILL.md`'s "Microservice-Extraction Note")
and stop there — extraction is a separate, explicit architecture decision,
never a side effect of a feature batch. This mirrors api-mastery's Simplicity
Rule: "what concrete failure or invariant does this solve?" — a modular
monolith solves the coordination/deployment overhead this plugin's specs
actually have; a microservice split solves a problem the spec has not stated.

## Quick Start

When generating a backend module, follow this exact order. Each step must compile before moving to the next.

## Generation Order

### Step 1: Entity
Read [entity-patterns.md](entity-patterns.md) and `../database-design/SKILL.md`'s Schema Modeling section, then create `src/<module>/entities/<name>.entity.ts`
- UUID primary key via `@PrimaryGeneratedColumn('uuid')`
- Portable column types only — no engine-specific literals (`datetime(6)`, `tinyint`, native `enum`, backticks)
- Timestamps via `@CreateDateColumn` / `@UpdateDateColumn` / `@DeleteDateColumn` — never hand-rolled defaults
- Decimal transformer for money fields (`from: (v: string) => parseFloat(v)`)
- Soft delete via `@DeleteDateColumn` + `softRemove()` / `softDelete()`
- Indexes on frequently queried columns and on `deletedAt`

### Step 2: Migration
Read [module-and-migration-patterns.md](module-and-migration-patterns.md) and `../database-design/SKILL.md`'s Migrations section, then create `src/migrations/<timestamp>-<Name>.ts`
- Prefer `typeorm migration:generate` so TypeORM emits engine-appropriate SQL
- When hand-writing, use the schema builder (`Table`, `TableColumn`, `TableForeignKey`, `TableIndex`) — not raw engine-specific SQL
- Must be reversible (`down()` implemented, or an explicit "intentional no-op" comment)
- Keep schema and data migrations in separate files

### Step 3: DTOs
Read [dto-patterns.md](dto-patterns.md) then create:
- `src/<module>/dto/create-<name>.dto.ts` — class-validator decorators
- `src/<module>/dto/update-<name>.dto.ts` — PartialType of create DTO
- `src/<module>/dto/<name>-response.dto.ts` — if response shape differs from entity
- If the spec restricts some fields to specific roles, apply the **role-based DTO decision rule** — see `dto-patterns.md`'s dedicated section and `../owasp-security/SKILL.md` section 2 (the authoritative rule; not duplicated here)

### Step 4: Service
Read [service-patterns.md](service-patterns.md) then create `src/<module>/<name>.service.ts`
- Inject repositories via `@InjectRepository()`
- Logger instance per service
- Soft delete via `softDelete()` / `softRemove()` — `@DeleteDateColumn` filters reads automatically
- Cache-aside pattern for read-heavy operations
- Transactions for multi-table writes
- If a method commits a DB write and then triggers an async side effect (queue job, event, webhook), apply `service-patterns.md`'s "Async side effects & the outbox risk" section

### Step 5: Controller
Read [controller-patterns.md](controller-patterns.md) then create `src/<module>/<name>.controller.ts`
- Version 1: `@Controller({ path: '<name>s', version: '1' })`
- Swagger tags and operation decorators
- Guards for protected routes
- Delegate all logic to service

### Step 6: Module
Read [module-and-migration-patterns.md](module-and-migration-patterns.md) then create `src/<module>/<name>.module.ts`
- Register entity in `TypeOrmModule.forFeature([])`
- Register controller, service, guards
- Export service if consumed by other modules — see [internal-service-interface-patterns.md](internal-service-interface-patterns.md) for the cross-module DI pattern and where to draw the line between a direct call and an event/queue

### Step 7: Register in App Module
Add the new module to `src/app.module.ts` imports

### Step 8: Unit Tests
Read [test-patterns.md](test-patterns.md) then create:
- `src/<module>/<name>.service.spec.ts` — mock repos and dependencies
- `src/<module>/<name>.controller.spec.ts` — mock service, override guards

## Verification Checklist

After generating all files:
- [ ] `npx eslint src/<module>/**/*.ts --fix` passes with 0 errors
- [ ] `npm test -- --testPathPattern="src/<module>"` — all tests pass
- [ ] Coverage ≥ 90% for the module
- [ ] Swagger docs render correctly for new endpoints
- [ ] api-mastery's Final Verification checklist walked for this module (see [`../api-mastery/SKILL.md`](../api-mastery/SKILL.md))

## Key Rules

- Never use `any` — use proper types or `unknown`
- Always use class-validator on DTOs
- Always add Swagger decorators to controllers
- Always soft delete (set `deletedAt`, never hard delete)
- Always use the Logger — `private readonly logger = new Logger(XxxService.name)`
- Constants at file top, not magic numbers inline
- A new module is a new NestJS module in this same app — not a new service (see above)

## See also

- [`../api-mastery/SKILL.md`](../api-mastery/SKILL.md) — the full reasoning-chain reference, risk triggers, and verification checklist
- [internal-service-interface-patterns.md](internal-service-interface-patterns.md) — exporting a service method for cross-module in-process calls
- `../database-design/SKILL.md` — framework-agnostic schema/indexing/migration/transaction/concurrency principles this skill's TypeORM code implements
- `../internal-service-contracts/SKILL.md` — the `docs/contracts/[module].internal-interface.md` format this plugin plans and verifies against
- `../api-contracts/SKILL.md` — the HTTP contract format a frontend batch depends on
- `../owasp-security/SKILL.md` — security rules, including the role-based DTO decision rule (§2) and chained-ownership rule (§1)
- `../owasp-security/async-side-effects-and-outbox.md` — full treatment of the commit-then-enqueue risk
