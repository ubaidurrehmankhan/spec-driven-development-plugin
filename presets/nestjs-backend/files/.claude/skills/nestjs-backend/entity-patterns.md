# Entity Patterns

## Engine-agnostic rule

These patterns must work on **any** SQL engine supported by TypeORM (MySQL, MariaDB, Postgres, SQL Server, SQLite, Oracle, etc.). Follow two rules:

1. **Prefer TypeORM's abstract types and built-in decorators** (`@PrimaryGeneratedColumn('uuid')`, `@CreateDateColumn`, `@UpdateDateColumn`, `@DeleteDateColumn`, `@VersionColumn`). TypeORM maps these to the right native column per engine.
2. **Never hard-code engine-specific column types or SQL functions** (`datetime(6)`, `tinyint`, `NOW()`, backtick-quoted identifiers, etc.) in entity definitions. If a column genuinely needs engine-specific behavior, isolate that inside a transformer or a migration and add a comment.

## Standard Entity Structure

```typescript
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('table_name_plural')
export class EntityName {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Domain columns ---

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // --- Timestamps (engine-portable via TypeORM decorators) ---

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp' })
  @Index('IDX_tablename_deletedAt')
  deletedAt: Date | null;

  // --- Optional: optimistic concurrency control ---

  @VersionColumn()
  version: number;
}
```

Why these decorators:
- `@CreateDateColumn` / `@UpdateDateColumn` — TypeORM auto-populates and uses the correct default function per engine (`CURRENT_TIMESTAMP`, `CURRENT_TIMESTAMP(6)`, `now()`, etc.). Do not hand-roll `default: () => 'CURRENT_TIMESTAMP(6)'`.
- `@DeleteDateColumn` — marks the soft-delete column. Calls to `repository.softRemove(entity)` and `repository.softDelete(id)` set it automatically; `repository.find(...)` filters deleted rows automatically. You no longer need to pass `where: { deletedAt: IsNull() }` on every query.
- `@VersionColumn` — **required** on entities with concurrent writes (stock levels, account balances, booking seats, inventory reservations, sequence counters). Without it, a last-write-wins race silently corrupts data. Optional for write-once / single-writer entities. See [`../api-mastery/SKILL.md`](../api-mastery/SKILL.md) B.10 (Concurrency Control) and `../database-design/SKILL.md`'s Concurrency Control section — this is the entity-level half of that concept; a sequence/counter field also needs an atomic increment at the query level, not just this decorator (see `service-patterns.md`).

## Key Rules

### Primary Key
- Always UUID: `@PrimaryGeneratedColumn('uuid')`.
- TypeScript type is `string`. TypeORM maps this to `uuid` on Postgres, `char(36)` / `varchar(36)` on MySQL, etc. — you do not need to choose.
- Do not use bigint/auto-increment integers; they leak scale and are harder to federate.

### Portable Column Types

Use **TypeORM's abstract type names** (the string passed to `type:`). TypeORM chooses the right native column per engine.

| TypeScript | Portable TypeORM type | What TypeORM picks |
|---|---|---|
| `string` (short) | `'varchar'` with `length` | `varchar(n)` everywhere |
| `string` (long) | `'text'` | `text` / `clob` |
| `number` (integer) | `'int'` | `int` / `integer` |
| `number` (big integer) | `'bigint'` | `bigint`. **Returned as a string** by the driver — use a transformer or expect `string` |
| `number` (money) | `'decimal'` with `precision`/`scale` + transformer | `decimal(p,s)` / `numeric(p,s)`. **Returned as string** — transformer required |
| `boolean` | `'boolean'` | `boolean` on Postgres, `tinyint(1)` on MySQL (transparent to your code) |
| `Date` | use `@CreateDateColumn` / `@UpdateDateColumn` / `@DeleteDateColumn` | Engine-appropriate timestamp |
| `Date` (custom) | `'timestamp'` or `'timestamptz'` | `datetime` / `timestamp` / `timestamp with time zone` |
| `object` (structured) | `'jsonb'` (Postgres) or `'json'` (others) | — |
| `enum` | `'varchar'` (length 50) + TS enum | Portable storage; avoids `CREATE TYPE` churn on Postgres |

Rules of thumb:
- Prefer `varchar` + TS enum for enum-like values — avoids Postgres's `CREATE TYPE` + `ALTER TYPE` migration friction and MySQL's native `enum` limitations. Index the column.
- Prefer `'timestamp'` over `'datetime'` — `'datetime'` is MySQL-native; `'timestamp'` maps cleanly on every engine TypeORM supports.
- Never use `'datetime(6)'` as a string type — let `@CreateDateColumn({ type: 'timestamp' })` handle precision per engine.
- For JSON, use `'jsonb'` when the target is Postgres, `'json'` otherwise. A single-engine project can hard-code; a cross-engine project should wrap the column in a transformer.

### Decimal Transformer (Money Fields)

Every driver returns decimal as a string to avoid float loss. Always use a transformer so the TypeScript type stays `number`:

```typescript
@Column({
  type: 'decimal',
  precision: 12,
  scale: 2,
  transformer: {
    to: (value: number) => value,
    from: (value: string) => parseFloat(value),
  },
})
price: number;
```

Same applies to `bigint` if you want a `number` on the TS side (otherwise keep it as `string`).

### Indexes
- Always index `deletedAt` for soft-delete filtering.
- Index foreign key columns.
- Index columns used in `WHERE` or `ORDER BY` frequently.

```typescript
@Column({ type: 'int', default: 0 })
@Index('IDX_products_stock')
stock: number;
```

