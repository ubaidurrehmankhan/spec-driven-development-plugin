# Module & Migration Patterns

## Module Structure — same app, not a new deployable

Remember the plugin-wide default: every module below lives in the **same
NestJS application**. `imports: [OtherModule]` is how cross-module access
happens — never a network client, never a separate `main.ts`.

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { RoleGuard } from '../common/guards/role.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category])],
  controllers: [ProductController],
  providers: [ProductService, RoleGuard],
  exports: [ProductService],
})
export class ProductModule {}
```

### Key Rules

- Register ALL entities used by this module in `TypeOrmModule.forFeature([])`
- Register `RoleGuard` in providers if any controller endpoint uses it
- Export the service if other modules need to call its methods — see [internal-service-interface-patterns.md](internal-service-interface-patterns.md) for the full cross-module DI pattern and how to avoid circular module dependencies
- Import other modules (not services) when cross-module access is needed

### Registering in App Module

After creating the module, import it in `src/app.module.ts`:

```typescript
import { ProductModule } from './product/product.module';

@Module({
  imports: [
    // ... existing modules
    ProductModule,
  ],
})
export class AppModule {}
```

---

## Migration Patterns

See `../database-design/SKILL.md`'s Migrations section for the underlying
principle (safe, backward-compatible, generated-not-hand-synced) before
applying the TypeORM specifics below.

### Engine-agnostic rule

Migrations must run on **any** SQL engine the team supports (MySQL, Postgres, SQL Server, SQLite). Follow this order of preference:

1. **Generate, don't hand-write.** Use `typeorm migration:generate` — TypeORM inspects the entity diff and emits the correct SQL for the configured engine. This is the safest default.
2. **When writing manually, use TypeORM's schema builder** (`queryRunner.createTable(new Table({...}))`, `queryRunner.addColumn(...)`, `queryRunner.createForeignKey(...)`, etc.). The schema builder emits engine-appropriate SQL.
3. **Drop to raw SQL only when no abstraction fits** — e.g., data backfills, engine-native operations (partitions, extensions, custom types). When you do, gate the migration with the target engine in mind and add a comment explaining why.

Never write migration examples that only run on one engine (backtick-quoted identifiers, `ENGINE = InnoDB`, `datetime(6)` literals, `SERIAL`, `tinyint(1)`) unless the project has explicitly declared a single engine and documented that choice.

### File Naming

`src/migrations/<timestamp>-<PascalCaseName>.ts`

Timestamp format: Unix epoch milliseconds from `Date.now()` — the TypeORM CLI writes this automatically. Name describes the change: `AddCategorySystem`, `CreateOrdersTable`, `AddStockIndexToProducts`.

### Preferred — Generated Migration

Run from the backend root after editing an entity:

```bash
npx typeorm migration:generate src/migrations/CreateProductsTable -d src/data-source.ts
```

TypeORM writes a file with engine-appropriate `up()` and `down()` based on the entity metadata vs the current DB schema. Commit the generated file as-is — do not edit it unless you have a specific reason (e.g., splitting schema from data changes). The emitted SQL will differ between MySQL and Postgres but runs identically from the app's perspective.

### Manual — Schema Builder (portable)

When `migration:generate` cannot express what you need (rare), hand-write using the schema builder. **Do not use raw SQL** — the schema builder handles quoting, types, and foreign-key syntax per engine.

```typescript
import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateProductsTable1740000000000 implements MigrationInterface {
  name = 'CreateProductsTable1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'products',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'price', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'stock', type: 'int', isNullable: false, default: 0 },
          { name: 'imageUrl', type: 'varchar', length: '512', isNullable: true },
          { name: 'categoryId', type: 'uuid', isNullable: true },
          // Timestamp columns — no `default:` here. `@CreateDateColumn` /
          // `@UpdateDateColumn` on the entity populate these at the ORM
          // layer, so the same migration runs cleanly on MySQL, Postgres,
          // SQL Server, and SQLite without engine-specific default SQL.
          { name: 'createdAt', type: 'timestamp', isNullable: false },
          { name: 'updatedAt', type: 'timestamp', isNullable: false },
          { name: 'deletedAt', type: 'timestamp', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'products',
      new TableIndex({ name: 'IDX_products_stock', columnNames: ['stock'] }),
    );
    await queryRunner.createIndex(
      'products',
      new TableIndex({ name: 'IDX_products_deletedAt', columnNames: ['deletedAt'] }),
    );
    await queryRunner.createForeignKey(
      'products',
      new TableForeignKey({
        columnNames: ['categoryId'],
        referencedTableName: 'categories',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'NO ACTION',
        name: 'FK_products_categoryId',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('products', 'FK_products_categoryId');
    await queryRunner.dropIndex('products', 'IDX_products_deletedAt');
    await queryRunner.dropIndex('products', 'IDX_products_stock');
    await queryRunner.dropTable('products');
  }
}
```

Notes:
- `type: 'uuid'` — TypeORM maps to `uuid` on Postgres, `char(36)` / `varchar(36)` on MySQL, etc.
- `type: 'timestamp'` — portable. TypeORM emits the right native type.
- **Do not set a `default:` expression on timestamp columns** in the migration. `CURRENT_TIMESTAMP` is not universally portable (SQL Server wants `GETDATE()`, Oracle wants `SYSTIMESTAMP`). Let `@CreateDateColumn` / `@UpdateDateColumn` on the entity populate the values at the ORM layer — that is the engine-agnostic path this skill already mandates for entities.
- No backticks, no `ENGINE =`, no `datetime(6)` literals.

### Adding a Column

```typescript
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.addColumn(
    'products',
    new TableColumn({ name: 'categoryId', type: 'uuid', isNullable: true }),
  );
  await queryRunner.createForeignKey(
    'products',
    new TableForeignKey({
      columnNames: ['categoryId'],
      referencedTableName: 'categories',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
      name: 'FK_products_categoryId',
    }),
  );
}

public async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.dropForeignKey('products', 'FK_products_categoryId');
  await queryRunner.dropColumn('products', 'categoryId');
}
```

### Data Migrations (backfills)

Keep **schema** and **data** changes in **separate** migrations. A schema migration that silently updates rows makes rollback risky and obscures intent.

```typescript
// 1740000001000-BackfillProductCategory.ts  (data-only)
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.manager.update(
    'products',
    { categoryId: null },
    { categoryId: /* default id */ 'default-category-id' },
  );
}

