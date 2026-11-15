# Service Patterns

## Standard Service Structure

```typescript
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    this.logger.log(`Creating product: ${dto.name}`);
    const entity = this.productRepository.create(dto);
    const saved = await this.productRepository.save(entity);
    this.logger.log(`Product created: ${saved.id}`);
    return saved;
  }

  async findAll(): Promise<Product[]> {
    this.logger.log('Fetching all products');
    // Soft-deleted rows are filtered automatically because the entity
    // uses @DeleteDateColumn — no need for `where: { deletedAt: IsNull() }`.
    return this.productRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Product> {
    this.logger.log(`Fetching product: ${id}`);
    const entity = await this.productRepository.findOne({
      where: { id },
    });

    if (!entity) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return entity;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    this.logger.log(`Updating product: ${id}`);
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.productRepository.save(entity);
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing product: ${id}`);
    // softDelete hits the DB directly by ID — no pre-fetch needed.
    // Use softRemove(entity) when cascading soft-delete to relations.
    const result = await this.productRepository.softDelete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
  }
}
```

## Key Patterns

### Logger
Every service must have its own logger:
```typescript
private readonly logger = new Logger(ProductService.name);
```

**What to log** (signal):
- State transitions (`"order confirmed: ${id}"`, `"user suspended: ${id}"`)
- Boundaries with external systems (payment gateway call start + outcome, queue publish, S3 upload)
- Errors, always with context (IDs, correlation ID, caught exception message + stack)
- Unusual branches (cache miss on a hot key, fallback paths, retries)

**What NOT to log** (noise):
- Every CRUD read — `getById` called 1000×/second will drown the log.
- "Entered method X" / "Exited method X" — the call graph is already in the stack trace on failure.
- DTOs or raw request bodies at `info` level — PII leak risk. Log IDs; log full payloads only at `debug` when explicitly enabled.

**Correlation**: include the request's correlation ID (see the rules file for middleware setup) in every error log so one failed request can be traced across services.

### Soft Delete
Never hard delete. Entities declare `@DeleteDateColumn` (see `entity-patterns.md`) and the service uses the repository's built-in soft-delete API:

- `repository.softDelete(id)` — marks deleted without loading the entity. Returns `{ affected, ... }`; check `affected === 0` for not-found and throw `NotFoundException`.
- `repository.softRemove(entity)` — same effect but cascades to relations configured with `{ cascade: true }`. Use when child rows must be soft-deleted too.
- `repository.restore(id)` — un-deletes a row. Wire when the UI supports "undo delete".

`repository.find(...)` and `findOne(...)` **automatically filter out soft-deleted rows**. Only pass `withDeleted: true` when you specifically need them (e.g., admin audit views). Do **not** write `where: { deletedAt: IsNull() }` manually — that's the legacy pattern for entities that pre-date `@DeleteDateColumn`.

### Not Found
Always throw `NotFoundException` with a descriptive message:
```typescript
throw new NotFoundException(`Product with ID ${id} not found`);
```

### Update Pattern
Use `findOne` to validate existence, then `Object.assign` + `save`:
```typescript
const entity = await this.findOne(id);
Object.assign(entity, dto);
return this.productRepository.save(entity);
```

### Nested resources — verify chained ownership in the service, not just the controller

When a service method operates on a path like `/parent/:parentId/child/:childId`,
the service is where the actual chained-ownership check belongs (the
controller only parses the IDs). Fetch the child scoped to both the tenant
**and** the parent ID in one query — don't fetch by `childId` alone and
check `parentId` after the fact in application code, which is easy to get
wrong under refactors:

```typescript
async findMilestone(groupId: string, milestoneId: string, tenantId: string): Promise<Milestone> {
  const milestone = await this.milestoneRepository.findOne({
    where: { id: milestoneId, groupId, group: { tenantId } },
  });
  if (!milestone) {
    throw new NotFoundException('Milestone not found');
  }
  return milestone;
}
```

See `../owasp-security/SKILL.md` section 1 for the full rule this implements.

## Cache-Aside Pattern

For read-heavy data, inject a cache manager and wrap reads.

**Default to the standard `@nestjs/cache-manager` token.** Use a project-specific token only when the team already has a custom cache abstraction wired up.

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

constructor(
  @InjectRepository(Product)
  private readonly productRepository: Repository<Product>,
  @Inject(CACHE_MANAGER)
  private readonly cacheManager: Cache,
) {}

async findAll(): Promise<Product[]> {
  try {
    const cached = await this.cacheManager.get<Product[]>('product:all');
    if (cached) return cached;
  } catch (error) {
    // Surface cache errors instead of swallowing — a silent catch hides
    // serialization bugs, client misconfig, auth failures, etc.
    this.logger.warn(`Cache read failed, falling through to DB: ${(error as Error).message}`);
  }

  const products = await this.productRepository.find({
    order: { createdAt: 'DESC' },
  });

  try {
    // Add ±10% jitter to long TTLs to avoid thundering-herd on simultaneous expiry.
    const baseTtlMs = 3_600_000;
    const jitter = Math.floor(baseTtlMs * (Math.random() * 0.2 - 0.1));
    await this.cacheManager.set('product:all', products, baseTtlMs + jitter);
  } catch (error) {
    this.logger.warn(`Cache write failed: ${(error as Error).message}`);
  }

  return products;
}
```

