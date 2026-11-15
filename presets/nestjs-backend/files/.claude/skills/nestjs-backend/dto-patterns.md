# DTO Patterns

## Create DTO

Use `class-validator` for validation and `@nestjs/swagger` decorators so the generated OpenAPI doc carries the real schema. Match field names to entity columns.

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsNotEmpty,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Widget', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'A small but mighty widget.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 19.99, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 100, minimum: 0 })
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/widget.png', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
```

## Update DTO

**Always import `PartialType` from `@nestjs/swagger`** for DTOs used by controllers. The swagger variant preserves `@ApiProperty` / `@ApiPropertyOptional` metadata so PATCH endpoints still appear complete in the generated OpenAPI doc.

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {}
```

Rule: `@nestjs/mapped-types`'s `PartialType` is only acceptable for **internal** types that never reach a controller (e.g., an intermediate shape passed between services). Anything a controller consumes or returns must use `@nestjs/swagger`'s `PartialType`, `OmitType`, `PickType`, or `IntersectionType`. Importing these from `@nestjs/mapped-types` in a DTO that ends up in Swagger silently drops the API schema.

### Other mapped helpers

All of these are also re-exported from `@nestjs/swagger` and preserve metadata:

| Helper | Use for |
|---|---|
| `PartialType(CreateDto)` | PATCH: every field optional |
| `OmitType(CreateDto, ['secret', 'internal'] as const)` | Drop fields the client shouldn't send or receive |
| `PickType(CreateDto, ['name', 'price'] as const)` | Narrow to a few fields (search params, etc.) |
| `IntersectionType(A, B)` | Compose two DTOs |

## Response DTO

When the API response shape differs from the entity (computed fields, nested transforms, hiding internals), create a response DTO. **Every field needs `@ApiProperty` / `@ApiPropertyOptional`** — Swagger does not infer response fields from types alone.

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'Widget' })
  productName: string;

  @ApiProperty({ example: 2, minimum: 1 })
  quantity: number;

  @ApiProperty({ example: 19.99 })
  unitPrice: number;

  @ApiProperty({ example: 39.98 })
  lineTotal: number;
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty({ example: 'Paid' })
  status: string;

  @ApiProperty({ type: [OrderItemDto] })
  items: OrderItemDto[];

  @ApiProperty({ example: 39.98 })
  subtotal: number;

  @ApiProperty({ example: 0 })
  discountAmount: number;

  @ApiProperty({ example: 39.98 })
  finalAmount: number;

  @ApiProperty({ example: '2026-04-22T10:15:30.000Z' })
  createdAt: string;
}
```

For array responses, declare the item type: `@ApiProperty({ type: [ItemDto] })`.

## Nested Object Validation

For nested objects (e.g., shipping address), create a separate DTO and use `@ValidateNested()` + `@Type()` from `class-transformer`. Decorate with `@ApiProperty` so Swagger renders the nested schema.

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, ValidateNested } from 'class-validator';

export class ShippingAddressDto {
  @ApiProperty({ example: '123 Main St' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: 'Karachi' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Sindh' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '74000' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: 'PK' })
  @IsString()
  @IsNotEmpty()
  country: string;
}

export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cartId: string;

  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @ApiProperty({ example: 'pm_card_visa' })
  @IsString()
  paymentMethodId: string;
}
```

## Specific validators — prefer over `@IsString`

Reach for the specific validator whenever the field has a well-known shape. It gives a better error message and documents intent:

| Field kind | Validator |
|---|---|
| Email | `@IsEmail()` |
| URL | `@IsUrl()` |
| Phone number | `@IsPhoneNumber('PK')` (or target country code) |
| Date string | `@IsISO8601()` |
| Enum | `@IsEnum(SomeEnum)` + `@ApiProperty({ enum: SomeEnum })` |
| UUID | `@IsUUID()` |
| IP address | `@IsIP()` |
| JSON blob | `@IsJSON()` |

## Role-based DTO validation — the decision rule

Whenever a spec restricts some fields of a shared endpoint to specific roles
(e.g. only Owner/Manager may set a field that Analyst should never be able
to send), don't reach for an ad-hoc check. The authoritative decision rule
lives in **`../owasp-security/SKILL.md` section 2** — read it before
deciding how to shape the DTO. It classifies two situations:

- A single DTO/endpoint reachable by multiple roles, where the DTO silently
  accepts higher-role fields with **no per-role branching at the HTTP
  boundary** → **BLOCKER**.
- A single DTO/endpoint where the *only* role that can reach it at all is
  enforced by an endpoint-level rights guard (e.g. `@RequireRight('manage_projects')`)
  and the lower-privileged role has no path to the endpoint → **SAFE**, the
  guard is sufficient; no per-field branching needed.

This skill's job is just the NestJS-specific mechanics for the branching
case. Two concrete patterns:

### class-validator groups

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  // Only validated (and should only be persisted) when the request is
  // processed with the 'owner' group active — see the controller/pipe below.
  @ApiPropertyOptional({ description: 'Owner/Manager only' })
  @IsOptional({ groups: ['owner'] })
  @IsNumber({}, { groups: ['owner'] })
  @Min(0, { groups: ['owner'] })
  contractValue?: number;
}
```

```typescript
// In the controller or a custom pipe — select the group from the caller's role
@Patch(':id')
update(
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ValidationPipe({ groups: [request.user.role === 'owner' ? 'owner' : 'default'] }))
  dto: UpdateContractDto,
) {
  return this.service.update(id, dto, request.user);
}
```

The service must still re-check the role before persisting a
group-restricted field — `class-validator` groups control validation, not
whether the field is stripped from the parsed object when the wrong group
is used. Pair this with `whitelist: true` /explicit field allow-listing in
the service if the group mechanism alone isn't enough for the spec's
guarantee.

### Discriminated union DTO

```typescript
import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class OwnerUpdateContractDto {
  @ApiProperty({ enum: ['owner'] })
  @IsIn(['owner'])
  role: 'owner';

  @ApiProperty()
  @IsNumber()
  contractValue: number;
}