#See `../database-design/SKILL.md`'s Indexing section for the underlying
principle (index actual access patterns, not speculative ones) before
applying the TypeORM specifics below.

#### Composite indexes
When queries filter by two columns together, prefer a single composite index over two single-column indexes. Declare it at the class level:

```typescript
@Entity('orders')
@Index('IDX_orders_userId_status', ['userId', 'status'])
export class Order {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  status: OrderStatus;
}
```

Column order in the index matters — put the most selective (or equality-filtered) column first.

#### Unique constraints
Use `@Index(..., { unique: true })` for single-column uniqueness, `@Unique(...)` at class level for multi-column uniqueness:

```typescript
@Index('UQ_users_email', { unique: true })
@Column({ type: 'varchar', length: 255 })
email: string;
```

```typescript
@Entity('memberships')
@Unique('UQ_memberships_user_org', ['userId', 'orgId'])
export class Membership { ... }
```

Declaring uniqueness on the entity makes TypeORM emit the correct constraint in generated migrations — don't hand-write a unique index in the migration file alone.

### Index Naming Convention
- Index: `IDX_<tablename>_<columnName>` — e.g., `IDX_products_stock`.
- Composite: `IDX_<tablename>_<col1>_<col2>` — order matches column order.
- Unique: `UQ_<tablename>_<column(s)>` — e.g., `UQ_users_email`.
- Foreign key: `FK_<tablename>_<column>` — e.g., `FK_products_categoryId`.
All portable across engines.

## Relations

### ManyToOne (child side)
```typescript
@Column({ type: 'uuid', nullable: true })
categoryId: string | null;

@ManyToOne(() => Category, (category) => category.products)
@JoinColumn({ name: 'categoryId' })
category: Category;
```

On engines without a native `uuid` type (e.g., MySQL), TypeORM stores this as `char(36)`/`varchar(36)` automatically. Do not hard-code `varchar(36)`.

### OneToMany (parent side)
```typescript
@OneToMany(() => Product, (product) => product.category)
products: Product[];
```

### OneToMany with Cascade
```typescript
@OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
items: OrderItem[];
```

### Eager vs lazy vs explicit relations

TypeORM offers three ways to load a relation. Pick deliberately — each has a failure mode:

| Mode | How | When to use | Failure mode |
|---|---|---|---|
| **Explicit** (default, recommended) | `find({ relations: ['category'] })` per-query | Almost always | None — you opt in per call |
| **Eager** | `@ManyToOne(..., { eager: true })` | Only for relations loaded on >90% of reads AND cheap (single row, indexed FK) | Every `find()` joins the relation, even when it's not used — fan-out on lists |
| **Lazy** | Field typed as `Promise<Category>` | Rarely — trades one query for N+1 if iterated | `for (const p of products) await p.category` is N+1 |

Default to explicit. Only mark `eager: true` when you've confirmed the relation is always consumed — otherwise a `findAll` on a hot endpoint quietly pulls in every parent every time.

### Circular relations — use type refs

When two entities reference each other (`User` ↔ `Post`), import types with `type`-only imports and use the arrow-function target in the decorator to avoid TDZ issues:

```typescript
import type { Post } from '../post/post.entity';

@OneToMany(() => require('../post/post.entity').Post, (post: Post) => post.author)
posts: Post[];
```

Or simpler: restructure so only one side holds the decorator-level reference (the `@ManyToOne` child), and expose the other side via a repository method.

## Enums

Define enums above the entity. Store as `varchar` (portable) + TS enum, index if queried:

```typescript
export enum OrderStatus {
  PENDING = 'Pending',
  PAID = 'Paid',
  SHIPPED = 'Shipped',
  DELIVERED = 'Delivered',
  CANCELLED = 'Cancelled',
}

@Entity('orders')
export class Order {
  @Column({ type: 'varchar', length: 50 })
  @Index('IDX_orders_status')
  status: OrderStatus;
}
```

If a project is **single-engine** and the team explicitly opts in, the native `enum` type can be used — but that forces every future environment (test DB, analytics replica, migration rollback) to share that engine. Default to `varchar`.

## Soft Delete Convention

- Use `@DeleteDateColumn` on the entity (see standard structure above).
- Call `repository.softRemove(entity)` or `repository.softDelete(id)` instead of hand-setting `deletedAt = new Date()`.
- `repository.find(...)` automatically filters soft-deleted rows. Use `withDeleted: true` when you genuinely need them.
- Legacy projects that pre-date `@DeleteDateColumn` can keep the manual column + `where: { deletedAt: IsNull() }` pattern — but new entities should use the decorator.

## A status field that transitions lazily on read

If a spec describes a status that changes only when a row is *read* (e.g. an
"Expired" state that becomes true the next time anyone fetches the row,
rather than via a write or a scheduled job), that is a distinct edge case —
see `../spec-driven-workflow/SKILL.md`'s Edge Case Checklist for the
concurrency question this raises (two concurrent reads racing to perform the
transition). Don't model this as a plain `@Column` with application code
that mutates it opportunistically without considering that race.

## Verification

- [ ] All timestamp columns use `@CreateDateColumn` / `@UpdateDateColumn` / `@DeleteDateColumn` — no manual `default: () => 'CURRENT_TIMESTAMP...'`
- [ ] No engine-specific types (`datetime(6)`, `tinyint`, native `enum`, backticks) in the entity file
- [ ] All `decimal` / `bigint` columns that need `number` on the TS side have a transformer
- [ ] Indexes follow `IDX_<table>_<column>` naming
- [ ] Entity compiles and TypeORM can synchronise against both a MySQL and a Postgres test DB (if cross-engine support is required)
