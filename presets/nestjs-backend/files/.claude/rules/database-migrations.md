---
paths:
  - "src/migrations/**"
---

# Database migrations (defaults; `.claude/project-profile.md` overrides them)

- A migration is **reversible**: `up` and `down` both work, and `down` is tested once on a scratch database.
- A migration is **immutable once committed** (a hook blocks edits). Fix a mistake with a new migration.
- One entity change and its migration per batch; two batches in one layer that both add a migration need timestamps in batch-id order.
- Name indexes and constraints explicitly and consistently; never rely on generated names.
- Store timestamps in UTC. No `synchronize` outside local experiments.
- Prefer the ORM's schema API; use raw SQL only for what it cannot express (extensions, row-level policies, special column types) and say why in the migration.
- A migration that touches existing data states its backfill strategy and is safe to re-run or clearly guarded.
