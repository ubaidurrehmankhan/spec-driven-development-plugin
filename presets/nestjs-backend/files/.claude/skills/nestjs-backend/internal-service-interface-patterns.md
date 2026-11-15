# Internal Service Interface Patterns

Concrete NestJS code patterns for exporting a service method that another
module calls **in-process** — the modular-monolith counterpart to an HTTP
endpoint. This is the code-level companion to the sibling
`../internal-service-contracts/SKILL.md`, which defines the
`docs/contracts/[module].internal-interface.md` documentation format. Read
that skill for the *documentation* rules; this file is the *implementation*
patterns.

## The shape: an exported service method, not a network call

```typescript
// orders/orders.service.ts (exporting module)
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderGroup } from './entities/order-group.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderGroup)
    private readonly groupRepository: Repository<OrderGroup>,
  ) {}

  /**
   * Whether the given customer has any active (non-expired, non-cancelled)
   * order group in this tenant. Applies the lazy-write Expired check before
   * returning — the consumer never needs to re-check staleness itself.
   *
   * @see docs/contracts/orders.internal-interface.md
   */
  async hasActiveOrders(tenantId: string, customerId: string): Promise<boolean> {
    const count = await this.groupRepository.count({
      where: {
        tenantId,
        customerId,
        status: 'active', // already reflects the lazy Expired transition
      },
    });
    return count > 0;
  }

  async getOrderCounts(tenantId: string, customerIds: string[]): Promise<Map<string, number>> {
    const rows = await this.groupRepository
      .createQueryBuilder('group')
      .select('group.customerId', 'customerId')
      .addSelect('COUNT(*)', 'count')
      .where('group.tenantId = :tenantId', { tenantId })
      .andWhere('group.customerId IN (:...customerIds)', { customerIds })
      .groupBy('group.customerId')
      .getRawMany<{ customerId: string; count: string }>();

    // Return a Map keyed by every requested ID, including zero-result IDs —
    // per the internal-interface doc's "invariants the consumer may assume."
    const result = new Map(customerIds.map((id) => [id, 0]));
    for (const row of rows) {
      result.set(row.customerId, parseInt(row.count, 10));
    }
    return result;
  }
}
```

```typescript
// orders/orders.module.ts (exporting module)
@Module({
  imports: [TypeOrmModule.forFeature([OrderGroup])],
  providers: [OrdersService],
  exports: [OrdersService], // <-- makes it available to importing modules
})
export class OrdersModule {}
```

## Consuming module: import the module, inject the service

```typescript
// billing/billing.module.ts (consuming module)
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { BillingService } from './billing.service';

@Module({
  imports: [OrdersModule], // import the MODULE, not the service directly
  providers: [BillingService],
})
export class BillingModule {}
```

```typescript
// billing/billing.service.ts (consuming module)
import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class BillingService {
  constructor(private readonly ordersService: OrdersService) {}

  async getCustomerSummary(tenantId: string, customerId: string) {
    // In-process call — no HTTP, no network round trip, no separate
    // deployable. Standard NestJS constructor injection.
    const hasActive = await this.ordersService.hasActiveOrders(tenantId, customerId);
    return { customerId, hasActiveOrders: hasActive };
  }
}
```

This is the entire mechanism. There is no gateway, no HTTP client, no
service-discovery layer — that is the point of the modular-monolith default
(see `SKILL.md`).

## Avoiding circular module dependencies

If module A imports module B and module B needs to import module A back
(e.g., two modules each expose a method the other consumes), NestJS will
fail to resolve the dependency graph unless you break the cycle. Two
options, in order of preference:

### 1. Extract the shared piece into a third module

If A and B both need the same underlying data or logic, pull it into a
`shared`/`common` module that both import — neither imports the other.

```typescript
// Before (circular): OrdersModule imports CustomersModule, CustomersModule imports OrdersModule
// After: both import CustomerOrderLookupModule
@Module({
  imports: [TypeOrmModule.forFeature([OrderGroup, Customer])],
  providers: [CustomerOrderLookupService],
  exports: [CustomerOrderLookupService],
})
export class CustomerOrderLookupModule {}
```

### 2. `forwardRef()` — only when a genuine bidirectional dependency exists

```typescript
// orders/orders.module.ts
@Module({
  imports: [forwardRef(() => BillingModule)],
  // ...
  exports: [OrdersService],
})
export class OrdersModule {}
```

```typescript
// orders.service.ts
constructor(
  @Inject(forwardRef(() => BillingService))
  private readonly billingService: BillingService,
) {}
```

Reach for `forwardRef()` only when the two modules have a genuine mutual
dependency that can't be factored out — it's a workaround, not a pattern to
reach for by default. If you find yourself adding `forwardRef()`, first ask
whether one direction of the dependency should instead be an event (see
below) — a true two-way direct dependency between modules is often a sign
the boundary is drawn in the wrong place.

## Where to draw the line: direct call vs. event/queue

Default to a direct in-process method call (as above). Reach for an event
(e.g. a NestJS `EventEmitter2` domain event, or a BullMQ job if the work is
genuinely async/long-running) only when one of these is true:

| Situation | Use |
|---|---|
| Consumer needs the result synchronously to build its own response | Direct method call |
| Consumer needs a value that must be correct *right now* (e.g. a validation check before proceeding) | Direct method call |
| The exporting module needs to notify **multiple, decoupled** consumers that something happened, and doesn't need to know who they are | Event (`EventEmitter2` or similar) |
| The side effect is allowed to happen **eventually**, is retryable, and should survive a process restart | Queue (BullMQ job) — see `service-patterns.md`'s async side-effects section for the commit-then-enqueue risk this introduces |
| The call would trigger a long-running or expensive operation the caller shouldn't block on | Queue |

A direct call that turns into "and then update six other modules' state"
inside the same request is a sign the exporting module is doing too much on
behalf of callers it shouldn't know about — that's when an event decouples
the fan-out. But don't introduce an event bus for a single, synchronous,
always-needed check like `hasActiveOrders()` — that is exactly the
Simplicity Rule test from [`../api-mastery/SKILL.md`](../api-mastery/SKILL.md):
"what concrete failure or invariant does this solve?" A direct call has no
failure mode an event would avoid here, and adds a layer of indirection for
no benefit.

## Testing an exported method and its consumer

See `test-patterns.md`'s "What to Mock in Services" — mock the injected
service the consumer receives, and assert the consumer passes every
argument the internal-interface doc requires explicitly (most commonly
`tenantId` — the doc's "what the consumer must NOT assume" section usually
states the method does not tenant-scope internally).

```typescript
// billing.service.spec.ts
const module = await Test.createTestingModule({
  providers: [
    BillingService,
    { provide: OrdersService, useValue: { hasActiveOrders: jest.fn() } },
  ],
}).compile();
```

## See also

- `../internal-service-contracts/SKILL.md` — the `docs/contracts/[module].internal-interface.md` documentation format this code implements
- `module-and-migration-patterns.md` — module `imports`/`exports` basics
- `SKILL.md` — modular monolith as the default target architecture; never propose extraction unasked