public async down(queryRunner: QueryRunner): Promise<void> {
  // Intentional no-op: backfills are rarely reversible.
  // Document why in a comment instead of leaving this blank.
}
```

Prefer `queryRunner.manager` (repository/manager API) over raw SQL for data migrations too — it is portable and type-safe.

### Key Rules

- **Prefer `typeorm migration:generate`** — least error-prone, always engine-correct.
- When hand-writing, **use the schema builder** (`Table`, `TableColumn`, `TableForeignKey`, `TableIndex`, `queryRunner.addColumn`, etc.) — it emits engine-appropriate SQL.
- **Avoid raw SQL in committed migrations.** If you absolutely must, add a comment explaining why no abstraction fits, and note any engine assumption (e.g. "Postgres-only: uses `jsonb_set`").
- **Always write both `up()` and `down()`** — migrations must be reversible, or the `down()` must contain an explicit "intentional no-op" comment with the reason.
- **One logical change per migration.** Don't mix unrelated table changes.
- **Separate schema migrations from data migrations** — different files, different review posture.
- **Foreign key naming**: `FK_<table>_<column>`.
- **Index naming**: `IDX_<table>_<column>`.
- **Always index `deletedAt`** for soft-delete filtering.
- **Do not include engine-specific clauses** (`ENGINE = InnoDB`, `CHARACTER SET`, `SERIAL`, `CLUSTERED`) in committed migrations unless the project is explicitly single-engine and that is documented.

### CLI cheat sheet

```bash
# Generate a migration from entity diff (preferred)
npx typeorm migration:generate src/migrations/<Name> -d src/data-source.ts

# Create a blank migration template (use when generate can't help)
npx typeorm migration:create src/migrations/<Name>

# Run pending migrations
npx typeorm migration:run -d src/data-source.ts

# Revert the last migration
npx typeorm migration:revert -d src/data-source.ts
```

## See also

- [internal-service-interface-patterns.md](internal-service-interface-patterns.md) — the DI pattern for `imports`/`exports` between modules in this modular monolith
- `SKILL.md` — modular monolith as the default target architecture
- `../database-design/SKILL.md` — framework-agnostic migration/transaction/concurrency principles this file's TypeORM code implements