Invalidate cache on write operations with `.del()` (the `@nestjs/cache-manager` API):
```typescript
try {
  await this.cacheManager.del('product:all');
} catch (error) {
  this.logger.warn(`Cache invalidation failed: ${(error as Error).message}`);
}
```

### Custom cache abstraction variant

If the project already ships its own cache service (e.g. an `ICustomCacheManager` with `get` / `set` / `remove`), inject that instead — but keep the cache-aside shape identical:

```typescript
import { DependencyInjectionKeys } from '../common/di-keys';
import { ICustomCacheManager } from '../common/cache/custom-cache.interface';

@Inject(DependencyInjectionKeys.CACHE_MANAGER)
private readonly cacheManager: ICustomCacheManager;
```

Match the method names (`remove` vs `del`) to whichever abstraction the project uses and update the tests accordingly.

## Transaction Pattern

For multi-table writes, use `DataSource.createQueryRunner()`:

```typescript
constructor(
  private readonly dataSource: DataSource,
) {}

async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const order = queryRunner.manager.create(Order, { userId, ... });
    const savedOrder = await queryRunner.manager.save(Order, order);

    const items = dto.items.map(item =>
      queryRunner.manager.create(OrderItem, { orderId: savedOrder.id, ...item })
    );
    await queryRunner.manager.save(OrderItem, items);

    await queryRunner.commitTransaction();
    return savedOrder;
  } catch (error) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### Pessimistic Locking (for concurrent operations)
```typescript
const product = await queryRunner.manager.findOne(Product, {
  where: { id: productId },
  lock: { mode: 'pessimistic_write' },
});
```

### Atomic counters — increment/decrement at the query level

For a sequence or counter field allocated under concurrency (group
sequence numbers, milestone numbers, seat/slot counts), a read-then-write in
application code is a race even with `@VersionColumn()` on the entity
unless you actually retry on version conflict. Prefer a single atomic
`UPDATE ... WHERE counter = :expected` or a DB-native increment:

```typescript
// ✅ Atomic allocate — single round-trip, no read-modify-write race
const result = await this.dataSource.query(
  `UPDATE project_groups
     SET next_milestone_sequence = next_milestone_sequence + 1
   WHERE id = $1
   RETURNING next_milestone_sequence`,
  [groupId],
);
const allocated = result[0].next_milestone_sequence;
```

```typescript
// ❌ Read-then-write — two concurrent requests can both read the same
// value before either writes, allocating the same sequence number twice
const group = await this.groupRepository.findOne({ where: { id: groupId } });
const next = group.nextMilestoneSequence + 1;
await this.groupRepository.update(groupId, { nextMilestoneSequence: next });
```

This is [`../api-mastery/SKILL.md`](../api-mastery/SKILL.md) B.9 (Concurrency
Control) — verify the actual implementation uses a real atomic operation, not
just that a `@VersionColumn` exists on the entity, since optimistic locking
alone still requires a retry loop to be correct under contention.

### Optional: `typeorm-transactional` decorator

The manual `queryRunner` boilerplate is correct but verbose — a service that writes to three tables ends up with 15 lines of wrap/unwrap around 4 lines of logic, and one forgotten `release()` leaks a connection.

When a project adopts [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional), the same transaction becomes a decorator:

```typescript
import { Transactional } from 'typeorm-transactional';

