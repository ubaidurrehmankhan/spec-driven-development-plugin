# Controller Patterns

## Standard Controller Structure

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import JwtGuard from '../auth/jwt-guard';
import { AllowedRoles, RoleGuard } from '../common/guards/role.guard';
import { UserType } from '../common';

@ApiTags('Products')
@ApiBearerAuth()
@Controller({ path: 'products', version: '1' })
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @AllowedRoles(UserType.SUPER_ADMIN)
  @UseGuards(JwtGuard, RoleGuard)
  create(@Body() createProductDto: CreateProductDto): Promise<ProductResponseDto> {
    return this.productService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'List products (paginated, filterable)' })
  @ApiOkResponse({ type: PaginatedResponseDto<ProductResponseDto> })
  findAll(
    @Query() query: FindProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    return this.productService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    return this.productService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @AllowedRoles(UserType.SUPER_ADMIN)
  @UseGuards(JwtGuard, RoleGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, updateProductDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Product not found' })
  @AllowedRoles(UserType.SUPER_ADMIN)
  @UseGuards(JwtGuard, RoleGuard)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productService.remove(id);
  }
}
```

> If the project uses permission-based auth, swap `@AllowedRoles(...) + RoleGuard` for `@RequirePermission('product:create') + PermissionGuard`. Everything else stays the same.

## Key Rules

### Versioning
Always version controllers from day one:
```typescript
@Controller({ path: 'products', version: '1' })
```
Path uses **plural** resource name: `products`, `orders`, `users`.

### Swagger
Every controller must have:
- `@ApiTags('ResourceName')` on the class
- `@ApiBearerAuth()` on the class when any route is protected (renders the "Authorize" button in Swagger UI and tells generated clients to attach a token)
- `@ApiOperation({ summary: '...' })` on each method
- A response decorator per expected outcome:
  - `@ApiOkResponse({ type: <Dto> })` for 200
  - `@ApiCreatedResponse({ type: <Dto> })` for 201
  - `@ApiNoContentResponse()` for 204
  - `@ApiBadRequestResponse()`, `@ApiNotFoundResponse()`, `@ApiUnauthorizedResponse()`, `@ApiForbiddenResponse()` for the error paths the route can actually produce

`@ApiOperation` alone produces a weak OpenAPI doc — the `type` attached to `@ApiOkResponse` is what drives generated clients and contract tests. This is also the shape `../api-contracts/SKILL.md`'s HTTP contract documents per endpoint — keep the Swagger decorators and the contract file in agreement.

### Return types
Every handler must declare `Promise<SomeResponseDto>` (or `Promise<PaginatedResponseDto<SomeResponseDto>>`, or `Promise<void>`). Unannotated handlers drift toward `Promise<any>`, which defeats both the Swagger schema and downstream type safety.

### HTTP status codes
NestJS returns 200 by default for everything except `@Post` (201). Be explicit when the correct status is anything else:
- `@Delete` → `@HttpCode(HttpStatus.NO_CONTENT)` when the handler returns `void`.
- Long-running `@Post` that queues work → `@HttpCode(HttpStatus.ACCEPTED)` (202).
- Idempotent update that "does nothing if already in state" → still 200, but the response body should reflect the no-op.

### Param parsing
Use built-in pipes at the param boundary — don't push this into the service:
- `@Param('id', ParseUUIDPipe)` — reject non-UUID paths with a 400 before the service sees them.
- `@Param('id', ParseIntPipe)` — integer-typed IDs.
- `@Query() dto: QueryDto` — always go through a DTO for query params (see below), never multiple stringly-typed `@Query('x')` args.

### Nested routes — verify chained ownership, not just the param shape

For any route with 2+ path ID segments (`/parent/:parentId/child/:childId/...`),
parsing the IDs (above) is necessary but not sufficient. See
`../owasp-security/SKILL.md` section 1 (Nested/Chained Resource Ownership) —
the service must verify the child ID actually belongs to the parent ID, not
just that both belong to the caller's tenant. Document this verification in
the endpoint's `../api-contracts/SKILL.md` "Chained ownership note."

### Query parameters — always via a DTO
Stringly-typed `@Query('x')` args arrive as `string | undefined` and skip validation. Define a query DTO instead:

```typescript
// dto/find-products-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class FindProductsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
```

`@Type(() => Number)` + global `ValidationPipe({ transform: true })` converts the string query param into a real number — skipping it leaves `page` as `"1"` and arithmetic breaks silently.

### Pagination — standard envelope
Every paginated list endpoint returns the same shape so clients and generated SDKs can rely on it.

```typescript
// src/common/dto/paginated-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedMetaDto {
  @ApiProperty({ example: 137 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 7 }) pageCount: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true }) items: T[];
  @ApiProperty({ type: PaginatedMetaDto }) meta: PaginatedMetaDto;
}
```

Services build the envelope from `findAndCount()`:

```typescript
const [items, total] = await this.productRepository.findAndCount({
  skip: (query.page - 1) * query.limit,
  take: query.limit,
  order: { createdAt: 'DESC' },
});
return {
  items,
  meta: {
    total,
    page: query.page,
    limit: query.limit,
    pageCount: Math.ceil(total / query.limit),
  },
};
```

### Guards
Protected endpoints pair a **JWT guard** with an **authorization guard**. The project's auth model decides which authorization guard to use — do not mix the two models in the same codebase.

**Role-based** (`RoleGuard`):
```typescript
@AllowedRoles(UserType.SUPER_ADMIN)
@UseGuards(JwtGuard, RoleGuard)
```
- `JwtGuard` validates the token.
- `RoleGuard` checks `request.user.role` against `@AllowedRoles(...)`.

**Permission-based** (`PermissionGuard`):
```typescript
@RequirePermission('product:create')
@UseGuards(JwtGuard, PermissionGuard)
```
- `JwtGuard` validates the token.
- `PermissionGuard` checks `request.user.permissions` against the `@RequirePermission(...)` metadata.
- Permission names follow `resource:action` (stable, machine-parseable, safe to expand).

Either guard must be registered in the module's `providers` so Nest can inject its dependencies (role/permission repo, cache, etc.).

An endpoint-level rights guard (e.g. `@RequireRight('manage_projects')`) can
also be the *entire* mechanism that makes a shared DTO safe across roles —
see `dto-patterns.md`'s role-based DTO section and
`../owasp-security/SKILL.md` section 2 for the decision rule on when that's
sufficient versus when per-field branching is required.

Public endpoints (no auth required) omit guards entirely.

### Controller Responsibilities
Controllers should ONLY:
- Extract parameters from the request (`@Body()`, `@Param()`, `@Query()`)
- Delegate to the service
- Return the service result

Controllers should NEVER:
- Contain business logic
- Access repositories directly
- Handle errors (let the service throw, global handler catches)

### Method Naming Convention
| HTTP Method | Controller Method | Service Method |
|-------------|-------------------|----------------|
| POST | `create()` | `create()` |
| GET (list) | `findAll()` | `findAll()` |
| GET (one) | `findOne()` | `findOne()` |
| PATCH | `update()` | `update()` |
| DELETE | `remove()` | `remove()` |

### Route Nesting
For sub-resources, use nested routes:
```typescript
@Get(':id/items')
findOrderItems(@Param('id') orderId: string) {
  return this.orderService.findItems(orderId);
}
```

## See also

- `../api-contracts/SKILL.md` — the HTTP contract format that documents every endpoint's chained-ownership and role-boundary notes
- `../owasp-security/SKILL.md` — sections 1 (chained ownership) and 2 (role-based DTO decision rule)
