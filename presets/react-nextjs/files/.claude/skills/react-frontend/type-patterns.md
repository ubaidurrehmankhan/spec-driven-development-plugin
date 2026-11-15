# TypeScript Type Patterns

Types must be the single source of truth on the frontend. They mirror the
backend's `docs/contracts/*.contract.md` DTOs exactly (see `../api-contracts/SKILL.md`) —
not a guessed shape, and not the backend entity shape if the contract's
response DTO differs from it.

## File Location

```
src/types/<name>.ts        — one file per domain entity
src/types/index.ts         — barrel export (optional)
src/types/common.ts        — shared types (pagination, API response wrapper)
```

## Response Types (match the contract's response shape)

```typescript
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  category?: Category;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Rules:
- Use `string` for UUIDs and date fields (ISO strings from backend)
- Use `number` for all numeric fields including decimals
- Use `?` for optional/nullable fields and included relations
- Use the exact field names the contract documents — no renaming

## Success/Error Envelope

Every contract states its envelope once, at the top of the file (see
`../api-contracts/SKILL.md`'s template). Mirror it once in `common.ts` and
reuse everywhere rather than re-typing per entity:

```typescript
// src/types/common.ts
export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  message: string;
  meta?: { traceId?: string };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

## Request Types (match the contract's request DTO)

```typescript
export interface CreateProductRequest {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  isActive?: boolean;
}

export type UpdateProductRequest = Partial<CreateProductRequest>;
```

Rules:
- Only include fields the contract says the backend accepts (no `id`, `createdAt`, etc.)
- Use `Partial<>` for update types — mirrors the backend's `PartialType()`
- Mark optional fields with `?` matching the contract's Request table

### Role-restricted request fields

If the contract's endpoint carries a "Role-boundary note" (see
`../api-contracts/SKILL.md`), the frontend type still declares every field
the endpoint documents — the type itself does not need branching. What
matters is that the **form/UI only renders and enables the fields the
current user's role may set**, matching whichever mechanism the note
describes (separate routes, a role check gating a field's visibility, etc.).
Don't build a UI that sends fields the backend will reject or silently
strip — check the note before assuming every field is universally editable.

## List/Paginated Response

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

Put this in `src/types/common.ts` and reuse across all list endpoints. If
the contract's envelope nests pagination differently (e.g. under `meta`
rather than top-level), match the contract exactly rather than this default
shape.

## Filter/Query Params

```typescript
export interface ProductFilters {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}
```

Rules:
- All filter fields are optional
- Match the query parameter names the contract documents
- Use union types for known enum values (`'ASC' | 'DESC'`)

## Enum Mirroring

If the contract documents enums, mirror them as TypeScript union types or const objects:

```typescript
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;
```

Rules:
- Prefer union types for type-checking
- Use const objects when you need to iterate or display labels
- Values must match the contract's enum values exactly

## API Error Response

```typescript
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}
```

Match whatever error shape the contract's Error Codes Reference documents.

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Response entity | `PascalCase` noun | `Product`, `Order`, `Category` |
| Create request | `Create<Entity>Request` | `CreateProductRequest` |
| Update request | `Update<Entity>Request` | `UpdateProductRequest` |
| Filters/params | `<Entity>Filters` | `ProductFilters` |
| Paginated list | `PaginatedResponse<Entity>` | `PaginatedResponse<Product>` |

## What NOT to Do

- Do NOT add display logic (formatting, labels) in types — that belongs in components or utils
- Do NOT create separate types that duplicate the contract's DTOs with different names
- Do NOT use `any` or `object` — always define the shape
- Do NOT add frontend-only fields to contract-mirrored types — create a separate extended type if needed
- Do NOT guess a shape when the contract file doesn't exist yet — see `SKILL.md`'s "A frontend batch depends on its API contract"