@Transactional()
async createOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
  const order = await this.orderRepository.save({ userId, ... });
  await this.orderItemRepository.save(dto.items.map(i => ({ orderId: order.id, ...i })));
  return order;
}
```

Setup is one call in `main.ts` (`initializeTransactionalContext()` before `NestFactory.create`). Adopt it per-project, not halfway — mixing manual `queryRunner` with `@Transactional` in the same service is confusing.

## Async side effects & the outbox risk

A common, easy-to-miss shape in a service method:

```
1. Begin DB transaction
2. Write to table(s)
3. Commit
4. Enqueue a BullMQ job / publish an event / call a webhook
```

If step 4 fails after step 3 already committed, the write looks successful
but the downstream effect silently never happens. This is a distinct risk
from the Transaction Pattern above — a DB transaction cannot make a
non-transactional side effect (a queue enqueue) atomic with the commit.

Full treatment — including the Simplicity Rule test for when an outbox is
actually warranted versus overkill, and what "acceptable to lose silently"
looks like — lives in `../owasp-security/async-side-effects-and-outbox.md`.
Cross-referenced here rather than duplicated. The concepts it draws on are
[`../api-mastery/SKILL.md`](../api-mastery/SKILL.md) **B.7** (Idempotency —
can the job run twice safely if it is eventually retried), **B.8** (Delivery
Semantics), and **G.37** (Outbox).

**What this means concretely for a service method:** when a method's plan
(from `plan-todo`, per its Security notes) states a commit-then-enqueue
sequence, implement exactly the recovery behavior the plan specified —
reconciliation job, outbox table, or an explicit "acceptable to lose,
here's why" — and never silently add or omit that behavior on your own
judgment during `implement-batch`.

```typescript
// Example shape — the "reconciliation job" outcome from the plan
async save(groupId: string, milestoneId: string, dto: SaveMilestoneDto): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    await manager.update(Milestone, milestoneId, { ...dto, status: 'saved' });
  });

  try {
    await this.analysisQueue.add('post-save-analysis', { milestoneId });
  } catch (error) {
    // Per the plan's Security note: enqueue failure here is recovered by
    // the `analysis-reconciliation` scheduled job, which re-scans milestones
    // stuck in 'saved' with no analysis result past a threshold. Log, don't
    // throw — the DB write already succeeded and should not be rolled back
    // for a downstream queue failure.
    this.logger.warn(`Enqueue failed for milestone ${milestoneId}, will be reconciled: ${(error as Error).message}`);
  }
}
```

## Error Handling

### Rule: Never Swallow Exceptions

Every `try/catch` must either:
1. **Re-throw** the error (after logging), or
2. **Throw a proper NestJS HttpException** with a meaningful message

```typescript
// ❌ BAD — swallowed exception, caller has no idea something failed
try {
  await this.externalService.charge(userId, amount);
} catch (error) {
  this.logger.error('Payment failed');
}