class AnalystUpdateContractDto {
  @ApiProperty({ enum: ['analyst'] })
  @IsIn(['analyst'])
  role: 'analyst';

  @ApiProperty()
  @IsString()
  note: string;
}

// Controller picks the right class to validate against based on
// `request.user.role`, or a custom pipe inspects `dto.role` and
// re-validates against the matching class — either way, an Analyst-role
// payload structurally cannot carry `contractValue`.
export type UpdateContractDto = OwnerUpdateContractDto | AnalystUpdateContractDto;
```

Prefer the **guard-only / SAFE** case whenever the spec's own access model
already prevents the lower-privileged role from reaching the endpoint —
don't add class-validator groups or a discriminated union where a single
`@RequireRight(...)` guard is the actually-correct, simpler mechanism. See
`../owasp-security/SKILL.md` section 2 for worked examples of both cases,
including the "Analyst never reaches the Save endpoint at all" case that is
SAFE despite the DTO having role-looking optional fields.

## Response serialization — strip sensitive fields

Controllers that return an entity directly will leak any field the entity has (`passwordHash`, internal audit fields). Enforce serialization at two layers:

1. **Entity-level**: mark fields with `@Exclude()` from `class-transformer` if they should never leave the API.

   ```typescript
   import { Exclude } from 'class-transformer';

   @Entity('users')
   export class User {
     @Column()
     @Exclude()
     passwordHash: string;
   }
   ```

2. **App-level**: register `ClassSerializerInterceptor` globally so `@Exclude` is actually applied on responses.

   ```typescript
   // main.ts
   import { ClassSerializerInterceptor } from '@nestjs/common';
   import { Reflector } from '@nestjs/core';

   app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
   ```

3. **Explicit `ResponseDto`** is still preferred when the API shape differs from the entity (computed fields, nested reshaping). `@Exclude` is a safety net, not a replacement.

## Global ValidationPipe configuration

DTOs only work if the `ValidationPipe` is wired with the right options. Register it once in `main.ts`:

```typescript
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,                              // strip fields not declared on the DTO
    forbidNonWhitelisted: true,                   // reject requests that include undeclared fields
    transform: true,                              // plain object → DTO instance (needed for @Type)
    transformOptions: { enableImplicitConversion: true }, // coerce primitives from query strings
    stopAtFirstError: false,                      // collect all field errors at once
  }),
);
```

Without `forbidNonWhitelisted`, clients can pass extra fields and get silent success. Without `transform: true`, `@Type(() => Number)` does nothing.

## Pagination / Sort / Filter DTOs

Lift shared query shapes into `common/dto/` so every list endpoint uses the same contract:

```typescript
// common/dto/pagination-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;
}
```

```typescript
// common/dto/sort-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SortQueryDto {
  @ApiPropertyOptional({ example: 'createdAt' })
  @IsOptional() @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional() @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}
```

Feature DTOs extend these with `IntersectionType`:

```typescript
import { IntersectionType } from '@nestjs/swagger';

export class FindProductsQueryDto extends IntersectionType(
  PaginationQueryDto,
  SortQueryDto,
) {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;
}
```

When a service consumes a sort DTO, **whitelist the column names** — never concatenate `sortBy` into a query directly (SQL injection):

```typescript
const SORTABLE_COLUMNS = new Set(['createdAt', 'name', 'price']);
const sortBy = SORTABLE_COLUMNS.has(query.sortBy ?? '') ? query.sortBy! : 'createdAt';
```

## Key Rules

- Every request field must have **at least one class-validator decorator**.
- Every field must have **`@ApiProperty`** (required) or **`@ApiPropertyOptional`** (optional) so Swagger renders the correct schema.
- Optional fields: put `@IsOptional()` first (so other validators skip when undefined).
- String fields: always add `@MaxLength()` to prevent oversized input.
- Number fields: always add `@Min(0)` for non-negative values; add `@Max(...)` when a business ceiling exists.
- UUID references: `@IsUUID()` + `@ApiProperty({ format: 'uuid' })`.
- Nested objects: `@ValidateNested()` + `@Type(() => NestedDto)` + `@ApiProperty({ type: NestedDto })`.
- **PartialType / OmitType / PickType / IntersectionType MUST come from `@nestjs/swagger`** for any DTO used by a controller — never from `@nestjs/mapped-types` in that context.
- **Naming**: `Create<Name>Dto`, `Update<Name>Dto`, `<Name>ResponseDto`.
- **Prefer specific validators** (`@IsEmail`, `@IsUrl`, `@IsEnum`, `@IsISO8601`) over bare `@IsString`.
- **Strip sensitive fields** via `@Exclude()` + global `ClassSerializerInterceptor`.
- **Whitelist sortable columns** server-side — never trust a client-provided `sortBy` as-is.
- **Role-restricted fields**: apply the decision rule in `../owasp-security/SKILL.md` section 2 before choosing a mechanism — don't default to per-field branching when an endpoint-level guard is already sufficient.

## See also

- `../owasp-security/SKILL.md` section 2 — the authoritative role-based DTO decision rule
- `../api-contracts/SKILL.md` — the "Role-boundary note" required per-endpoint in the HTTP contract whenever a DTO has role-restricted fields
