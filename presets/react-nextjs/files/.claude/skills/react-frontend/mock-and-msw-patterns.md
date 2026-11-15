---
name: mock-and-msw-patterns
description: When and how to add mock/MSW-backed endpoints during React frontend integration, for the case where a frontend batch is running ahead of its backend batch against an already-approved contract. Use inside the react-frontend skill; this is a thin, self-contained treatment (this plugin does not depend on any other plugin's MSW skill).
---

# Mock & MSW Patterns

This plugin allows a frontend batch to start once its `docs/contracts/*.contract.md`
file exists and is approved — even if the backend batch that implements it
hasn't landed yet (see `SKILL.md`'s "A frontend batch depends on its API
contract"). When that's the case, or when the task explicitly asks for
mock-backed development, wire MSW handlers directly from the approved
contract rather than waiting.

## When to reach for this file

- The contract file exists and is approved, but the real backend endpoint isn't deployed/reachable yet.
- The task explicitly asks for mock endpoints, mock data wiring, or backend-independent feature flow.
- Integration tests need a deterministic network layer instead of a live backend.
- An existing mocked endpoint's contract changed (new fields, status codes, error shapes) and the mocks must be updated in lock-step.

## Alignment requirement

MSW handlers **must** import request/response types from `src/types/` — the
same types `type-patterns.md` produces from the contract. Never hand-type a
second, parallel shape inside a handler file; if the handler and the real
hook drift, the mock stops being useful as a contract check.

## Setup (once per project)

```bash
npm i -D msw
npx msw init public/ --save
```

```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import type { Product, CreateProductRequest, PaginatedResponse } from '@/types/product';

const products: Product[] = [
  { id: '1', name: 'Widget', description: 'A widget', price: 19.99, categoryId: 'c1', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

export const handlers = [
  http.get('/api/v1/products', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const body: PaginatedResponse<Product> = {
      data: products,
      total: products.length,
      page,
      limit,
      totalPages: Math.ceil(products.length / limit),
    };
    return HttpResponse.json(body);
  }),

  http.get('/api/v1/products/:id', ({ params }) => {
    const product = products.find((p) => p.id === params.id);
    if (!product) {
      return HttpResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } },
        { status: 404 },
      );
    }
    return HttpResponse.json(product);
  }),

  http.post('/api/v1/products', async ({ request }) => {
    const body = (await request.json()) as CreateProductRequest;
    const created: Product = {
      id: crypto.randomUUID(),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...body,
    };
    products.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
];
```

```typescript
// src/mocks/browser.ts — for the dev server
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
```

```typescript
// src/mocks/server.ts — for tests (Node)
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

Gate the browser worker behind an env flag so it never ships in a production
bundle:

```typescript
// src/main.tsx
async function enableMocking() {
  if (import.meta.env.VITE_ENABLE_MOCKS !== 'true') return;
  const { worker } = await import('./mocks/browser');
  return worker.start({ onUnhandledRequest: 'bypass' });
}

enableMocking().then(() => {
  // render the app
});
```

## Error-path coverage

At least one error handler per critical route when the spec or contract
implies failure UX the component must handle (a documented 404, 409, or
403 — see the endpoint's Errors table in the contract):

```typescript
http.post('/api/v1/products', () => {
  return HttpResponse.json(
    { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
    { status: 400 },
  );
}),
```

## Nested/chained routes

Mock every path segment MSW's path-matching needs, matching the contract's
exact path shape:

```typescript
http.post('/api/v1/projects/:groupId/milestones/:milestoneId/save', ({ params }) => {
  // params.groupId, params.milestoneId — mock a chained-ownership mismatch
  // as a 404 if the test needs to exercise that path (see
  // ../owasp-security/SKILL.md section 1).
}),
```

## What NOT to do

- Do NOT hand-type a second shape for a mock handler when `src/types/` already has it from the contract.
- Do NOT let mocks silently drift from a contract that changed — update handlers in the same batch as the type/DTO change.
- Do NOT ship the mock worker start call unguarded — always gate behind an explicit env flag.
- Do NOT treat a passing mock-backed test as proof the real backend integration works — it only proves the frontend correctly implements the contract as documented; `verify-and-test` still checks the real integration once the backend batch lands.

## See also

- `../api-contracts/SKILL.md` — the contract format handlers must mirror
- `type-patterns.md` — the types both real hooks and MSW handlers import