// ✅ GOOD — log with context, then throw a proper exception
try {
  await this.externalService.charge(userId, amount);
} catch (error) {
  this.logger.error(`Payment failed for user ${userId}: ${error.message}`, error.stack);
  throw new HttpException(
    {
      success: false,
      error: {
        code: 'ERR_PAYMENT_FAILED',
        message: 'Payment processing failed. Please try again.',
      },
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}
```

### When to Use try/catch

| Scenario | Action |
|----------|--------|
| External service calls (payment, email, 3rd-party APIs) | Catch, log with context, throw domain-specific HttpException |
| Database operations that may violate constraints | Catch, throw ConflictException with error code |
| Cache operations (non-critical) | Catch, log, **continue** — cache failure should not break the flow |
| Async side effect after a committed write (see above) | Catch, log, follow the plan's stated recovery behavior — do not roll back the already-committed write |
| Transactions | Catch, rollback, re-throw (see Transaction Pattern above) |
| Validation / business rule violations | Throw directly — no try/catch needed, use guard clauses |

### When NOT to Use try/catch

Don't wrap simple repository calls in try/catch if there's no recovery action. Let the global exception handler catch unexpected errors:

```typescript
// ❌ BAD — unnecessary try/catch, just re-throwing the same error
async findAll(): Promise<Product[]> {
  try {
    return this.productRepository.find();
  } catch (error) {
    throw error;
  }
}

// ✅ GOOD — clean, let global handler catch unexpected DB errors
async findAll(): Promise<Product[]> {
  return this.productRepository.find();
}
```

### NestJS Exception Types

Use the right exception for each situation:

| Exception | HTTP Status | When to Use |
|-----------|-------------|-------------|
| `NotFoundException` | 404 | Entity not found by ID |
| `ConflictException` | 409 | Business rule violation (out of stock, duplicate, etc.) |
| `BadRequestException` | 400 | Invalid input that passed DTO validation |
| `ForbiddenException` | 403 | User lacks permission for this resource |
| `UnauthorizedException` | 401 | Missing or invalid auth token |
| `HttpException` | Custom | External service failures, payment errors |

### Domain Error Format

All domain errors should follow this structure for consistency:

```typescript
throw new ConflictException({
  success: false,
  error: {
    code: 'ERR_PRODUCT_OUT_OF_STOCK',
    message: 'This item is no longer available.',
    details: { productId, requested: quantity, available: product.stock },
  },
});
```

- `code`: Machine-readable, prefixed with `ERR_`, SCREAMING_SNAKE_CASE
- `message`: Human-readable, suitable for display to end users
- `details`: Optional object with contextual data for debugging

## Relations Loading

Load relations **eagerly in the same query** via the `relations` option, or via a QueryBuilder `leftJoinAndSelect`. Never load relations by iterating a list and calling `findOne` per row — that's the classic N+1.

```typescript
// ✅ Single query — loads all products and their categories in one round-trip
await this.productRepository.find({
  relations: ['category'],
  order: { createdAt: 'DESC' },
});

// ❌ N+1 — one query for products, then one query per product for its category
const products = await this.productRepository.find();
for (const p of products) {
  p.category = await this.categoryRepository.findOne({ where: { id: p.categoryId } });
}
```

Soft-deleted rows are filtered automatically by `@DeleteDateColumn` on both sides.

For complex selects (aggregates, partial columns, window functions), drop to the `QueryBuilder`:

```typescript
await this.productRepository
  .createQueryBuilder('product')
  .leftJoinAndSelect('product.category', 'category')
  .where('product.stock > :min', { min: 0 })
  .orderBy('product.createdAt', 'DESC')
  .getMany();
```

## See also

- [internal-service-interface-patterns.md](internal-service-interface-patterns.md) — exporting a method like the ones above for another module to call in-process
- `../owasp-security/SKILL.md` section 1 — chained ownership (the nested-resource verification pattern above)
- `../owasp-security/async-side-effects-and-outbox.md` — full treatment of the commit-then-enqueue risk
- [`../api-mastery/SKILL.md`](../api-mastery/SKILL.md) — B.7, B.8, B.9, B.10, B.11, G.37
