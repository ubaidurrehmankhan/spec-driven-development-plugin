# NestJS Backend — Code Review Examples

Use these as templates for structured findings. Adapt names, paths, and patterns to the real project.

> **Profile note**: The transaction examples below use `QueryRunner` as illustration. Use the project's transaction pattern instead (which must carry the data-isolation context if the profile requires it). DTO names like `LoginRequest`/`LoginResponse` are examples — use the project's naming convention.

---

## Example 1: Missing versioning, Swagger, and auth

**Input diff** (simplified):

```typescript
@Controller('orders')
export class OrderController {
  @Get()
  findAll() {
    return this.orderService.findAll();
  }

  @Post()
  create(@Body() body: CreateOrderRequest) {
    return this.orderService.create(body);
  }
}
```

**Review output:**

```
## Code Review Summary (Backend)

**Tests**: Not run
**Lint**: Unknown

### Blocking
- [ ] `order.controller.ts` — [API contract] Controller missing `version` in `@Controller({ path: 'orders', version: '1' })` (or global versioning strategy).
- [ ] `order.controller.ts` — [Security] No guard/permission decorator on `findAll` / `create`. Add route protection per team pattern (`@RequirePermissions`, etc.).
- [ ] `order.controller.ts` — [API contract] Missing `@ApiTags`, `@ApiOkResponse` / `@ApiCreatedResponse` for Swagger.

### Warnings
- [ ] `order.controller.ts` — [DTOs] Handlers should document error responses if the project standard includes them.

### Suggestions
- [ ] Add controller spec smoke tests if the repo requires them.

### What looks good
- DTO used for `create` body.
- Thin controller delegating to service.
```

---

## Example 2: Multi-table write without transaction

**Input diff** (simplified):

```typescript
async approveOrder(id: string) {
  const order = await this.orderRepo.findOne({ where: { id } });
  order.status = 'approved';
  await this.orderRepo.save(order);
  await this.ledgerRepo.insert({ orderId: id, amount: order.total });
}
```

**Review output:**

```
## Code Review Summary (Backend)

### Blocking
- [ ] `order.service.ts` — [Correctness] Updates `orders` and `ledger` without a transaction. Use the project's transaction pattern so partial updates cannot leave inconsistent state.

### Warnings
- [ ] `order.service.ts` — [Architecture] Magic string `'approved'` — prefer enum or constant shared with domain layer.

### Suggestions
- [ ] Consider `Promise.all` only if operations were independent (here they are not — transaction first).

### What looks good
- Loads entity before mutate.
```

---

## Example 3: Hardcoded role and weak DTO

**Input diff** (simplified):

```typescript
@Get('reports')
getReports(@Req() req: Request) {
  if (req.user.role !== 'admin') throw new ForbiddenException();
  return this.reportService.findAll();
}

export class DateRangeQuery {
  from: string;
  to: string;
}
```

**Review output:**

```
## Code Review Summary (Backend)

### Blocking
- [ ] `report.controller.ts` — [Auth] Role string `'admin'` hardcoded. Use permission-based check aligned with role→permission mapping.
- [ ] `date-range.query.ts` — [DTOs] Missing `class-validator` decorators and `@ApiProperty`; add `@IsDateString()` (or project types) for both fields.

### Warnings
- [ ] `report.controller.ts` — [Security] Prefer guard/decorator over inline `if` for authorization consistency.

### Suggestions
(none)

### What looks good
- Dedicated query type instead of anonymous object.
```

---

## Example 4: Clean controller + DTO — positive review

**Input diff** (simplified):

```typescript
@Controller({ path: 'invoices', version: '1' })
@ApiTags('Invoices')
@RequirePermissions(Permission.INVOICE_READ)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @ApiOkResponse({ type: FindManyInvoiceResponse })
  findMany(@Query() query: FindManyInvoiceRequest) {
    return this.invoiceService.findMany(query);
  }
}
```

**Review output:**

```
## Code Review Summary (Backend)

**Lint**: Clean
**Tests**: PASS

### Blocking
(none)

### Warnings
(none)

### Suggestions
- [ ] Ensure rate limiting applied at gateway or controller if invoices are sensitive to scraping (policy-dependent).

### What looks good
- Versioned controller; Swagger tag and response type documented.
- Permission decorator at class level; DTO for query; service delegation.
```

---

## Example 5: Sequential independent calls

**Input diff** (simplified):

```typescript
const a = await this.repoA.findOne({ where: { id } });
const b = await this.repoB.findOne({ where: { id } });
return this.mapper.toDto(a, b);
```

**Review output:**

```
## Code Review Summary (Backend)

### Warnings
- [ ] `…` — [Performance] Independent lookups can run concurrently: `const [a, b] = await Promise.all([...])` if no ordering dependency.

### Suggestions
(none)

### What looks good
- Clear separation before mapping.
```
